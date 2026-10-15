export const catalogFilters = ["category", "color", "size", "price", "available"] as const;
export const catalogSorts = ["newest", "price_asc", "price_desc", "name"] as const;
export type CatalogSort = typeof catalogSorts[number];
export type CatalogConfig = { title: string; description: string; banner: string; columns: number; ratio: "portrait" | "square" | "tall"; secondImage: boolean; swatches: boolean; filters: (typeof catalogFilters[number])[]; sort: CatalogSort; perPage: number };
export const defaultCatalog = (): CatalogConfig => ({ title: "Catálogo", description: "", banner: "", columns: 3, ratio: "portrait", secondImage: true, swatches: true, filters: [...catalogFilters], sort: "newest", perPage: 24 });
export function parseCatalogConfig(value: unknown, slug: string): CatalogConfig {
  if (value === undefined) return defaultCatalog();
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("CATALOG_INVALID");
  const v = value as Record<string, unknown>;
  if (typeof v.title !== "string" || v.title.length > 150 || typeof v.description !== "string" || v.description.length > 2000 || typeof v.banner !== "string" || (v.banner && (!v.banner.startsWith(slug + "/web/") || !/^[a-zA-Z0-9/_-]+\.(jpg|jpeg|png|webp)$/.test(v.banner))) || ![2,3,4,5].includes(Number(v.columns)) || ![8,12,16,24,32,48].includes(Number(v.perPage)) || !["portrait","square","tall"].includes(String(v.ratio)) || !catalogSorts.includes(v.sort as CatalogSort) || typeof v.secondImage !== "boolean" || typeof v.swatches !== "boolean" || !Array.isArray(v.filters) || v.filters.some(f => !catalogFilters.includes(f)) || new Set(v.filters).size !== v.filters.length) throw Error("CATALOG_INVALID");
  return { title: v.title.trim(), description: v.description.trim(), banner: v.banner, columns: Number(v.columns), ratio: v.ratio as CatalogConfig["ratio"], secondImage: v.secondImage, swatches: v.swatches, filters: v.filters as CatalogConfig["filters"], sort: v.sort as CatalogSort, perPage: Number(v.perPage) };
}
export type CatalogQuery = { q: string; category: string; color: string; size: string; min: string; max: string; available: boolean; sort: CatalogSort; page: number };
export function catalogQuery(params: URLSearchParams, sort: CatalogSort = "newest"): CatalogQuery {
  const price = (key: string) => { const s = params.get(key) ?? ""; return /^\d{1,9}(\.\d{1,2})?$/.test(s) ? s : ""; };
  const category = params.get("category") ?? "", page = Number(params.get("page") || 1);
  return { q: (params.get("q") ?? "").trim().slice(0,150), category: /^[0-9a-f-]{36}$/i.test(category) ? category : "", color: (params.get("color") ?? "").slice(0,100), size: (params.get("size") ?? "").slice(0,100), min: price("min"), max: price("max"), available: params.get("available") === "1", sort: catalogSorts.includes(params.get("sort") as CatalogSort) ? params.get("sort") as CatalogSort : sort, page: Number.isSafeInteger(page) && page > 0 ? Math.min(page,100000) : 1 };
}
export function catalogHref(q: CatalogQuery, patch: Partial<CatalogQuery> = {}) {
  const v = { ...q, ...patch }, params = new URLSearchParams();
  for (const k of ["q","category","color","size","min","max","sort"] as const) if (v[k]) params.set(k,v[k]);
  if (v.available) params.set("available","1"); if (v.page > 1) params.set("page",String(v.page));
  return "/catalogo?" + params.toString();
}
export type CatalogColor = { id: string; name: string; hex: string; swatch: string; photos: { path: string; alt: string }[]; min: number; max: number; available: boolean };
export type CatalogProduct = { id: string; name: string; min: number; max: number; currency: string | null; available: boolean; colors: CatalogColor[] };
export type Facet = { value: string; label: string; count: number };
export type CatalogResult = { products: CatalogProduct[]; total: number; page: number; perPage: number; categories: Facet[]; colors: Facet[]; sizes: Facet[] };
