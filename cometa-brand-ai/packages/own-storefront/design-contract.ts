export const designTargets = ["header", "hero", "marquee", "categories", "featured", "look", "videos", "testimonials", "benefits", "wholesale", "faq", "newsletter", "catalog", "product", "bag", "footer"] as const;
export type DesignTarget = typeof designTargets[number];
export const pageBlockKinds = { catalog: ["intro","categories","search","toolbar","products"], bag: ["intro","progress","contents"] } as const;
export type PageLayout = { blocks: {kind:string;enabled:boolean}[]; summary: "side" | "below" };
export function defaultPageLayout(page:"catalog"|"bag"):PageLayout { return {blocks:pageBlockKinds[page].map(kind=>({kind,enabled:true})),summary:"side"}; }
export function parsePageLayouts(value:unknown):Partial<Record<"catalog"|"bag",PageLayout>> {
  if(!value||typeof value!=="object"||Array.isArray(value))throw Error("APPEARANCE_INVALID");
  const result:Partial<Record<"catalog"|"bag",PageLayout>>={};
  for(const [page,raw] of Object.entries(value)){
    if((page!=="catalog"&&page!=="bag")||!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("APPEARANCE_INVALID");
    const v=raw as Record<string,unknown>,kinds:readonly string[]=pageBlockKinds[page];
    if(!Array.isArray(v.blocks)||v.blocks.length!==kinds.length||!["side","below"].includes(String(v.summary)))throw Error("APPEARANCE_INVALID");
    const blocks=v.blocks.map(raw=>{if(!raw||typeof raw!=="object"||!kinds.includes(raw.kind)||typeof raw.enabled!=="boolean")throw Error("APPEARANCE_INVALID");return {kind:String(raw.kind),enabled:raw.enabled};});
    if(new Set(blocks.map(b=>b.kind)).size!==kinds.length||!blocks.find(b=>b.kind===(page==="catalog"?"products":"contents"))?.enabled)throw Error("APPEARANCE_INVALID");
    result[page]={blocks,summary:v.summary as PageLayout["summary"]};
  }
  return result;
}
export type ElementDesign = { background: string; color: string; font: "inherit" | "editorial" | "modern"; titleSize: number; mobileTitleSize: number; textSize: number; mobileTextSize: number; padding: number; mobilePadding: number; align: "left" | "center" | "right"; columns: number; mobileColumns: number; buttonColor: string; buttonText: string; buttonRadius: number };
export type FooterDesign = { identity: "text" | "logo" | "both" | "none"; wordmark: boolean; wordmarkText: string; wordmarkSize: number; mobileWordmarkSize: number; columns: { title: string; links: { title: string; url: string }[] }[]; contact: string; social: { title: string; url: string }[] };
export const defaultElementDesign = (): ElementDesign => ({ background: "", color: "", font: "inherit", titleSize: 48, mobileTitleSize: 34, textSize: 16, mobileTextSize: 14, padding: 48, mobilePadding: 28, align: "left", columns: 4, mobileColumns: 2, buttonColor: "", buttonText: "", buttonRadius: 0 });
export const defaultFooterDesign = (): FooterDesign => ({ identity: "text", wordmark: false, wordmarkText: "", wordmarkSize: 100, mobileWordmarkSize: 44, columns: [], contact: "", social: [] });
export function parseDesign(value: unknown): Partial<Record<DesignTarget, ElementDesign>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("APPEARANCE_INVALID");
  const out: Partial<Record<DesignTarget, ElementDesign>> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!designTargets.includes(key as DesignTarget) || !raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("APPEARANCE_INVALID");
    const v = raw as Record<string, unknown>, d = defaultElementDesign();
    for (const k of ["background", "color", "buttonColor", "buttonText"] as const) { if (typeof v[k] !== "string" || (v[k] !== "" && !/^#[a-f0-9]{6}$/i.test(v[k] as string))) throw Error("APPEARANCE_INVALID"); d[k] = v[k] as string; }
    for (const [k, min, max] of [["titleSize",16,120],["mobileTitleSize",16,72],["textSize",12,28],["mobileTextSize",12,24],["padding",0,120],["mobilePadding",0,72],["columns",1,5],["mobileColumns",1,2],["buttonRadius",0,32]] as const) { if (!Number.isInteger(v[k]) || Number(v[k]) < min || Number(v[k]) > max) throw Error("APPEARANCE_INVALID"); d[k] = Number(v[k]); }
    if (!["inherit","editorial","modern"].includes(String(v.font)) || !["left","center","right"].includes(String(v.align))) throw Error("APPEARANCE_INVALID");
    d.font = v.font as ElementDesign["font"]; d.align = v.align as ElementDesign["align"]; out[key as DesignTarget] = d;
  }
  return out;
}
