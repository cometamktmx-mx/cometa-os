import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

function readLocalEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^(COMU_STRIPE_SECRET_KEY|NEXT_PUBLIC_COMU_STRIPE_PUBLISHABLE_KEY|COMU_STRIPE_WEBHOOK_SECRET)=(.*)$/);
    if (match) values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return values;
}

const env = { ...readLocalEnv(await readFile(".env.local", "utf8").catch(() => "")), ...process.env };
const checks = [
  ["secret is test mode", env.COMU_STRIPE_SECRET_KEY?.startsWith("sk_test_") === true],
  ["publishable key is test mode", env.NEXT_PUBLIC_COMU_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_") === true],
  ["webhook secret configured", env.COMU_STRIPE_WEBHOOK_SECRET?.startsWith("whsec_") === true],
  ["stripe CLI available", (() => { try { execFileSync("stripe", ["--version"], { stdio: "ignore" }); return true; } catch { return false; } })()],
];
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "BLOCKED"} ${name}`);
if (checks.some(([, ok]) => !ok)) {
  console.error("Sandbox certification requires test publishable key, webhook secret, and Stripe CLI. No live call or unsigned webhook was attempted.");
  process.exitCode = 2;
} else {
  console.log("READY Stripe sandbox certification: run stripe listen --forward-to localhost:3000/api/comu/stripe/webhook and execute the browser smoke flow.");
}
