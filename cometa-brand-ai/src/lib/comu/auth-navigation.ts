const fallback = "/comu/account";
export const comuAuthPaths = ["/comu/login", "/comu/register", "/comu/forgot-password", "/comu/reset-password", "/comu/auth/confirm"];
export function safeComuNext(value?: string | null): string {
  if (!value || !value.startsWith("/comu") || /[\\\u0000-\u0020\u007f]/.test(value)) return fallback;
  try {
    const url = new URL(value, "https://comu.invalid");
    if (url.origin !== "https://comu.invalid" || /%|\\/.test(url.pathname) || comuAuthPaths.includes(url.pathname)) return fallback;
    const valid = ["/comu", "/comu/cart", "/comu/search", "/comu/account", "/comu/account/buyer", "/comu/account/orders", "/comu/legal"].includes(url.pathname)
      || /^\/comu\/seller\/[a-zA-Z0-9_-]+\/(summary|store|products|wholesale|settings)$/.test(url.pathname)
      || /^\/comu\/(products|sellers)\/[a-zA-Z0-9_-]+$/.test(url.pathname)
      || /^\/comu\/account\/orders\/[0-9a-f-]{36}(?:\/confirmation)?$/i.test(url.pathname)
      || /^\/comu\/legal\/(terms|privacy|returns|shipping|seller-guidelines)$/.test(url.pathname);
    return valid ? url.pathname + url.search + url.hash : fallback;
  } catch { return fallback; }
}
export function comuLoginHref(next?: string | null) { return "/comu/login?next=" + encodeURIComponent(safeComuNext(next)); }
export function isComuBuyerPrivatePath(pathname: string) {
  return pathname === "/comu/account/buyer" || pathname === "/comu/account/orders" || pathname.startsWith("/comu/account/orders/");
}
export function comuRegistrationProfile(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return {};
  const input = metadata as Record<string, unknown>;
  if (input.comu_registration !== true) return {};
  const name = typeof input.full_name === "string" ? input.full_name.trim() : "";
  const phone = typeof input.comu_phone === "string" ? input.comu_phone.trim() : "";
  return { ...(name && name.length <= 100 ? { display_name: name } : {}), ...(/^[+\d\s()-]{7,25}$/.test(phone) ? { phone } : {}) };
}
