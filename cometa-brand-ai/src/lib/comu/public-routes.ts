export function isPublicComuRoute(pathname: string): boolean {
  return ["/comu", "/comu/account", "/comu/cart", "/comu/search", "/comu/sell", "/comu/login", "/comu/register", "/comu/forgot-password", "/comu/reset-password", "/comu/auth/confirm"].includes(pathname)
    || /^\/comu\/(products|sellers)\/[^/]+$/.test(pathname)
    || /^\/comu\/legal(?:\/(terms|privacy|returns|shipping|seller-guidelines))?$/.test(pathname);
}
