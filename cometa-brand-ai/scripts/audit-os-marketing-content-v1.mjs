import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "src/lib/mercury/client-content.ts",
  "src/app/api/os/[brandSlug]/marketing/calendar/route.ts",
  "src/app/api/os/[brandSlug]/marketing/content/[contentItemId]/route.ts",
  "src/app/brand/[brandSlug]/os/marketing/calendar/page.tsx",
];
const forbidden = ["private_notes", "raw_ai_data", "assigned_to", "assigned_role", "brand_name", "brand_slug"];
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
for (const file of required) if (!fs.existsSync(path.join(root, file))) failures.push(`missing ${file}`);
if (failures.length === 0) {
  const adapter = read(required[0]);
  const page = read(required[3]);
  if (!adapter.includes("requireBrandOsAccess")) failures.push("adapter does not use canonical OS guard");
  if (!adapter.includes('.eq("brand_slug", canonicalSlug)')) failures.push("calendar/content queries lack tenant slug scope");
  if (!adapter.includes('.eq("calendar_id", calendar.id)')) failures.push("items are not scoped to selected calendar");
  if (!adapter.includes('.eq("is_private", false)')) failures.push("comments are not filtered to client-visible records");
  if (forbidden.some((field) => page.includes(field))) failures.push("client page references forbidden internal fields");
  if (page.includes("index + 1 <= 31")) failures.push("static day numbering remains");
  if (!page.includes("new Date(year, month, 0).getDate()")) failures.push("calendar does not derive month length");
  if (!page.includes("(first.getDay() + 6) % 7")) failures.push("calendar does not derive Monday offset");
}
if (failures.length) { console.error("MARKETING CONTENT AUDIT: FAIL"); failures.forEach((failure) => console.error(`- ${failure}`)); process.exitCode = 1; }
else console.log("MARKETING CONTENT AUDIT: PASS (static security/route/date checks; live tenant tests require authenticated environments)");
