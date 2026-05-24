# Changelog

All notable changes to `amazon-in-mcp-server` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [SemVer](https://semver.org).

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

[0.1.1]: https://github.com/justadityaraj/amazon-in-mcp/releases/tag/v0.1.1
[0.1.0]: https://github.com/justadityaraj/amazon-in-mcp/releases/tag/v0.1.0

<!-- by [Aditya Raj Singh](https://adityarajsingh.com/) -->
