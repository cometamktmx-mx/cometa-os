/** Product content only. Layout, commerce rules and prices are not editable here. */
export const WEB_ICONS = ["spark", "layers", "heart", "feather", "shield", "ruler"] as const;
export type WebIcon = typeof WEB_ICONS[number];
export type WebPhoto = { path: string; alt: string };
export type WebColor = { id: string; name: string; variantIds: string[]; hex: string; swatchPath: string; photos: WebPhoto[] };
export type WebContent = {
  colors: WebColor[];
  benefits: { id: string; icon: WebIcon; title: string; description: string; enabled: boolean }[];
  details: { id: string; title: string; content: string; enabled: boolean; open: boolean }[];
  guide: { content: string; columns: string[]; rows: string[][]; imagePath: string };
  relatedIds: string[];
  wholesale: { enabled: boolean; title: string; content: string };
};
export type WebVariant = { id: string; name: string; attributes: Record<string, unknown>; price: number; available: number; active: boolean };
export type WebCatalog = { id: string; name: string; brandName: string; currency: string | null; variants: WebVariant[] };
export type WebRecord = { revision: number; draft: WebContent; published: WebContent | null; publishedRevision: number | null };
export const emptyWebContent = (): WebContent => ({ colors: [], benefits: [], details: [], guide: { content: "", columns: [], rows: [], imagePath: "" }, relatedIds: [], wholesale: { enabled: false, title: "", content: "" } });
export function webPhotos(content: WebContent, colorId: string): WebPhoto[] {
  return content.colors.find(c => c.id === colorId)?.photos ?? [];
}
export function webMediaPaths(content: WebContent): string[] {
  return [...new Set([...content.colors.flatMap(c => [...c.photos.map(p => p.path), c.swatchPath]), content.guide.imagePath].filter(Boolean))];
}
export function parseWebContent(value: unknown, brandSlug: string): WebContent {
  const invalid = () => { throw new Error("Contenido inválido: revisa campos, límites y referencias duplicadas."); };
  const object = (v: unknown, keys: string[]): Record<string, unknown> => {
    if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).some(k => !keys.includes(k))) return invalid();
    return v as Record<string, unknown>;
  };
  const text = (v: unknown, max: number): string => typeof v === "string" && v.length <= max && !v.includes("\u0000") ? v : invalid();
  const bool = (v: unknown): boolean => typeof v === "boolean" ? v : invalid();
  const list = (v: unknown, max: number): unknown[] => Array.isArray(v) && v.length <= max ? v : invalid();
  const uuid = (v: unknown): string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : invalid();
  const unique = <T,>(v: T[]): T[] => new Set(v).size === v.length ? v : invalid();
  const media = (v: unknown): string => {
    const p = text(v, 300);
    // Dedicated immutable web namespace in the existing POS media bucket.
    if (p && (!p.startsWith(`${brandSlug}/web/`) || !/^[a-z0-9-]+\/web\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(p))) return invalid();
    return p;
  };
  const c = object(value, ["colors", "benefits", "details", "guide", "relatedIds", "wholesale"]);
  const colors = list(c.colors, 40).map(v => {
    const x = object(v, ["id", "name", "variantIds", "hex", "swatchPath", "photos"]);
    const hex = text(x.hex, 7); if (hex && !/^#[0-9a-f]{6}$/i.test(hex)) return invalid();
    const photos = list(x.photos, 12).map(v => { const p = object(v, ["path", "alt"]); const path = media(p.path); if (!path) return invalid(); return { path, alt: text(p.alt, 250) }; });
    unique(photos.map(p => p.path));
    const variantIds = unique(list(x.variantIds, 250).map(uuid)); if (!variantIds.length) return invalid();
    return { id: uuid(x.id), name: text(x.name, 80), variantIds, hex, swatchPath: media(x.swatchPath), photos };
  });
  unique(colors.map(c => c.id)); unique(colors.flatMap(c => c.variantIds));
  const benefits = list(c.benefits, 12).map(v => {
    const x = object(v, ["id", "icon", "title", "description", "enabled"]);
    if (!WEB_ICONS.includes(x.icon as WebIcon)) return invalid();
    return { id: uuid(x.id), icon: x.icon as WebIcon, title: text(x.title, 100), description: text(x.description, 600), enabled: bool(x.enabled) };
  });
  const details = list(c.details, 12).map(v => {
    const x = object(v, ["id", "title", "content", "enabled", "open"]);
    return { id: uuid(x.id), title: text(x.title, 120), content: text(x.content, 8000), enabled: bool(x.enabled), open: bool(x.open) };
  });
  unique(benefits.map(x => x.id)); unique(details.map(x => x.id));
  const g = object(c.guide, ["content", "columns", "rows", "imagePath"]);
  const columns = list(g.columns, 10).map(x => text(x, 80));
  const rows = list(g.rows, 30).map(v => { const row = list(v, 10).map(x => text(x, 100)); if (row.length !== columns.length) return invalid(); return row; });
  const w = object(c.wholesale, ["enabled", "title", "content"]);
  return { colors, benefits, details, guide: { content: text(g.content, 8000), columns, rows, imagePath: media(g.imagePath) }, relatedIds: unique(list(c.relatedIds, 12).map(uuid)), wholesale: { enabled: bool(w.enabled), title: text(w.title, 120), content: text(w.content, 4000) } };
}
