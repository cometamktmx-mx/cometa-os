import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const migration = readFileSync("supabase/migrations/20260902090000_cometa_studio_foundation_v1.sql", "utf8");
const studio = readFileSync("src/lib/studio/server.ts", "utf8");
const assignments = readFileSync("src/lib/studio/assignments.ts", "utf8");
const context = readFileSync("src/lib/workspace/context.ts", "utf8");
const workspace = readFileSync("src/app/workspace/page.tsx", "utf8");
const autoCalendar = readFileSync("src/app/api/admin/brands/[brandSlug]/marketing/auto-calendar/route.ts", "utf8");
const clientBrand = readFileSync("src/lib/brand-os/server.ts", "utf8");
const brandPage = readFileSync("src/app/brand/[brandSlug]/page.tsx", "utf8");
const posLayout = readFileSync("src/app/brand/[brandSlug]/pos/layout.tsx", "utf8");

assert.match(migration, /role IN \('admin', 'client', 'team'\)/);
assert.match(migration, /ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false/);
assert.match(migration, /WHERE is_primary = true AND active = true/);
assert.match(studio, /requireStudioAccess/); assert.match(studio, /data\.role !== "team"/); assert.match(studio, /data\.status !== "active"/);
assert.match(studio, /requireStudioBrandAccess/); assert.match(studio, /user_brand_access/); assert.match(studio, /mercury_team_assignments/); assert.match(studio, /active/);
assert.match(assignments, /is_primary/); assert.match(assignments, /state: "ambiguous"/); assert.match(assignments, /result\.data\.length !== 1/);
assert.match(context, /isCanonicalTeam/); assert.match(context, /role === "team"/); assert.match(context, /return "\/studio"/);
assert.match(workspace, /context\.isCanonicalTeam/); assert.match(workspace, /redirect\("\/studio"\)/);
assert.match(autoCalendar, /getPrimaryBrandProductionAssignee/); assert.match(autoCalendar, /assigned_to: primary\.assignee/); assert.match(autoCalendar, /assigned_role: primary\.assignee/);
assert.match(clientBrand, /requireClientBrandAccess/); assert.match(clientBrand, /data\.role !== "client"/); assert.match(clientBrand, /CLIENT_SURFACE_REQUIRED/);
assert.match(brandPage, /requireClientBrandAccess/); assert.match(posLayout, /requireClientBrandAccess/);
assert.doesNotMatch(studio, /COMETA_ADMIN_EMAILS|COMETA_ADMIN_USER_IDS/);
assert.doesNotMatch(autoCalendar, /forceRegenerate|\.delete\(/);
console.log("Studio Foundation V1 contract: PASS");
