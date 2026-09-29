export function isPublicComuRoute(pathname: string): boolean {
  return ["/comu", "/comu/account", "/comu/cart", "/comu/search", "/comu/sell"].includes(pathname)
    || /^\/comu\/(products|sellers)\/[^/]+$/.test(pathname)
    || /^\/comu\/legal(?:\/(terms|privacy|returns|shipping|seller-guidelines))?$/.test(pathname);
}
