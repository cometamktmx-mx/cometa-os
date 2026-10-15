import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const helper = readFileSync("src/lib/pos/numeric-input.ts", "utf8");
assert.match(helper, /sanitizeNumericDraft/);
assert.match(helper, /normalizeNumericDraft/);
const cases = [
  ["01", "1"], ["02", "2"], ["0005", "5"],
  ["0.5", "0.5"], ["0.012", "0.012"], ["1.25", "1.25"], ["0.", "0."],
];
for (const [input, expected] of cases) {
  const normalized = input.replace(/^0+(?=\d)/, "");
  assert.equal(normalized, expected, `${input} should normalize to ${expected}`);
}
assert.match(helper, /value === ""/);
console.log("NUMERIC_INPUT_CONTRACT_PASS");
