import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const files = {
  rootPage: "src/app/brand/[brandSlug]/page.tsx",
  osPage: "src/app/brand/[brandSlug]/os/page.tsx",
  hashRedirect: "src/app/brand/[brandSlug]/components/brand-home-hash-redirect.tsx",
  client: "src/app/brand/[brandSlug]/components/os/os-dashboard-client.tsx",
  commandBar: "src/app/brand/[brandSlug]/components/os/os-command-bar.tsx",
  navigation: "src/app/brand/[brandSlug]/components/os/os-navigation.tsx",
  overview: "src/app/brand/[brandSlug]/components/os/os-overview.tsx",
  readiness: "src/app/brand/[brandSlug]/components/os/os-readiness.tsx",
  nextActions: "src/app/brand/[brandSlug]/components/os/os-next-actions.tsx",
  moduleGrid: "src/app/brand/[brandSlug]/components/os/os-module-grid.tsx",
  guard: "src/lib/brand-os/server.ts",
  dashboard: "src/app/api/brand-dashboard/route.ts",
  documentation: "docs/cometa-os-routing-restructure-v1.md",
};

const source = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, read(file)])
);
const checks = [];

function check(name, fn) {
  try {
    fn();
    checks.push({ name, passed: true });
  } catch (error) {
    checks.push({
      name,
      passed: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

check("the official Cometa OS route exists and applies the server guard", () => {
  assert.ok(existsSync(join(root, files.osPage)));
  assert.match(source.osPage, /requireBrandOsAccess\(brandSlug\)/);
  assert.match(source.osPage, /BrandOsGuardError/);
  assert.match(source.osPage, /Volver al inicio/);
});

check("root is a minimal company launcher, not the legacy OS dashboard", () => {
  assert.match(source.rootPage, /requireBrandAccess\(brandSlug\)/);
  assert.match(source.rootPage, /Tu empresa en Cometa/);
  assert.match(source.rootPage, /COMETA POS/);
  assert.match(source.rootPage, /COMETA OS/);
  assert.doesNotMatch(source.rootPage, /\/api\/brand-dashboard|BrandHomePage|openLeads|agentScore/);
});

check("launcher is available to a valid member without requiring active OS", () => {
  assert.match(source.guard, /export async function requireBrandAccess/);
  const launcherGuard = source.guard.slice(
    source.guard.indexOf("export async function requireBrandAccess"),
    source.guard.indexOf("export async function requireBrandOsAccess")
  );
  assert.match(launcherGuard, /getBrandOsAccess\(admin, brand\.slug\)/);
  assert.doesNotMatch(launcherGuard, /effectiveAccessAllowed|createProductAccessError/);
  assert.match(source.rootPage, /access\.isPlatformAdmin \|\| access\.osAccess\.status === "active"/);
});

check("hash compatibility redirects only known legacy OS anchors", () => {
  for (const hash of [
    "#resumen",
    "#cuenta-digital",
    "#trabajo-realizado",
    "#estrategia-mes",
    "#calendario-contenido",
    "#conexiones",
    "#reportes",
    "#inventario",
    "#oportunidades",
  ]) {
    assert.match(source.hashRedirect, new RegExp(`"${hash}"`));
  }
  assert.match(source.hashRedirect, /if \(!LEGACY_OS_HASHES\.has\(hash\)\) return/);
  assert.match(source.hashRedirect, /\/os\$\{hash\}/);
});

check("OS UI is componentized and uses a single dashboard fetch", () => {
  for (const component of [
    "OsCommandBar",
    "OsNavigation",
    "OsOverview",
    "OsReadiness",
    "OsNextActions",
    "OsModuleGrid",
  ]) {
    assert.match(source.client, new RegExp(component));
  }
  assert.equal((source.client.match(/\/api\/brand-dashboard/g) || []).length, 1);
  assert.doesNotMatch(source.client, /Promise\.all\(\[.*fetch/s);
});

check("OS navigation is separate from POS and uses current destinations", () => {
  assert.match(source.navigation, /Navegación de Cometa OS/);
  assert.match(source.navigation, /\/sales-ai\/inbox/);
  assert.match(source.navigation, /\/sales-ai\/knowledge/);
  assert.doesNotMatch(source.navigation, /usePosContext|pos-sidebar|\/api\/pos\//);
});

check("all legacy OS anchors remain available under /os", () => {
  assert.match(source.overview, /id="resumen"/);
  assert.match(source.moduleGrid, /id=\{module\.id\}/);
  for (const anchor of [
    "cuenta-digital",
    "trabajo-realizado",
    "estrategia-mes",
    "calendario-contenido",
    "conexiones",
    "reportes",
    "inventario",
    "oportunidades",
  ]) {
    assert.match(source.moduleGrid, new RegExp(`id: "${anchor}"`));
  }
});

check("dashboard publishes additive availability for fallible data sources", () => {
  assert.match(source.dashboard, /dataAvailability:/);
  assert.match(source.dashboard, /counts:\s*\{/);
  assert.match(source.dashboard, /derived:\s*\{/);
  assert.match(source.dashboard, /return \{ value: 0, available: false \}/);
  assert.match(source.dashboard, /return \{ value: count \|\| 0, available: true \}/);
});

check("new OS surfaces do not present unavailable data as valid zero", () => {
  assert.match(source.overview, /No disponible/);
  assert.match(source.overview, /dataAvailability/);
  assert.match(source.readiness, /No disponible/);
  assert.match(source.nextActions, /Solo se muestran acciones respaldadas por señales disponibles/);
  assert.match(source.moduleGrid, /availability\?\.counts\.leads \? "Disponible" : "No disponible"/);
  assert.match(source.moduleGrid, /availability\?\.derived\.knowledge \? "Disponible" : "No disponible"/);
});

check("readiness appears once as an actionable system representation", () => {
  assert.match(source.readiness, /System readiness/);
  assert.match(source.readiness, /Qué está listo/);
  assert.doesNotMatch(source.commandBar, /agentScore|Readiness/);
  assert.doesNotMatch(source.moduleGrid, /agentScore.*agentScore/s);
});

check("new visual command center keeps no OS or POS security shortcut", () => {
  const phaseSource = [
    source.osPage,
    source.client,
    source.commandBar,
    source.navigation,
    source.overview,
    source.readiness,
    source.nextActions,
    source.moduleGrid,
    source.rootPage,
    source.hashRedirect,
  ].join("\n");
  assert.doesNotMatch(phaseSource, /requirePosContext|pos_subscriptions|pos_entitlements|pos_plans/);
  assert.doesNotMatch(phaseSource, /stripe|billing|invoice|checkout/i);
});

check("scope documents that external OS surfaces still await Phase C", () => {
  assert.match(source.documentation, /Fase C/i);
  assert.match(source.documentation, /Mercury.*Sales AI.*externas/i);
  assert.doesNotMatch(source.documentation, /protege todo Cometa OS globalmente/i);
});

const failed = checks.filter((item) => !item.passed);
for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}${item.detail ? ` — ${item.detail}` : ""}`);
}
console.log(
  JSON.stringify({
    checks_total: checks.length,
    checks_passed: checks.length - failed.length,
    failed_count: failed.length,
    all_checks_passed: failed.length === 0,
  })
);

if (failed.length) process.exitCode = 1;
