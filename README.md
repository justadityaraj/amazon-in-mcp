# amazon-in-mcp

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server for **Amazon.in**. Give your LLM the ability to search Indian Amazon, find the cheapest in-stock listing, surface a balanced "best value" pick by reviews + price, and link out to Keepa for price history — all without paid APIs.

Works with Claude Code, Claude Desktop, Cursor, and any other MCP-compatible client.

## Why

Amazon doesn't have an official affiliate-free search API for amazon.in. Existing MCP servers focus on amazon.com and most need a paid scraping backend (Rainforest, SerpAPI, Keepa key). This server is free, open source, and runs locally via stdio — direct HTML scraping with rotating user agents and bot-check retry.

## Tools

| Tool | What it does |
|---|---|
| `search_amazon_in(query, max_results=5, include_sponsored=false)` | Keyword search → ranked listings + `cheapest_in_stock` + `best_value` picks |
| `get_product(asin_or_url)` | Single-product detail: price, MRP, discount %, rating, reviews, stock, bullets, seller, delivery |
| `price_history_link(asin_or_url)` | Builds a Keepa.com price-history URL for the amazon.in domain (no network call) |

### How "best value" is scored

Among in-stock listings with at least 10 reviews:

```
score = rating × log10(review_count + 10) / sqrt(price_inr)
```

The highest score wins. Cheapest-in-stock is simply the lowest `price_inr` among in-stock items.

## Install

### Option 1 — From npm (once published)

```bash
npx -y amazon-in-mcp-server
```

### Option 2 — From source

```bash
git clone https://github.com/justadityaraj/amazon-in-mcp.git
cd amazon-in-mcp
npm install
npm run build
node dist/index.js
```

## Configure your MCP client

### Claude Code

```bash
claude mcp add amazon-in -- npx -y amazon-in-mcp-server
```

Or for a local clone:

```bash
claude mcp add amazon-in -- node /absolute/path/to/amazon-in-mcp/dist/index.js
```

### Claude Desktop / Cursor / others

Add to your MCP config (e.g., `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "amazon-in": {
      "command": "npx",
      "args": ["-y", "amazon-in-mcp-server"]
    }
  }
}
```

## Example prompts

Once configured, just ask:

- "Find me a good 1TB external SSD on amazon.in under ₹10,000"
- "What's the cheapest in-stock JBL Flex 5 on Amazon India right now?"
- "Get the product details for B0BDHWDR12"
- "Show me the price history for this product: https://www.amazon.in/dp/B09G9FPHY6"

For image-based searches: paste the image into your client and ask the LLM to describe it, then it'll run `search_amazon_in` with the right keywords. The MCP server intentionally doesn't handle images directly — keeps it client-agnostic.

## Output schemas

### `search_amazon_in`

```json
{
  "query": "string",
  "total_results": 0,
  "results": [
    {
      "asin": "B0BDHWDR12",
      "title": "Product name",
      "url": "https://www.amazon.in/dp/B0BDHWDR12",
      "image": "https://...",
      "price_inr": 1299,
      "price_display": "₹1,299.00",
      "mrp_inr": 1999,
      "rating": 4.3,
      "review_count": 12345,
      "prime": true,
      "sponsored": false,
      "in_stock": true,
      "delivery": "FREE delivery Tue, 20 May",
      "price_history_url": "https://keepa.com/#!product/12-B0BDHWDR12"
    }
  ],
  "cheapest_in_stock": { "...same shape..." },
  "best_value":        { "...same shape..." }
}
```

### `get_product`

Same fields as a search result, plus `bullets[]`, `brand`, `seller`, `availability`, `discount_percent`.

## Robustness notes

- **UA rotation**: each request picks a random modern desktop UA (Chrome / Safari / Firefox on Mac / Win / Linux).
- **Retries**: up to 3 attempts with exponential backoff on 5xx, 429, and bot-check pages.
- **Bot-check detection**: scans the first 8 KB of the response for known CAPTCHA / robot markers.
- **Timeout**: 20 seconds per request.
- **No state**: each tool call is independent. Stdio transport, no cookies persisted.

Even with all this, expect ~1-5% of requests to fail with a bot-check during heavy use. Wait 30-60 seconds and retry, or run from a different network.

## How this project is funded

By default, amazon.in URLs returned by this server include the author's Amazon Associates tag (`artech-21`). If you (or your LLM) click through to Amazon and buy something, the author earns a small commission at no extra cost to you. **You pay the same price either way.** This is the only way the project is funded — it stays free, MIT-licensed, and actively maintained.

You can override or disable this at any time with the `AMAZON_IN_AFFILIATE_TAG` environment variable:

| Value | Behavior |
|---|---|
| _unset_ | Uses the author's tag (`artech-21`) — supports the project |
| `yourtag-21` | Uses **your** Amazon Associates tag instead |
| `none`, `off`, `false`, or empty string | Disables affiliate tagging entirely |

Example MCP config that disables the tag:

```json
{
  "mcpServers": {
    "amazon-in": {
      "command": "npx",
      "args": ["-y", "amazon-in-mcp-server"],
      "env": { "AMAZON_IN_AFFILIATE_TAG": "none" }
    }
  }
}
```

Or replace it with your own:

```json
"env": { "AMAZON_IN_AFFILIATE_TAG": "yourtag-21" }
```

## Disclaimer

This tool fetches publicly accessible amazon.in pages for personal research and assistant use. It does **not** bypass authentication, paywalls, or CAPTCHAs — when Amazon serves a bot-check the tool stops and reports the error.

You are responsible for using this in line with Amazon's Terms of Service and any local laws. The author makes no warranty about uptime, accuracy, or fitness for any purpose.

DOM selectors are best-effort and may break when Amazon updates its layout. PRs welcome.

## Roadmap

- [ ] Optional `find_by_image(image_url)` once a stable reverse-image path exists
- [ ] Built-in Keepa API support (with user-supplied key) for real price-history data instead of just a link
- [ ] Filter helpers: `min_rating`, `min_reviews`, `under_price`
- [ ] Smoke-test suite with cached HTML fixtures

## Development

```bash
npm install
npm run dev      # tsx watch
npm run build    # tsc → dist/
npm start        # node dist/index.js
```

Test the server with the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## License

MIT © [Aditya Raj Singh](https://adityarajsingh.com/)

Contributions, bug reports, and selector fixes welcome — open an issue or PR on GitHub.
<!-- by [Aditya Raj Singh](https://adityarajsingh.com/) -->
