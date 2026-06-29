import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/** Load a fixture file from test/fixtures by name. */
export function fixture(name: string): string {
  return readFileSync(join(here, "fixtures", name), "utf8");
}
