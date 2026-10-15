import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

const files = {
  signup: "src/app/signup/page.tsx",
  callback: "src/app/auth/callback/route.ts",
  confirm: "src/app/auth/confirm/route.ts",
  forgot: "src/app/forgot-password/page.tsx",
  reset: "src/app/reset-password/page.tsx",
  onboarding: "src/app/onboarding/business/page.tsx",
  api: "src/app/api/onboarding/business/route.ts",
  migration: "supabase/migrations/20260814_entry_v1b_self_service_business_creation.sql",
  workspaceApi: "src/app/api/workspace-brands/route.ts",
  workspace: "src/app/workspace/page.tsx",
  login: "src/app/login/page.tsx",
  proxy: "src/proxy.ts",
};

const source = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, exists(file) ? read(file) : ""])
);

const checks = [
  ["signup route exists", exists(files.signup)],
  ["signup uses Supabase signUp", /auth\.signUp\(/.test(source.signup)],
  ["signup sets full_name metadata", /full_name:\s*normalizedName/.test(source.signup)],
  ["signup uses SSR confirmation redirect", /confirmationRedirectTo[\s\S]*\/auth\/confirm/.test(source.signup) && /emailRedirectTo:\s*confirmationRedirectTo\(\)/.test(source.signup)],
  ["signup supports confirmation resend", /auth\.resend\([\s\S]*type:\s*"signup"/.test(source.signup)],
  ["confirmation UX exists", /Revisa tu correo/.test(source.signup)],
  ["auth callback exists", exists(files.callback)],
  ["callback exchanges code", /exchangeCodeForSession\(code\)/.test(source.callback)],
  ["callback next is internal-only", /startsWith\("\/"\)[\s\S]*!value\.startsWith\("\/\/"\)/.test(source.callback)],
  ["SSR confirmation route exists", exists(files.confirm)],
  ["confirmation verifies token hash", /verifyOtp\([\s\S]*token_hash:\s*tokenHash[\s\S]*type:/.test(source.confirm)],
  ["confirmation accepts email OTP only", /requestedType === "email"/.test(source.confirm)],
  ["confirmation next is internal-only", /startsWith\("\/"\)[\s\S]*!value\.startsWith\("\/\/"\)/.test(source.confirm)],
  ["confirmation failure has human login error", /email_confirmation_failed/.test(source.confirm) && /email_confirmation_failed/.test(source.login)],
  ["forgot password route", exists(files.forgot) && /resetPasswordForEmail/.test(source.forgot)],
  ["reset password route", exists(files.reset) && /auth\.updateUser\(\{ password \}\)/.test(source.reset)],
  ["business onboarding route", exists(files.onboarding)],
  ["business onboarding supports fashion and retail", /"fashion" \| "retail"/.test(source.onboarding)],
  ["business creation key is stable", /creationKeyRef/.test(source.onboarding) && /crypto\.randomUUID\(\)/.test(source.onboarding)],
  ["business API exists", exists(files.api) && /export async function POST/.test(source.api)],
  ["API gets authenticated user server-side", /auth\.auth\.getUser\(\)/.test(source.api)],
  ["API payload type has no userId", !/type BusinessCreationBody[\s\S]{0,220}userId/.test(source.api)],
  ["API payload type has no role", !/type BusinessCreationBody[\s\S]{0,220}\brole\??:/.test(source.api)],
  ["API payload type has no slug or brandId", !/type BusinessCreationBody[\s\S]{0,220}(\bslug\??:|\bbrandId\??:)/.test(source.api)],
  ["API derives RPC user from session", /p_user_id:\s*user\.id/.test(source.api)],
  ["API calls canonical creation RPC", /pos_create_self_service_business_v1/.test(source.api)],
  ["API redirects into brand POS first run", /destination:\s*`\/brand\/\$\{brandSlug\}\/pos`/.test(source.api)],
  ["RPC is security definer", /SECURITY DEFINER[\s\S]*SET search_path = public/.test(source.migration)],
  ["RPC is browser denied", /REVOKE EXECUTE[\s\S]*PUBLIC, anon, authenticated/.test(source.migration)],
  ["RPC reuses initializer", /pos_initialize_brand_setup\(/.test(source.migration)],
  ["RPC reuses profile configurator", /pos_configure_business_profile\(/.test(source.migration)],
  ["RPC assigns canonical owner", /'owner'/.test(source.migration)],
  ["RPC creates Principal and Caja 1", /'Principal'[\s\S]*'Caja 1'/.test(source.migration)],
  ["workspace API marks no-brand onboarding", /shouldRedirectToBusinessOnboarding/.test(source.workspaceApi)],
  ["workspace escapes empty state", /router\.replace\("\/onboarding\/business"\)/.test(source.workspace)],
  ["login sends no-brand user to onboarding", /return "\/onboarding\/business"/.test(source.login)],
  ["public auth routes pass proxy", ["/signup", "/forgot-password", "/reset-password", "/auth/callback", "/auth/confirm"].every((route) => source.proxy.includes(`"${route}"`))],
  ["public auth routes sanitize stale sessions", /if \(isPublicRoute\(pathname\)\) \{[\s\S]{0,320}await getProxyUser\(request\)[\s\S]{0,120}return response/.test(source.proxy)],
];

const failed = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
console.log(JSON.stringify({
  checks_total: checks.length,
  checks_passed: checks.length - failed.length,
  failed_count: failed.length,
  all_checks_passed: failed.length === 0,
}));
if (failed.length) process.exitCode = 1;
