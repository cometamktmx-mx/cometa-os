import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const files = {
  client: read("src/lib/supabase/client.ts"),
  middleware: read("src/lib/supabase/middleware.ts"),
  proxy: read("src/proxy.ts"),
  login: read("src/app/login/page.tsx"),
  sidebar: read("src/app/Sidebar.tsx"),
  safeNext: read("src/lib/auth/safe-next.ts"),
};

const checks = [
  ["browser client uses SSR client", files.client.includes("createBrowserClient")],
  ["session persistence is enabled", files.client.includes("persistSession: true")],
  ["token refresh is enabled", files.client.includes("autoRefreshToken: true")],
  ["no manual auth storage", !/(localStorage|sessionStorage)/.test(files.client + files.login)],
  ["middleware validates user server-side", files.middleware.includes("auth.getUser()")],
  ["middleware preserves refreshed cookies", files.middleware.includes("copySupabaseCookies") && files.middleware.includes("getSetCookie")],
  ["authenticated login uses safe next", files.middleware.includes("safeInternalNext") && files.login.includes("searchParams.get(\"next\")")],
  ["safe next rejects external origins", files.safeNext.includes("url.origin === INTERNAL_ORIGIN")],
  ["login proxy uses session maintenance", files.proxy.includes('pathname === "/login"') && files.proxy.includes("updateSession(request)")],
  ["authenticated root redirects to workspace", files.proxy.includes('pathname === "/" && user') && files.proxy.includes('"/workspace"')],
  ["authenticated root preserves safe next", files.proxy.includes("safeInternalNext(request.nextUrl.searchParams.get(\"next\")")],
  ["sidebar uses canonical browser client", files.sidebar.includes('"@/lib/supabase/client"') && !files.sidebar.includes('"@/lib/supabase"')],
  ["explicit logout uses signOut", files.sidebar.includes("auth.signOut()") && files.sidebar.includes('window.location.assign("/login")')],
  ["operator PIN remains separate", !/(pos_staff_session|staff-server)/.test(files.login + files.sidebar)],
];

const failures = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
if (failures.length) process.exit(1);
console.log("Auth session persistence contract: PASS");
