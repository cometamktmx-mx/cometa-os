import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");

const files = {
  register: "src/app/brand/[brandSlug]/pos/register/page.tsx",
  salesApi: "src/app/api/pos/sales/route.ts",
  saleEngine: "supabase/migrations/20260812_loyalty_v4b2a_sale_engine.sql",
  salesHistory: "src/app/brand/[brandSlug]/pos/sales/page.tsx",
  reports: "src/app/brand/[brandSlug]/pos/reports/page.tsx",
  suite: "supabase/tests/pos_split_payments_v1_suite.sql",
};

const source = Object.fromEntries(
  Object.entries(files).map(([name, file]) => [name, read(file)])
);
const checks = [];

function check(name, fn) {
  try {
    fn();
    checks.push({ name, passed: true });
  } catch (error) {
    checks.push({
      name,
      passed: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

check("Register keeps explicit simple and split payment modes", () => {
  assert.match(source.register, /const \[isSplitPayment, setIsSplitPayment\]/);
  assert.match(source.register, /function beginSplitPayment\(/);
  assert.match(source.register, /function returnToSimplePayment\(/);
  assert.match(source.register, />\s*Dividir pago\s*</);
  assert.match(source.register, /code: "wallet"/);
});

check("Register models split lines with front-end-only identity", () => {
  assert.match(source.register, /type SplitPaymentLine = \{[\s\S]*?id: string;[\s\S]*?method: PaymentMethod;[\s\S]*?amount: string;/);
  assert.match(source.register, /id: crypto\.randomUUID\(\)/);
  assert.match(source.register, /payments\.length < 10/);
});

check("Register uses cents for validation and never submits change", () => {
  assert.match(source.register, /function moneyToCents\(/);
  assert.match(source.register, /pendingCents === 0/);
  assert.match(source.register, /cashTenderedCents < amountCents/);
  assert.match(source.register, /payload\.tenderedAmount =/);
  assert.doesNotMatch(source.register, /changeAmount\s*:/);
});

check("Split payload uses the established POST /api/pos/sales payments contract", () => {
  assert.match(source.register, /"\/api\/pos\/sales"/);
  assert.match(source.register, /payments:\s*buildCheckoutPayments\(\)/);
  assert.match(source.register, /method: payment\.method,[\s\S]*?amount: centsToMoney\(amountCents\)/);
  assert.match(source.register, /payment\.method === "cash"/);
});

check("Simple checkout remains a one-payment fast path", () => {
  assert.match(source.register, /if \(!isSplitPayment\) \{[\s\S]*?return \[[\s\S]*?method: paymentMethod,/);
  assert.match(source.register, /setIsSplitPayment\(false\);[\s\S]*?setIsPaymentOpen\(true\);/);
});

check("Cart total changes reset an open split composition before charge", () => {
  assert.match(source.register, /checkoutTotalAtOpenRef\.current/);
  assert.match(source.register, /setIsSplitPayment\(false\);[\s\S]*?setSplitPayments\(\[\]\);[\s\S]*?El total de la venta cambi/);
});

check("API remains the normalizer and V4 remains the sale authority", () => {
  assert.match(source.salesApi, /payments\.length > 10/);
  assert.match(source.salesApi, /admin\.rpc\(\s*"pos_complete_sale_v4"/);
  assert.match(source.salesApi, /tendered_amount:\s*tenderedAmount/);
  assert.match(source.saleEngine, /jsonb_array_elements\(p_payments\)/);
  assert.match(source.saleEngine, /INSERT INTO public\.pos_payments/);
});

check("No primary payment method is introduced on pos_sales", () => {
  const match = source.saleEngine.match(
    /INSERT INTO public\.pos_sales \(([\s\S]*?)\)\s*VALUES \(/m
  );
  assert.ok(match, "pos_sales insertion was not found");
  assert.doesNotMatch(match[1], /\bpayment_method\b/);
});

check("Release does not modify V4 or cash-close SQL", () => {
  const changed = execFileSync(
    "git",
    ["diff", "--name-only", "--", "supabase/migrations"],
    { cwd: root, encoding: "utf8" }
  );
  assert.doesNotMatch(changed, /20260812_loyalty_v4b2a_sale_engine\.sql/);
  assert.doesNotMatch(changed, /cash.*session/i);
});

check("History and ticket render every payment component and cash change", () => {
  assert.match(source.salesHistory, /sale\.payments\.map/);
  assert.match(source.salesHistory, /payment\.tendered_amount/);
  assert.match(source.salesHistory, /payment\.change_amount/);
});

check("Reports label payment-row counts as payments", () => {
  assert.match(source.reports, /transactionsCount\).*pagos/);
});

check("Rollback suite covers all required payment and cash-close cases", () => {
  assert.match(source.suite, /^BEGIN;/m);
  assert.match(source.suite, /^ROLLBACK;/m);
  for (let index = 1; index <= 12; index += 1) {
    assert.match(source.suite, new RegExp(`PASS ${String(index).padStart(2, "0")}`));
  }
  assert.match(source.suite, /pos_close_cash_session/);
  assert.match(source.suite, /payment_method = 'cash'/);
});

const failed = checks.filter((item) => !item.passed);
for (const item of checks) {
  console.log(
    `${item.passed ? "PASS" : "FAIL"} ${item.name}${
      item.detail ? ` — ${item.detail}` : ""
    }`
  );
}

console.log(
  JSON.stringify({
    total: checks.length,
    passed: checks.length - failed.length,
    failed: failed.length,
    allChecksPassed: failed.length === 0,
  })
);

if (failed.length) process.exitCode = 1;
