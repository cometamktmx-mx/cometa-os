import fs from "node:fs";
const files = ["src/lib/studio/server.ts","src/lib/studio/dashboard.ts","src/app/studio/page.tsx","src/app/api/studio/cosmos/route.ts"];
const source = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
for (const [pattern, label] of [[/eq\("assigned_to", userId\)/,"personal assignment"],[/requireStudioBrandAccess/,"brand guard"],[/changes_requested/,"changes metric"],[/distribution_type/,"distribution"],[/productionCapabilities|getProductionCapabilities/,"production profile"],[/OPENAI_API_KEY/,"server OpenAI"]]) if (!pattern.test(source)) throw new Error(`Missing ${label}`);
if (/forceRegenerate|DELETE all|localStorage/.test(source)) throw new Error("Unsafe regeneration or client authority detected");
console.log("Studio Visual V1 contract: PASS");
