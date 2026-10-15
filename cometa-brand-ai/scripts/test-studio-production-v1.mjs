import fs from "node:fs";
const migration = fs.readFileSync("supabase/migrations/20260902100000_cometa_studio_production_v1.sql", "utf8");
const access = fs.readFileSync("src/lib/workspace/access.ts", "utf8");
const production = fs.readFileSync("src/lib/studio/production.ts", "utf8");
const checks = [
  [/cometa_brand_production_profiles/, "production profile table"],
  [/UNIQUE \(brand_id\)/, "one profile per brand"],
  [/no_human_talent.*agency_model_allowed/, "talent conflict constraint"],
  [/recording_location_type.*client_location/, "recording locations"],
  [/role IN \('admin','designer','reels','cm','copy','producer','client'\)/, "producer role"],
  [/auth\.admin\.createUser/, "server-side team auth creation"],
  [/role: "team"/, "team global role"],
  [/access_role: "editor"/, "team membership editor"],
  [/is_primary/, "primary assignment"],
  [/requireAdminWorkspace/, "admin profile guard"],
  [/getProductionCapabilities/, "safe studio read model"],
];
for (const [pattern, label] of checks) { if (!pattern.test(`${migration}\n${access}\n${production}`)) throw new Error(`Missing contract: ${label}`); }
if (/raw password|console\.log\(.*password/i.test(access)) throw new Error("Password persistence/logging detected");
console.log("Studio Production V1 contract: PASS");
