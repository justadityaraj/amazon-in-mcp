# Changelog

All notable changes to `amazon-in-mcp-server` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [SemVer](https://semver.org).

## [0.1.3] — 2026-07-11

Reliability + coverage. No breaking changes; all new inputs and env vars are
optional and default to prior behaviour.

### Added

- **Deeper search via a `page` parameter** — `search_amazon_in` now accepts
  `page` (1-based, default 1), so callers can look past the first result page
  instead of being capped at whatever Amazon returns on page 1. The fetched
  page is echoed back as a new `page` field on the response.
- **Short-lived in-memory page cache** — identical amazon.in lookups within a
  90s window are served from memory instead of re-fetching, cutting latency and
  bot-check exposure inside tight agent loops. Only successful HTML is cached;
  errors and bot-check pages never are. Tune with `AMAZON_IN_CACHE_TTL_MS`
  (set `0` to disable).
- **Optional upstream proxy** — set `AMAZON_IN_PROXY` to route every request
  through an HTTP/HTTPS proxy (via undici's `ProxyAgent`). Useful when a
  datacenter or CI IP is bot-blocked. Unset means a direct connection, exactly
  as before.

## [0.1.2] — 2026-07-11

Automatic routing. No breaking changes.

### Added

- **Server `instructions` (returned in the `initialize` handshake)** — clients
  now treat these tools as the default for any amazon.in shopping, price,
  availability, or reviews question, including pasted links and ASINs. Users no
  longer have to explicitly name the MCP. This is host-surfaced model guidance,
  not a hard protocol guarantee.

### Changed

- **`search_amazon_in` and `get_product` descriptions** front-loaded with
  default-use trigger keywords, as a fallback for clients that read tool
  descriptions but not server instructions.

## [0.1.1] — 2026-05-24

Reliability + correctness pass. No breaking changes.

### Fixed

- **`search_amazon_in.total_results` was misleading** — it reported the
  post-slice count, so it always equalled `max_results` when enough listings
  matched. It now reports the true parsed count, and a new `returned` field
  carries the post-slice count.
- **MRP shown when not actually a discount** — `mrp_inr` is now only emitted
  when strictly greater than `price_inr`, on both search results and product
  detail. Stops "MRP equals price" noise in tool output.
- **HTTP 403 was a hard fail** — Amazon often serves 403 on first-hit
  fingerprint mismatch, which clears with a UA rotation. 403 is now part of
  the retry path alongside 429 and 503.

### Changed

- **Dropped `Accept-Encoding`, `Cache-Control`, and `Pragma` request headers.**
  Manual `Accept-Encoding` risked garbled responses on brotli; `Cache-Control`
  and `Pragma` aren't sent by real browsers and were routing requests to
  fresher (more bot-check-aggressive) origins. Net effect: lower bot-check
  rate.

## [0.1.0] — 2026-05-19

Initial public release.

- Three tools: `search_amazon_in`, `get_product`, `price_history_link`
- Stdio transport, pure HTML scraping with cheerio
- UA rotation + retry on bot-check pages
- Published to npm (`amazon-in-mcp-server`) and the MCP Registry
  (`io.github.justadityaraj/amazon-in-mcp-server`)
- Default Amazon Associates tag `artech-21`, overridable via
  `AMAZON_IN_AFFILIATE_TAG` env var

[0.1.3]: https://github.com/justadityaraj/amazon-in-mcp/releases/tag/v0.1.3
[0.1.2]: https://github.com/justadityaraj/amazon-in-mcp/releases/tag/v0.1.2
[0.1.1]: https://github.com/justadityaraj/amazon-in-mcp/releases/tag/v0.1.1
[0.1.0]: https://github.com/justadityaraj/amazon-in-mcp/releases/tag/v0.1.0

<!-- by [Aditya Raj Singh](https://adityarajsingh.com/) -->
