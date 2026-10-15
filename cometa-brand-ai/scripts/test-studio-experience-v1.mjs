import fs from "node:fs";
const source=["src/app/studio/page.tsx","src/app/studio/studio-dashboard-client.tsx","src/lib/studio/server.ts","src/app/api/studio/cosmos/route.ts"].map(f=>fs.readFileSync(f,"utf8")).join("\n");
for(const [p,l] of [[/assigned_to/,"personal ownership"],[/requireStudioBrandAccess/,"brand guard"],[/selected/,"piece selection"],[/COSMOS CREATOR/,"creator panel"],[/ACTIONS|ACTIONS|script/,"action allowlist"]])if(!p.test(source))throw Error(`Missing ${l}`);
if(/localStorage/.test(source))throw Error("localStorage authority detected");
console.log("Studio Experience V1 contract: PASS");
