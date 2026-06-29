#!/usr/bin/env node
/**
 * Amazon.in MCP Server
 *
 * Three tools for searching and inspecting amazon.in products without paid APIs.
 *  - search_amazon_in: keyword search → ranked listings + cheapest + best-value pick
 *  - get_product:      detailed product page lookup by ASIN or URL
 *  - price_history_link: build a Keepa.com price-history URL for an ASIN
 *
 * Pure HTML scraping via fetch + cheerio. UA rotation + retry on bot-check pages.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { AMAZON_BASE, CHARACTER_LIMIT } from "./constants.js";
import {
  BotBlockedError,
  FetchFailedError,
  fetchHtml,
} from "./scraper.js";
import {
  extractAsinFromUrl,
  keepaUrl,
  parseProduct,
  parseSearch,
} from "./parse.js";
import { rankResults } from "./rank.js";
import type { RankedResults } from "./types.js";

const server = new McpServer({
  name: "amazon-in-mcp-server",
  version: "0.1.1",
});

// ---------- helpers ----------

function friendlyError(err: unknown): string {
  if (err instanceof BotBlockedError) {
    return [
      "Error: Amazon.in served a bot-check / CAPTCHA page on every retry.",
      "Try again in 30-60 seconds, narrow the query, or run from a different network.",
    ].join(" ");
  }
  if (err instanceof FetchFailedError) {
    return `Error: Failed to reach amazon.in (${err.message}). Try again shortly.`;
  }
  if (err instanceof Error) return `Error: ${err.message}`;
  return `Error: Unexpected failure (${String(err)})`;
}

function truncate(text: string, payload: object): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  const truncated = {
    ...payload,
    truncated: true,
    truncation_message: `Response truncated to fit ${CHARACTER_LIMIT} chars; reduce max_results.`,
  };
  return JSON.stringify(truncated, null, 2);
}

// ---------- schemas ----------

const SearchInputSchema = z
  .object({
    query: z
      .string()
      .min(2, "Query must be at least 2 characters")
      .max(200, "Query must not exceed 200 characters")
      .describe("Keyword search query (e.g., 'bluetooth speaker under 2000')"),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(5)
      .describe("Maximum listings to return (1-20). Default 5."),
    include_sponsored: z
      .boolean()
      .default(false)
      .describe("Include sponsored / ad listings. Defaults to false."),
  })
  .strict();

const GetProductInputSchema = z
  .object({
    asin_or_url: z
      .string()
      .min(10)
      .max(2048)
      .describe("Amazon.in ASIN (10 chars) or any product URL containing /dp/<ASIN>"),
  })
  .strict();

const PriceHistoryInputSchema = z
  .object({
    asin_or_url: z
      .string()
      .min(10)
      .max(2048)
      .describe("ASIN or amazon.in URL — Keepa link is built for the amazon.in domain"),
  })
  .strict();

// ---------- search_amazon_in ----------

server.registerTool(
  "search_amazon_in",
  {
    title: "Search Amazon.in",
    description: `Search amazon.in for products by keyword and return ranked listings.

This tool scrapes the public amazon.in search page (no API key needed). It returns a normalised list of results plus two convenience picks:
 - cheapest_in_stock: lowest price among listings showing stock
 - best_value: weighted score = rating × log10(reviews+10) / sqrt(price), requires >=10 reviews

Args:
  - query (string, 2-200 chars): search keywords
  - max_results (int, 1-20, default 5): number of listings to return
  - include_sponsored (bool, default false): include ad listings

Returns: JSON with schema:
  {
    "query": string,
    "total_results": number,    // total listings parsed from the page (pre-slice)
    "returned": number,         // how many are in results[] after applying max_results
    "results": [
      {
        "asin": string,
        "title": string,
        "url": string,
        "image": string,
        "price_inr": number,
        "price_display": string,
        "mrp_inr": number,
        "rating": number,
        "review_count": number,
        "prime": boolean,
        "sponsored": boolean,
        "in_stock": boolean,
        "delivery": string,
        "price_history_url": string
      }
    ],
    "cheapest_in_stock": <SearchResultItem>,
    "best_value": <SearchResultItem>
  }

Error handling:
  - "Amazon served a bot-check page" → wait 30-60s and retry
  - "Failed to reach amazon.in" → transient network or throttling`,
    inputSchema: SearchInputSchema.shape,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async (params) => {
    try {
      const q = encodeURIComponent(params.query);
      const url = `${AMAZON_BASE}/s?k=${q}`;
      const html = await fetchHtml(url);
      let items = parseSearch(html);

      if (!params.include_sponsored) {
        items = items.filter((it) => !it.sponsored);
      }

      const totalParsed = items.length;
      const limited = items.slice(0, params.max_results);
      const ranks = rankResults(limited);

      const output: RankedResults = {
        query: params.query,
        total_results: totalParsed,
        returned: limited.length,
        results: limited,
        ...ranks,
      };

      const text = JSON.stringify(output, null, 2);
      return {
        content: [{ type: "text", text: truncate(text, output) }],
        structuredContent: output as unknown as Record<string, unknown>,
      };
    } catch (err) {
      return { content: [{ type: "text", text: friendlyError(err) }] };
    }
  }
);

// ---------- get_product ----------

server.registerTool(
  "get_product",
  {
    title: "Get Amazon.in Product Detail",
    description: `Fetch a single amazon.in product's details by ASIN or URL.

Scrapes the product page and returns price, MRP, discount %, rating, review count, availability, bullets, brand, seller, delivery info, and a Keepa price-history URL.

Args:
  - asin_or_url (string): plain 10-char ASIN (e.g., "B0BDHWDR12") or any amazon.in product URL containing /dp/<ASIN>

Returns: JSON with schema:
  {
    "asin": string,
    "title": string,
    "url": string,
    "image": string,
    "price_inr": number,
    "price_display": string,
    "mrp_inr": number,
    "discount_percent": number,
    "rating": number,
    "review_count": number,
    "in_stock": boolean,
    "availability": string,
    "bullets": string[],
    "brand": string,
    "seller": string,
    "delivery": string,
    "price_history_url": string
  }

Error handling:
  - "Could not extract ASIN" → input was not a valid ASIN or amazon.in URL
  - "Bot-check page" → retry after a delay`,
    inputSchema: GetProductInputSchema.shape,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async (params) => {
    const asin = extractAsinFromUrl(params.asin_or_url.trim());
    if (!asin) {
      return {
        content: [
          {
            type: "text",
            text:
              "Error: Could not extract ASIN. Pass a 10-character ASIN (e.g., B0BDHWDR12) or an amazon.in URL containing /dp/<ASIN>.",
          },
        ],
      };
    }
    try {
      const url = `${AMAZON_BASE}/dp/${asin}`;
      const html = await fetchHtml(url);
      const product = parseProduct(html, asin);
      const text = JSON.stringify(product, null, 2);
      return {
        content: [{ type: "text", text: truncate(text, product) }],
        structuredContent: product as unknown as Record<string, unknown>,
      };
    } catch (err) {
      return { content: [{ type: "text", text: friendlyError(err) }] };
    }
  }
);

// ---------- price_history_link ----------

server.registerTool(
  "price_history_link",
  {
    title: "Price History Link (Keepa)",
    description: `Build a Keepa.com price-history URL for an amazon.in ASIN. No network call.

Keepa renders historical price charts in the browser using the format keepa.com/#!product/12-<ASIN>, where 12 is the amazon.in domain code. This tool is offline — just a deterministic URL builder.

Args:
  - asin_or_url (string): plain ASIN or amazon.in URL containing /dp/<ASIN>

Returns: JSON
  {
    "asin": string,
    "price_history_url": string
  }`,
    inputSchema: PriceHistoryInputSchema.shape,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (params) => {
    const asin = extractAsinFromUrl(params.asin_or_url.trim());
    if (!asin) {
      return {
        content: [
          {
            type: "text",
            text:
              "Error: Could not extract ASIN. Pass a 10-character ASIN or an amazon.in URL containing /dp/<ASIN>.",
          },
        ],
      };
    }
    const output = { asin, price_history_url: keepaUrl(asin) };
    return {
      content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
      structuredContent: output,
    };
  }
);

// ---------- run ----------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("amazon-in-mcp-server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
// by Aditya Raj Singh — https://adityarajsingh.com/
