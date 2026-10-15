import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [];
const exists = (p) => fs.existsSync(path.join(root, p));
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
function check(name, ok, detail) { checks.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); }

const os = "src/app/brand/[brandSlug]/os";
check("canonical layout exists", exists(`${os}/layout.tsx`));
for (const route of ["page.tsx", "intelligence/page.tsx", "sales/page.tsx", "marketing/page.tsx", "marketing/strategy/page.tsx", "marketing/calendar/page.tsx", "marketing/content/page.tsx", "work/page.tsx", "reports/page.tsx", "connections/page.tsx", "settings/page.tsx"]) check(`canonical route ${route}`, exists(`${os}/${route}`));
const shell = read(`${os}/components/os-shell.tsx`);
check("no client nav points to workspace", !shell.includes("/workspace"));
check("no client nav points to mission control", !shell.toLowerCase().includes("mission control"));
check("internal engines not exposed top-level", !shell.match(/ORION|NOVA|ATLAS|PULSAR|Mercury/));
check("fake connections absent from canonical OS", !shell.match(/Meta Ads|Shopify|Google/));
check("OS pages use canonical shell", read(`${os}/layout.tsx`).includes("<OsShell"));
check("brand access guard exists", read(`${os}/layout.tsx`).includes("requireBrandOsAccess"));
check("POS route untouched by shell", !shell.includes("usePosContext"));
check("no service role in client UI", !shell.includes("SERVICE_ROLE") && !shell.includes("createClient"));
check("empty/error/skeleton primitives exist", ["EmptyState", "ErrorState", "Skeleton"].every((x) => read(`${os}/components/os-primitives.tsx`).includes(`function ${x}`)));
check("responsive shell primitives exist", shell.includes("lg:static") && shell.includes("lg:hidden"));
const failed = checks.filter((x) => !x.ok);
console.log(JSON.stringify({ total: checks.length, passed: checks.length - failed.length, failed: failed.length, allChecksPassed: failed.length === 0 }));
process.exitCode = failed.length ? 1 : 0;
