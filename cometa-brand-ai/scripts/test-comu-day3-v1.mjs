import { readFile, access } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const files = [
  "supabase/migrations/20260920140000_comu_payments.sql",
  "supabase/migrations/20260920141000_comu_seller_finance.sql",
  "supabase/migrations/20260920142000_comu_payment_rpcs.sql",
  "src/lib/comu/payments.ts",
  "src/app/api/comu/payments/intents/route.ts",
  "src/app/api/comu/stripe/webhook/route.ts",
  "src/app/comu/checkout/page.tsx",
  "src/app/comu/seller/finance/page.tsx",
];
for (const file of files) await access(new URL(file, root));
const source = await Promise.all(files.map((file) => readFile(new URL(file, root), "utf8"))).then((parts) => parts.join("\n"));
const checkout = await readFile(new URL("src/app/comu/checkout/page.tsx", root), "utf8");
const pay = checkout.slice(checkout.indexOf("async function pay()"), checkout.indexOf("const addressLocked"));
const checks = [
  ["payment intent model", source.includes("comu_payment_intents")],
  ["payment allocations", source.includes("comu_payment_allocations")],
  ["seller account foundation", source.includes("comu_seller_payment_accounts")],
  ["seller ledger", source.includes("comu_seller_ledger_entries")],
  ["integer cents", source.includes("amount_cents bigint")],
  ["idempotency unique", source.includes("idempotency_key text not null unique")],
  ["server amount", source.includes("cents(order.grand_total)")],
  ["payment metadata", source.includes("comu_order_id") && source.includes("payment_version")],
  ["webhook raw body", source.includes("request.text()")],
  ["webhook signature", source.includes("constructEvent")],
  ["webhook dedupe", source.includes("stripe_webhook_events") && source.includes("duplicate")],
  ["success transaction", source.includes("comu_mark_payment_succeeded") && source.includes("ORDER_PAID")],
  ["late payment state", source.includes("PAYMENT_RECEIVED_AFTER_EXPIRY")],
  ["failed retry preserves order", source.includes("comu_mark_payment_failed") && source.includes("PAYMENT_PENDING")],
  ["held ledger", source.includes("SALE_HELD")],
  ["buyer/seller RLS", source.includes("comu_payment_intents_buyer") && source.includes("comu_payment_allocations_seller")],
  ["no payouts", !source.includes("transfers.create") && !source.includes("payouts.create")],
  ["pay never constructs another Stripe instance", !pay.includes("window.Stripe(") && checkout.match(/window\.Stripe\(key\)/g)?.length === 1],
  ["Elements created by stored Stripe instance", /const stripe = window\.Stripe\(key\);\s*stripeRef\.current = stripe;\s*const elements = stripe\.elements\(\{ clientSecret \}\);\s*elementsRef\.current = elements;/.test(checkout)],
  ["confirm uses stored Stripe and Elements", pay.includes("const stripe = stripeRef.current;") && pay.includes("const elements = elementsRef.current;") && pay.includes("await elements.submit()") && pay.includes("await stripe.confirmPayment({ elements,")],
  ["confirm options unchanged", pay.includes('confirmParams: { return_url: window.location.href }, redirect: "if_required"')],
  ["Payment Element still mounts once", checkout.includes('payment = elements.create("payment")') && checkout.includes('payment.mount("#comu-payment-element")') && checkout.includes("disposed || paymentRef.current || !window.Stripe")],
  ["lifecycle unmounts and clears Stripe refs", checkout.includes("payment?.unmount();") && ["paymentRef", "elementsRef", "stripeRef"].every((ref) => checkout.includes(`${ref}.current = null;`)) && checkout.includes("setPaymentReady(false);")],
  ["missing Stripe context has public error", /if \(!stripe \|\| !elements \|\| !clientSecret\) \{\s*setMessage\("No se pudo cargar el formulario de pago\. Inténtalo nuevamente\."\);\s*return;/.test(pay)],
];
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
console.log(`COMU Day 3 contract: ${checks.length}/${checks.length} PASS`);
