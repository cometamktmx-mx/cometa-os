export const sectionKinds = ["hero", "marquee", "categories", "featured", "look", "videos", "testimonials", "benefits", "wholesale", "faq", "newsletter"] as const;
export type SectionKind = typeof sectionKinds[number];
export type Entry = { title: string; text: string; image: string; url: string; productId: string };
export type Section = { id?: string; design?: ElementDesign; buttonLabel?: string; mediaLayout?: Appearance["mediaLayout"]; kind: SectionKind; enabled: boolean; title: string; text: string; image: string; url: string; entries: Entry[] };
import { parseProductConfig, type ProductConfig } from "./product-contract";
import { parsePageLayouts, type PageLayout, parseDesign, type DesignTarget, type ElementDesign, type FooterDesign } from "./design-contract";
import { parseCatalogConfig, type CatalogConfig } from "./catalog-contract";
export type Appearance = {
  schemaVersion?: 2; template?: {id:"atelier";version:1}; entranceText?: string;
  pageLayouts?: Partial<Record<"catalog"|"bag",PageLayout>>;
  headerDesign?: { identity: "text" | "logo" | "both"; centered: boolean; logoWidth: number; mobileLogoWidth: number; showAnnouncement: boolean; showNavigation: boolean };
  bag?: { title: string; description: string; emptyText: string; continueText: string; summaryTitle: string };
  design?: Partial<Record<DesignTarget, ElementDesign>>;
  footerDesign?: FooterDesign;
  mediaLayout?: Record<string, { mobileImage: string; x: number; y: number; mobileX: number; mobileY: number }>;
  buttonLabels?: Partial<Record<SectionKind, string>>;
  catalog?: CatalogConfig;
  product?: ProductConfig;
  name: string; logo: string; announcement: string; footer: string;
  paper: string; ink: string; accent: string; soft: string;
  font: "editorial" | "modern"; spacing: number; motion: boolean; entrance: boolean;
  navigation: { title: string; url: string }[]; sections: Section[];
};
export type ProductCard = { id: string; name: string; image: string | null; price: number | null; currency: string | null; soldOut: boolean };
export type HomeData = { appearance: Appearance; products: ProductCard[]; mediaBase: string };
export const emptyEntry = (): Entry => ({ title: "", text: "", image: "", url: "", productId: "" });
export const emptyAppearance = (): Appearance => ({ name: "", logo: "", announcement: "", footer: "", paper: "#fff9f5", ink: "#29191f", accent: "#740a32", soft: "#fce5ec", font: "editorial", spacing: 64, motion: true, entrance: true, navigation: [], sections: sectionKinds.map(kind => ({ kind, enabled: false, title: "", text: "", image: "", url: "", entries: [] })) });
export function safeLink(value: string): boolean {
  if (!value) return true;
  if (/^\/productos\/[0-9a-f-]{36}$/i.test(value)) return true;
  if (value === "/catalogo" || value === "/bolsa" || value === "/") return true;
  if (/^#[a-z][a-z0-9-]{0,62}$/.test(value)) return true;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
}
// Text only: no raw HTML, CSS, scripts, embedded forms or provider credentials.
export function parseAppearance(value: unknown, slug: string): Appearance {
  const fail = (): never => { throw new Error("APPEARANCE_INVALID"); };
  const object = (x: unknown): Record<string, unknown> => x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : fail();
  const text = (x: unknown, max = 2000) => typeof x === "string" && x.length <= max ? x.trim() : fail();
  const bool = (x: unknown) => typeof x === "boolean" ? x : fail();
  const array = (x: unknown, max: number): unknown[] => Array.isArray(x) && x.length <= max ? x : fail();
  const media = (x: unknown) => { const s = text(x, 250); return !s || (s.startsWith(slug + "/web/") && /^[a-zA-Z0-9/_-]+\.(jpg|jpeg|png|webp)$/.test(s)) ? s : fail(); };
  const link = (x: unknown) => { const s = text(x, 1000); return safeLink(s) ? s : fail(); };
  const color = (x: unknown) => { const s = text(x, 7); return /^#[a-fA-F0-9]{6}$/.test(s) ? s : fail(); };
  const o = object(value);
  if (o.schemaVersion !== undefined && o.schemaVersion !== 2) fail();
  if (o.template !== undefined && (object(o.template).id !== 'atelier' || object(o.template).version !== 1)) fail();
  const bag = o.bag === undefined ? undefined : object(o.bag);
  let headerDesign: Appearance["headerDesign"];
  if (o.headerDesign !== undefined) {
    const h = object(o.headerDesign);
    if (!["text","logo","both"].includes(String(h.identity)) || !Number.isInteger(h.logoWidth) || Number(h.logoWidth)<60 || Number(h.logoWidth)>300 || !Number.isInteger(h.mobileLogoWidth) || Number(h.mobileLogoWidth)<60 || Number(h.mobileLogoWidth)>220) fail();
    headerDesign = { identity:h.identity as "text"|"logo"|"both",centered:bool(h.centered),logoWidth:Number(h.logoWidth),mobileLogoWidth:Number(h.mobileLogoWidth),showAnnouncement:bool(h.showAnnouncement),showNavigation:bool(h.showNavigation) };
  }
  let footerDesign: FooterDesign | undefined;
  if (o.footerDesign !== undefined) {
    const f = object(o.footerDesign);
    if (!["text", "logo", "both", "none"].includes(String(f.identity))) fail();
    const size = (v: unknown, max: number) => Number.isInteger(v) && Number(v) >= 20 && Number(v) <= max ? Number(v) : fail();
    const links = (v: unknown) => array(v, 10).map(raw => { const n = object(raw); return { title: text(n.title, 80), url: link(n.url) }; });
    footerDesign = { identity: f.identity as FooterDesign["identity"], wordmark: bool(f.wordmark), wordmarkText: text(f.wordmarkText, 100), wordmarkSize: size(f.wordmarkSize, 180), mobileWordmarkSize: size(f.mobileWordmarkSize, 80), columns: array(f.columns, 4).map(raw => { const c = object(raw); return { title: text(c.title, 80), links: links(c.links) }; }), contact: text(f.contact, 1000), social: links(f.social) };
  }
  const mediaLayout: NonNullable<Appearance["mediaLayout"]> = {};
  for (const [path, raw] of Object.entries(o.mediaLayout === undefined ? {} : object(o.mediaLayout))) {
    if (Object.keys(mediaLayout).length >= 100 || !media(path)) fail();
    const v = object(raw), position = (x: unknown) => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 100 ? x : fail();
    mediaLayout[path] = { mobileImage: media(v.mobileImage), x: position(v.x), y: position(v.y), mobileX: position(v.mobileX), mobileY: position(v.mobileY) };
  }
  const buttonLabels: Appearance["buttonLabels"] = {};
  for (const [key, value] of Object.entries(o.buttonLabels === undefined ? {} : object(o.buttonLabels))) {
    if (!sectionKinds.includes(key as SectionKind)) fail();
    buttonLabels[key as SectionKind] = text(value, 80);
  }
  const sections = array(o.sections, o.schemaVersion === 2 ? 40 : 11).map(x => { const s = object(x); if (!sectionKinds.includes(s.kind as SectionKind)) fail(); return {
    ...(o.schemaVersion === 2 ? { id: typeof s.id === 'string' && /^(hero|marquee|categories|featured|look|videos|testimonials|benefits|wholesale|faq|newsletter|s-[a-z0-9-]{1,60})$/.test(s.id) ? s.id : fail() } : {}),
    ...(s.design === undefined ? {} : {design:parseDesign({hero:s.design}).hero}),
    ...(s.buttonLabel === undefined ? {} : {buttonLabel:text(s.buttonLabel,80)}),
    ...(s.mediaLayout === undefined ? {} : {mediaLayout:parseAppearance({...o,sections:sectionKinds.map(kind=>({kind,enabled:false,title:'',text:'',image:'',url:'',entries:[]})),schemaVersion:undefined,mediaLayout:s.mediaLayout},slug).mediaLayout}),
    kind: s.kind as SectionKind, enabled: bool(s.enabled), title: text(s.title, 150), text: text(s.text), image: media(s.image), url: link(s.url),
    entries: array(s.entries, 12).map(x => { const e = object(x); const id = text(e.productId, 36); if (id && !/^[0-9a-f-]{36}$/i.test(id)) fail(); return { title: text(e.title, 150), text: text(e.text), image: media(e.image), url: link(e.url), productId: id }; }),
  }; });
  if (o.schemaVersion === 2 ? new Set(sections.map(s=>s.id)).size !== sections.length : sections.length !== 11 || new Set(sections.map(s => s.kind)).size !== 11) fail();
  for (const s of sections) { const ids = s.entries.map(e => e.productId).filter(Boolean); if (new Set(ids).size !== ids.length) fail(); }
  if (o.font !== "editorial" && o.font !== "modern") fail();
  if (!Number.isInteger(o.spacing) || Number(o.spacing) < 24 || Number(o.spacing) > 100) fail();
  return { ...(o.schemaVersion === 2 ? {schemaVersion:2 as const} : {}), ...(o.template === undefined ? {} : {template:{id:'atelier' as const,version:1 as const}}), ...(o.entranceText === undefined ? {} : {entranceText:text(o.entranceText,12)}), ...(o.pageLayouts === undefined ? {} : {pageLayouts:parsePageLayouts(o.pageLayouts)}), ...(headerDesign ? {headerDesign} : {}), ...(bag ? { bag: { title:text(bag.title,100), description:text(bag.description,500), emptyText:text(bag.emptyText,200), continueText:text(bag.continueText,80), summaryTitle:text(bag.summaryTitle,100) } } : {}), ...(o.design === undefined ? {} : { design: parseDesign(o.design) }), ...(footerDesign ? { footerDesign } : {}), ...(o.mediaLayout === undefined ? {} : { mediaLayout }), ...(o.buttonLabels === undefined ? {} : { buttonLabels }), ...(o.product === undefined ? {} : { product: parseProductConfig(o.product) }), ...(o.catalog === undefined ? {} : { catalog: parseCatalogConfig(o.catalog, slug) }), name: text(o.name, 100), logo: media(o.logo), announcement: text(o.announcement, 200), footer: text(o.footer), paper: color(o.paper), ink: color(o.ink), accent: color(o.accent), soft: color(o.soft), font: o.font as Appearance["font"], spacing: Number(o.spacing), motion: bool(o.motion), entrance: bool(o.entrance), navigation: array(o.navigation, 8).map(x => { const n = object(x); return { title: text(n.title, 50), url: link(n.url) }; }), sections };
}
export function mediaUrl(base: string, path: string | null) { return path ? base + path.split("/").map(encodeURIComponent).join("/") : ""; }
