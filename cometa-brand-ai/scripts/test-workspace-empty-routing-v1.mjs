import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const context = read("src/lib/workspace/context.ts");
const page = read("src/app/workspace/page.tsx");
const invitationApi = read("src/app/api/pos/invitations/route.ts");

const checks = [
  ["active memberships remain canonical", /user_brand_access[\s\S]*\.eq\("status", "active"\)/.test(context)],
  ["pending invitations use canonical table", /pos_user_invitations/.test(context)],
  ["pending invitations match authenticated email", /\.eq\("email", normalizedEmail\)/.test(context)],
  ["only pending unexpired invitations count", /\.eq\("status", "pending"\)[\s\S]*\.gt\("expires_at"/.test(context)],
  ["new user destination is onboarding", /brands\.length === 0[\s\S]*"\/onboarding\/business"/.test(context)],
  ["pending invite destination is invite flow", /hasPendingInvitation \? "\/invite"/.test(context)],
  ["one brand keeps canonical brand destination", /brands\[0\]\.slug/.test(context)],
  ["multiple brands remain in workspace", /brands\.length > 1\) return "\/workspace"/.test(context)],
  ["inactive account remains out of self-service onboarding", /profile\?\.status === "inactive"\) return "\/workspace"/.test(context)],
  ["workspace redirect is server-side", /redirect\("\/onboarding\/business"\)/.test(page)],
  ["workspace preserves invite flow", /redirect\("\/invite"\)/.test(page)],
  ["inactive profile is not self-service redirected", /profile\?\.status !== "inactive"/.test(page)],
  ["fallback offers business creation", /Crear mi empresa/.test(page) && /href="\/onboarding\/business"/.test(page)],
  ["fallback links existing invite surface", /href="\/invite"/.test(page)],
  ["invitation acceptance remains canonical", /pos_accept_user_invitation_v1/.test(invitationApi)],
  ["no client storage or query authority", !/(localStorage|searchParams|get\("invite)/.test(context + page)],
];

const failed = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
console.log(JSON.stringify({ checksTotal: checks.length, checksPassed: checks.length - failed.length, failedCount: failed.length }));
if (failed.length) process.exitCode = 1;
