<p align="center">
  <img src="./assets/social-preview.png" alt="amazon-in-mcp" width="900" />
</p>

<h1 align="center">amazon-in-mcp</h1>

<p align="center">
  An <a href="https://modelcontextprotocol.io">MCP</a> server that lets your LLM shop on Amazon.in.<br/>
  Best-value, budget and top-rated picks from real statistics. Price history. No paid APIs.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-black.svg"></a>
  <img alt="Node" src="https://img.shields.io/badge/node-%E2%89%A518-black.svg">
  <a href="https://github.com/justadityaraj/amazon-in-mcp/releases"><img alt="Release" src="https://img.shields.io/github/v/release/justadityaraj/amazon-in-mcp?color=black"></a>
  <img alt="MCP" src="https://img.shields.io/badge/MCP-stdio-FF9900.svg">
  <a href="https://coderabbit.ai"><img alt="CodeRabbit Reviews" src="https://img.shields.io/coderabbit/prs/github/justadityaraj/amazon-in-mcp?labelColor=171717&color=FF570A&label=CodeRabbit+Reviews"></a>
</p>

---

## What it does

Three tools your LLM can call against `amazon.in`:

| Tool | What it returns |
|---|---|
| `search_amazon_in(query, max_results=5, page=1, price_sensitivity="medium")` | Listings plus **best value**, **budget**, **top rated** and **cheapest in stock** picks, each with a reason. See [How the picks are chosen](#how-the-picks-are-chosen). `page` fetches deeper result pages. |
| `get_product(asin_or_url)` | Full product detail — price, MRP, discount, rating, reviews, stock, bullets, brand, seller, delivery |
| `price_history_link(asin_or_url)` | A Keepa.com chart URL for the amazon.in domain. No network call. |

No API keys. No accounts. Runs locally over stdio. Direct HTML scraping with an honest user agent and retry on bot-check pages.

---

## Quick start

**1. Install** (Claude Code):

```bash
git clone https://github.com/justadityaraj/amazon-in-mcp.git
cd amazon-in-mcp && npm install && npm run build
claude mcp add amazon-in -- node "$PWD/dist/index.js"
```

**2. Restart your MCP client** (Claude Code, Cursor, Claude Desktop, etc.)

**3. Ask:**

> *"Find me a good 1TB external SSD on amazon.in under ₹10,000. Best value pick."*

Your LLM will call `search_amazon_in`, rank by value, and hand back a real product with current price and a Keepa link for price history.

---

## What it looks like

A real call to `search_amazon_in("wireless mouse", max_results=3)` returns:

```json
{
  "query": "wireless mouse",
  "page": 1,
  "total_results": 14,
  "returned": 3,
  "results": [
    {
      "asin": "B0FDQ9M1SD",
      "title": "Portronics Toad 8 Transparent Wireless Bluetooth Mouse...",
      "url": "https://www.amazon.in/dp/B0FDQ9M1SD?tag=artech-21",
      "price_inr": 499,
      "mrp_inr": 1499,
      "rating": 4.5,
      "review_count": 3587,
      "in_stock": true,
      "delivery": "FREE delivery Thu, 19 Nov",
      "price_history_url": "https://keepa.com/#!product/12-B0FDQ9M1SD",
      "trusted_rating": 4.46
    }
  ],
  "best_value":        { "asin": "B0FDQ9M1SD", "price_inr": 499, "rating": 4.5, "trusted_rating": 4.46, "...": "..." },
  "budget_pick":       { "asin": "B0DGGWC9BV", "price_inr": 248, "rating": 4.0, "trusted_rating": 3.95, "...": "..." },
  "top_rated":         { "asin": "B0FDQ9M1SD", "...": "..." },
  "cheapest_in_stock": { "asin": "B0FF4XBM5N", "price_inr": 229, "rating": 3.7, "...": "..." },
  "frontier":          [ "...cheapest first..." ],
  "why": {
    "best_value":  "Best balance of trusted rating and price at medium price sensitivity: ₹499, 4.5★ from 3,587 reviews (trusted 4.46).",
    "budget_pick": "Cheapest listing about as good as a typical result here or better, with enough reviews to back it: ₹248, 4.0★ from 1,419 reviews (trusted 3.95). ₹251 cheaper than best_value, trusted rating -0.51.",
    "top_rated":   "Highest trusted rating on the page: ₹499, 4.5★ from 3,587 reviews (trusted 4.46). Same listing as best_value."
  }
}
```

`get_product` adds `bullets[]`, `brand`, `seller`, `discount_percent`, `availability`.

---

## Configure your MCP client

<details>
<summary><b>Claude Code</b></summary>

```bash
claude mcp add amazon-in -- node /absolute/path/to/amazon-in-mcp/dist/index.js
```
</details>

<details>
<summary><b>Claude Desktop</b></summary>

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "amazon-in": {
      "command": "node",
      "args": ["/absolute/path/to/amazon-in-mcp/dist/index.js"]
    }
  }
}
```
</details>

<details>
<summary><b>Cursor / Windsurf / others</b></summary>

Same JSON config as Claude Desktop. Drop it into the client's MCP settings file.
</details>

---

## Configuration

All optional. Set these in the `env` block of your MCP client config; defaults preserve the original behavior.

| Env var | Default | Purpose |
|---|---|---|
| `AMAZON_IN_AFFILIATE_TAG` | `artech-21` | Amazon Associates tag on emitted URLs. `none` / `off` / `""` disables. See [funding](#how-this-project-is-funded). |
| `AMAZON_IN_CACHE_TTL_MS` | `90000` | Lifetime of the in-memory page cache (ms). `0` disables caching. |
| `AMAZON_IN_PROXY` | _unset_ | HTTP/HTTPS proxy URL for all requests, e.g. `http://user:pass@host:8080`. |

Example — route through a proxy and shorten the cache to 30 s:

```json
{
  "mcpServers": {
    "amazon-in": {
      "command": "node",
      "args": ["/path/to/dist/index.js"],
      "env": {
        "AMAZON_IN_PROXY": "http://user:pass@proxy.example:8080",
        "AMAZON_IN_CACHE_TTL_MS": "30000"
      }
    }
  }
}
```

---

## Automatic routing (no need to say "use the Amazon MCP")

Once installed, the server tells your client to reach for these tools on its own. It ships MCP **server instructions** (returned in the `initialize` handshake) that instruct the model to use `search_amazon_in` / `get_product` by default for any amazon.in shopping, price, availability, or reviews question — including when you just paste an amazon.in link or an ASIN. The tool descriptions carry the same trigger keywords as a fallback for clients that read tool descriptions but not server instructions.

So you can ask "find me a mechanical keyboard under 3000" or paste a product link and the client routes to this server without you naming it. Note this is model-level guidance surfaced by the host (Claude Code, Claude Desktop, Cursor, …), not a hard protocol guarantee — a client that ignores server instructions and tool descriptions won't be forced to route.

---

## Image search

The server intentionally doesn't accept image input — keeps it provider-agnostic. Instead, paste the image into your LLM client, ask it to describe the product, and it'll call `search_amazon_in` with the right keywords automatically. Works the same in every MCP-capable client.

---

## How the picks are chosen

Each search returns `best_value`, `budget_pick`, `top_rated` and `cheapest_in_stock`, plus `frontier`: every sensible trade-off between price and quality. The picks come from a fixed formula, not a model's opinion, so the same listings always give the same picks. They are computed over every listing on the page, not only the ones returned.

**1. Trust a rating only as far as its reviews allow.** A 4.9★ product with 10 reviews hasn't proven much yet. Each rating is blended with the typical rating on the page, weighted by its review count, then lowered by how uncertain the blend still is:

$$
\text{trusted} = \frac{n \cdot R + m \cdot \mu}{n + m} - \frac{1.645 \times 1.2}{\sqrt{n + m}}
$$

$R$ is the rating and $n$ the review count. $\mu$ is the median rating on the page, and $m$ is worked out from how much the page's ratings really differ: when every listing is rated about the same, ratings count for less. $m$ is never below 20, so a listing needs about 20 reviews before its own rating outweighs the page's. Pages with fewer than 8 rated listings use $\mu = 4.2$ and $m = 20$. The last term is an approximate 95% lower bound: it assumes individual ratings spread by about 1.2 stars and uses the normal value 1.645. It is a heuristic, not a guarantee, and is least accurate for listings with only a handful of reviews.

Example: 4.9★ from 10 reviews scores 4.07, and 4.4★ from 100 reviews scores 4.19. The second one wins. Every listing carries its `trusted_rating`.

**2. Treat price the way people feel it.** Going from ₹100 to ₹200 feels the same as going from ₹10,000 to ₹20,000, so price is compared on a log scale. One formula works for pencils and for monitors.

**3. Drop anything that is both pricier and worse.** What's left is the `frontier`, cheapest first: every step up in price buys a better product.

**4. Pick the best balance.**

$$
\text{score} = \text{trusted} - \lambda \cdot \log_2(\text{price})
$$

$\lambda$ is how many stars you'd give up to pay half the price: `0.05`, `0.15` or `0.3` for `price_sensitivity` `low`, `medium` (default) or `high`.

- `best_value`: highest score.
- `budget_pick`: cheapest listing whose trusted rating is within 0.05 of the middle listing's or better, and that has at least $m$ reviews of its own, so its score comes mostly from real reviews rather than the page average. Left out when no listing qualifies.
- `top_rated`: highest trusted rating, whatever it costs.
- `cheapest_in_stock`: lowest price, no quality bar.

On pages with at least 8 priced listings, listings priced more than 25× above or below the page's median price are marked `price_outlier` and left out of the picks. That keeps an Apple Pencil out of a search for school pencils.

**When the maths isn't sure, it says so.** If the top two scores are within 0.05, the response sets `close_call: true` and adds `runner_up`. Your LLM then decides, using titles and specs. Every pick has a one-line reason in `why`.

**What it can't do:** spot fake reviews, tell whether two products do the same job, or read pack sizes. Those are left to your LLM.

| Idea | From |
|---|---|
| Blending a rating with a prior | Thomas Bayes (1763) and Pierre-Simon Laplace; estimating the prior from the data is Herbert Robbins' empirical Bayes (1956) |
| Penalising uncertainty | Edwin B. Wilson's score interval (1927), popularised for ratings by Evan Miller (2009) |
| Log scale for price | Daniel Bernoulli (1738); the Weber–Fechner law (1834, 1860) |
| Frontier of trade-offs | Vilfredo Pareto (1906); Harry Markowitz's efficient frontier (1952) |
| Quality minus weighted cost | Cost-effectiveness analysis, Weinstein & Stason (1977) |

The constants (1.2, the 95% level, $\lambda$, the 0.05 close-call gap, the 25× outlier ratio) are tuning choices, set in [`src/constants.ts`](src/constants.ts).

---

## Robustness

| | |
|---|---|
| **User agent** | Identifies itself as `amazon-in-mcp-server` instead of posing as a browser. Amazon's Akamai check challenges browser user agents on search |
| **Search fallback** | If `/s` serves a bot-check, search retries once on the mobile `/gp/aw/s` endpoint |
| **Retries** | 3 attempts, exponential backoff on 5xx, 429, and bot-check pages |
| **Bot detection** | Scans first 8 KB for known CAPTCHA / robot markers |
| **Timeout** | 20 s per request |
| **Caching** | Successful pages cached in memory for 90 s (per URL) to skip duplicate fetches; tune with `AMAZON_IN_CACHE_TTL_MS`, `0` disables |
| **Proxy** | Optional — set `AMAZON_IN_PROXY` to route requests through an HTTP/HTTPS proxy when a datacenter IP is blocked |
| **State** | None persisted. Stdio, no cookies, no session — the cache is a short-lived, in-process buffer only |

Expect ~1–5% of requests to fail with a bot-check during heavy use. Wait 30–60 seconds and retry, run from a different network, or set `AMAZON_IN_PROXY`.

---

## How this project is funded

By default, amazon.in URLs returned by this server include the author's Amazon Associates tag (`artech-21`). If you (or your LLM) click through and buy something, the author earns a small commission. **You pay the same price.** This is the only way the project stays free, MIT, and actively maintained.

Override or disable anytime with the `AMAZON_IN_AFFILIATE_TAG` env var:

| Value | Behavior |
|---|---|
| _unset_ | Author's tag (`artech-21`) — supports the project |
| `yourtag-21` | Your own Amazon Associates tag |
| `none` / `off` / `false` / `""` | No tag, raw amazon.in URLs |

Example — your own tag:

```json
{
  "mcpServers": {
    "amazon-in": {
      "command": "node",
      "args": ["/path/to/dist/index.js"],
      "env": { "AMAZON_IN_AFFILIATE_TAG": "yourtag-21" }
    }
  }
}
```

---

## Roadmap

- [ ] Publish to npm so install becomes `npx -y amazon-in-mcp-server`
- [ ] Optional Keepa API support (user-supplied key) for real price-history data
- [ ] Filter helpers — `min_rating`, `min_reviews`, `under_price`
- [ ] Smoke-test suite with cached HTML fixtures

---

## Development

```bash
npm install
npm run dev      # tsx watch
npm run build    # tsc → dist/
npm start        # node dist/index.js
```

Test interactively with the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

Project layout:

```
src/
  index.ts        # MCP server + 3 tool registrations
  scraper.ts      # fetch with retry, bot-check, search fallback, proxy, cache
  parse.ts        # cheerio selectors for search + product pages
  cache.ts        # in-memory TTL + LRU cache
  constants.ts    # UAs, headers, tuning constants, affiliate/proxy/cache config
  types.ts        # SearchResultItem, ProductDetail
```

---

## Disclaimer

Fetches publicly accessible amazon.in pages for personal research and assistant use. Does **not** bypass authentication, paywalls, or CAPTCHAs — when Amazon serves a bot-check the tool stops and reports the error.

You are responsible for using this in line with Amazon's Terms of Service and any local laws. No warranty about uptime, accuracy, or fitness for any purpose. DOM selectors are best-effort and may break when Amazon updates its layout. PRs welcome.

---

## License

MIT © [Aditya Raj Singh](https://adityarajsingh.com/)

Issues, bug reports, and selector fixes welcome — Amazon's DOM shifts every few months, so this will break occasionally and need community help to keep current.
<!-- by [Aditya Raj Singh](https://adityarajsingh.com/) -->
