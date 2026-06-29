import { test } from "node:test";
import assert from "node:assert/strict";

import {
  extractAsinFromUrl,
  keepaUrl,
  withAffiliateTag,
} from "../src/parse.js";

// These run with AMAZON_IN_AFFILIATE_TAG unset, so the default tag "artech-21"
// (see src/constants.ts) is what withAffiliateTag applies.

test("extractAsinFromUrl returns a bare 10-char ASIN unchanged", () => {
  assert.equal(extractAsinFromUrl("B0BDHWDR12"), "B0BDHWDR12");
});

test("extractAsinFromUrl pulls ASIN from a /dp/ URL with tracking params", () => {
  assert.equal(
    extractAsinFromUrl(
      "https://www.amazon.in/Some-Product/dp/B0BDHWDR12/ref=sr_1_1?keywords=x"
    ),
    "B0BDHWDR12"
  );
});

test("extractAsinFromUrl handles /gp/product/ and /product/ paths", () => {
  assert.equal(
    extractAsinFromUrl("https://www.amazon.in/gp/product/B0BDHWDR12"),
    "B0BDHWDR12"
  );
  assert.equal(extractAsinFromUrl("/product/B0BDHWDR12"), "B0BDHWDR12");
});

test("extractAsinFromUrl uppercases a lowercase ASIN found in a URL", () => {
  assert.equal(
    extractAsinFromUrl("https://www.amazon.in/dp/b0bdhwdr12"),
    "B0BDHWDR12"
  );
});

test("extractAsinFromUrl returns undefined for non-ASIN input", () => {
  assert.equal(extractAsinFromUrl("not a url"), undefined);
  assert.equal(extractAsinFromUrl("https://example.com/page"), undefined);
  // A bare lowercase ASIN is NOT matched (bare check is case-sensitive).
  assert.equal(extractAsinFromUrl("b0bdhwdr12"), undefined);
  // Wrong length is rejected.
  assert.equal(extractAsinFromUrl("B0BDHWDR1"), undefined);
});

test("keepaUrl builds the amazon.in (domain code 12) Keepa link", () => {
  assert.equal(
    keepaUrl("B0BDHWDR12"),
    "https://keepa.com/#!product/12-B0BDHWDR12"
  );
});

test("withAffiliateTag appends the default tag to an amazon.in URL", () => {
  const out = withAffiliateTag("https://www.amazon.in/dp/B0BDHWDR12");
  assert.equal(out, "https://www.amazon.in/dp/B0BDHWDR12?tag=artech-21");
});

test("withAffiliateTag overwrites any existing tag param", () => {
  const out = withAffiliateTag(
    "https://www.amazon.in/dp/B0BDHWDR12?tag=someoneelse-21"
  );
  assert.equal(out, "https://www.amazon.in/dp/B0BDHWDR12?tag=artech-21");
});

test("withAffiliateTag leaves non-Amazon URLs untouched", () => {
  const url = "https://keepa.com/#!product/12-B0BDHWDR12";
  assert.equal(withAffiliateTag(url), url);
});

test("withAffiliateTag returns malformed input unchanged", () => {
  assert.equal(withAffiliateTag("not-a-url"), "not-a-url");
});
