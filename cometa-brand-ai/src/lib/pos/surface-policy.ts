/** Account classification is not tenant membership or a product entitlement. */
export function getPosAccountRole(profile: unknown): "client" | "admin" | null {
  if (!profile || typeof profile !== "object") return null;
  const row = profile as Record<string, unknown>;
  if (row.status !== "active") return null;
  return row.role === "client" || row.role === "admin" ? row.role : null;
}

/** Only the subscription surface bypasses operation and local operator gates. */
export function getPosSurfaceState(input: {
  pathname: string;
  brandSlug: string;
  ready: boolean;
  commercialAccessAllowed: boolean;
  entitlements: readonly string[];
}): "recovery" | "loading" | "blocked" | "operation" {
  if (input.pathname.replace(/\/$/, "") === `/brand/${input.brandSlug}/pos/subscription`) {
    return "recovery";
  }
  if (!input.ready) return "loading";
  return input.commercialAccessAllowed && input.entitlements.includes("pos.access")
    ? "operation"
    : "blocked";
}

export function isFoodProfile(profileCode: string | null | undefined) {
  return profileCode === "restaurant" || profileCode === "coffee_shop";
}

export function isPosAdminPath(pathname: string, brandSlug: string) {
  return pathname.replace(/\/$/, "") === `/brand/${brandSlug}/pos/admin` ||
    pathname.startsWith(`/brand/${brandSlug}/pos/admin/`);
}

export function isStaffLocked(lockedUntil: string | null | undefined, now = Date.now()) {
  return Boolean(lockedUntil && new Date(lockedUntil).getTime() > now);
}

export function getFoodPageKind(pathname: string, brandSlug: string) {
  const base = `/brand/${brandSlug}/pos`;
  const path = pathname.replace(/\/$/, "");
  if (path === base) return "operation";
  if (path === `${base}/subscription`) return "recovery";
  if ([`${base}/cash`, `${base}/register`].includes(path)) return "cash";
  return "admin";
}

export function canAccessFoodPage(kind: ReturnType<typeof getFoodPageKind>, role: string | readonly string[] | null, adminMode: boolean) {
  if (kind === "operation" || kind === "recovery") return true;
  if (!role) return false;
  const roles = typeof role === "string" ? [role] : role;
  if (roles.includes("ADMIN") && adminMode) return true;
  return kind === "cash" && roles.some(value => ["ADMIN", "MANAGER", "CASHIER"].includes(value));
}

export type FoodAccessState = "loading" | "first-run" | "locked" | "authenticated-operational" | "authenticated-admin" | "error";
export function getFoodAccessState(input: { loaded: boolean; error: boolean; firstRun: boolean; authenticated: boolean; adminMode: boolean }): FoodAccessState {
  if (input.error) return "error";
  if (!input.loaded) return "loading";
  if (!input.authenticated) return input.firstRun ? "first-run" : "locked";
  return input.adminMode ? "authenticated-admin" : "authenticated-operational";
}
