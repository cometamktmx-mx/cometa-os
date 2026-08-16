import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = {
  helper: "src/lib/stripe/server.ts",
  billing: "src/app/api/pos/billing/route.ts",
  checkout: "src/app/api/pos/billing/checkout/route.ts",
  portal: "src/app/api/pos/billing/portal/route.ts",
  webhook: "src/app/api/stripe/webhook/route.ts",
  page: "src/app/brand/[brandSlug]/pos/subscription/page.tsx",
  migration: "supabase/migrations/20260816_pos_stripe_billing_v1.sql",
};
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [
  ["Stripe helper is server-only", read(files.helper).includes('server-only')],
  ["no public Stripe secret", !Object.values(files).some((file) => /NEXT_PUBLIC_.*STRIPE|NEXT_PUBLIC_STRIPE/i.test(read(file)))],
  ["server-side price mapping", /STRIPE_PRICE_(START|PRO|MULTI)/.test(read(files.helper))],
  ["owner permission checkout", read(files.checkout).includes('pos.subscription.manage')],
  ["owner permission portal", read(files.portal).includes('pos.subscription.manage')],
  ["raw webhook body", read(files.webhook).includes('request.text()')],
  ["webhook signature verification", read(files.webhook).includes('constructEvent')],
  ["event dedupe ledger", read(files.webhook).includes('stripe_webhook_events') && read(files.migration).includes('stripe_event_id')],
  ["success redirect does not grant access", !read(files.checkout).includes('status: "active"')],
  ["grant blocks checkout", read(files.checkout).includes('POS_BILLING_GRANT_ACTIVE')],
  ["historical Stripe subscription is retrieved before duplicate blocking", read(files.checkout).includes('stripe.subscriptions.retrieve')],
  ["terminal Stripe subscriptions permit re-checkout", read(files.checkout).includes('incomplete_expired') && read(files.checkout).includes('canceled')],
  ["non-terminal Stripe subscriptions remain protected", read(files.checkout).includes('POS_STRIPE_SUBSCRIPTION_EXISTS')],
  ["existing Stripe customer is reused", read(files.checkout).includes('subscription.stripe_customer_id')],
  ["checkout idempotency is attempt-scoped", read(files.checkout).includes('randomUUID()') && read(files.checkout).includes('checkoutAttemptId') && !read(files.checkout).includes('cometa-checkout-${subscription.id}-${plan.code}')],
  ["Stripe lookup failures fail closed", read(files.checkout).includes('POS_STRIPE_SUBSCRIPTION_LOOKUP_FAILED')],
  ["cancelled UI offers re-subscription without trial presentation", read(files.page).includes('Tu suscripción está cancelada') && read(files.page).includes('subscription?.status === "cancelled"')],
  ["billing read is passive", !read(files.billing).includes('pos_initialize_brand_setup')],
  ["no Stripe trial duplication", !read(files.checkout).includes('trial_period_days')],
  ["no custom Elements", !Object.values(files).some((file) => /stripe\.elements|PaymentElement/.test(read(file)))],
  ["no custom proration", !read(files.checkout).includes('proration_behavior')],
  ["native lifecycle preserved", read(files.billing).includes('pos_get_effective_commercial_access')],
  ["webhook does not modify grants", !read(files.webhook).includes('pos_commercial_grants')],
  ["subscription periods prefer item-level fields", read(files.webhook).includes('current_period_start') && read(files.webhook).includes('items?.data')],
  ["subscription periods have legacy fallback", read(files.webhook).includes('legacyStart') && read(files.webhook).includes('legacyEnd')],
  ["ambiguous multiple items fail closed", read(files.webhook).includes('POS_STRIPE_PERIOD_AMBIGUOUS')],
];
const failed = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
console.log(`SUMMARY passed=${checks.length - failed.length} failed=${failed.length}`);
if (failed.length) process.exitCode = 1;
