import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import assert from "node:assert/strict";

const port = Number(process.env.COMU_WHOLESALE_HTTP_PORT || 3127);
const base = `http://127.0.0.1:${port}`;
async function ready() { for (let i = 0; i < 60; i += 1) { try { const response = await fetch(`${base}/api/comu/catalog`); if (response.status < 500) return response; } catch {} await delay(1000); } throw new Error("WHOLESALE_HTTP_SERVER_NOT_READY"); }
const command = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(command, ["run", "dev", "--", "-p", String(port)], { cwd: process.cwd(), shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
let stderr = ""; child.stderr.on("data", (chunk) => { stderr += String(chunk).slice(-2000); });
try {
  const response = await ready();
  const body = await response.json();
  assert.ok(response.status !== 500, `catalog returned 500: ${JSON.stringify(body)}`);
  assert.ok(body && typeof body === "object" && (body.ok === true || body.code === "COMU_FEATURE_DISABLED"), "catalog contract response");
  const invalidProduct = await fetch(`${base}/api/comu/wholesale/product?sellerId=invalid&listingId=invalid`);
  assert.ok(invalidProduct.status >= 400 && invalidProduct.status < 500, "invalid product request rejected");
  const invalidStore = await fetch(`${base}/api/comu/wholesale?sellerId=invalid&storefrontId=invalid`);
  assert.ok(invalidStore.status >= 400 && invalidStore.status < 500, "invalid storefront request rejected");
  const tamperedCart = await fetch(`${base}/api/comu/cart`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId: "foreign", variantListingId: "foreign", quantity: 1, unitPrice: 1, discount: 99, total: 1 }) });
  assert.ok(tamperedCart.status >= 400 && tamperedCart.status < 500, "tampered cart request rejected");
  console.log("COMU WHOLESALE HTTP CERTIFICATION PASS");
} catch (error) { console.error(error?.stack || error, stderr); process.exitCode = 1; } finally { child.kill("SIGTERM"); await delay(300); if (!child.killed) child.kill("SIGKILL"); }
