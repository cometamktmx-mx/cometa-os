import fs from "node:fs";
const source = ["src/lib/studio/workflow.ts","src/app/api/studio/workflow/route.ts","src/app/api/studio/cosmos/route.ts","src/lib/studio/production.ts","src/lib/studio/server.ts"].map((f)=>fs.readFileSync(f,"utf8")).join("\n");
for (const [pattern,label] of [[/assigned_to/,"assigned piece authorization"],[/requireStudioBrandAccess/,"brand isolation"],[/\["start","ready"\]/,"workflow allowlist"],[/changes_requested/,"changes workflow"],[/auth|OPENAI_API_KEY/,"server boundary"],[/assignedCount/,"admin assignment result"]]) if(!pattern.test(source)) throw new Error(`Missing ${label}`);
if(/forceRegenerate|DELETE all|localStorage/.test(source)) throw new Error("Unsafe authority or regeneration found");
console.log("Studio Interaction V1 contract: PASS");
