import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pageFile = "src/app/onboarding/business/page.tsx";
const apiFile = "src/app/api/onboarding/business/route.ts";
const page = fs.readFileSync(path.join(root, pageFile), "utf8");
const api = fs.readFileSync(path.join(root, apiFile), "utf8");
const migrations = fs.readdirSync(path.join(root, "supabase/migrations"));

const checks = [
  ["business onboarding exists", fs.existsSync(path.join(root, pageFile))],
  ["premium activation hero", /Cometa POS[\s\S]*Configuraci&oacute;n inicial[\s\S]*Crea tu negocio/i.test(page)],
  ["two-step activation stepper", /Negocio/.test(page) && /Listo/.test(page) && /SetupStepper/.test(page)],
  ["fashion is selectable", /code: "fashion"/.test(page)],
  ["retail is selectable", /code: "retail"/.test(page)],
  ["only canonical profiles selectable", (page.match(/code: "(fashion|retail)"/g) || []).length === 2],
  ["restaurant upcoming is disabled", /DisabledChoice title=\{\"Restaurante \/ Caf\\u00e9\"\}/.test(page)],
  ["services upcoming is disabled", /DisabledChoice title="Servicios \/ Belleza"/.test(page)],
  ["upcoming cards are not buttons", /function DisabledChoice[\s\S]*<div aria-disabled="true"/.test(page)],
  ["15-day trial summary", /Prueba de 15 d\\u00edas/.test(page)],
  ["Principal summary", /Sucursal Principal/.test(page)],
  ["Caja 1 summary", /Caja 1/.test(page)],
  ["stable idempotency key", /creationKeyRef/.test(page) && /crypto\.randomUUID\(\)/.test(page)],
  ["idempotency resets only after success", /if \(!response\.ok[\s\S]*creationKeyRef\.current = null[\s\S]*window\.location\.href/.test(page)],
  ["double-submit guard", /if \(loading\) return/.test(page) && /disabled=\{loading\}/.test(page)],
  ["preparation transition exists", /Estamos preparando Cometa POS/.test(page) && /PREPARATION_STEPS/.test(page)],
  ["no fake percentage", !/\b\d{1,3}%|progress.*percent/i.test(page)],
  ["error preserves form state", !/setBrandName\(""\)|setProfileCode\(/.test(page)],
  ["human retry error", /intentarlo otra vez de forma segura/.test(page)],
  ["payload contract preserved", /brandName: normalizedName[\s\S]*profileCode[\s\S]*idempotencyKey: getCreationKey\(\)/.test(page)],
  ["first-run redirect preserved", /destination: `\/brand\/\$\{brandSlug\}\/pos`/.test(api)],
  ["no local storage", !/localStorage|sessionStorage/.test(page)],
  ["no onboarding UI SQL migration", !migrations.some((name) => /business_onboarding.*ui|onboarding_redesign/i.test(name))],
];

const failed = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
}
console.log(JSON.stringify({
  checks_total: checks.length,
  checks_passed: checks.length - failed.length,
  failed_count: failed.length,
  all_checks_passed: failed.length === 0,
}));
if (failed.length) process.exitCode = 1;
