/** Pure catalog domain. No permissions, network, persistence, stock or channel state. */
export const SKU_MAX_LENGTH = 80;
export const POS_VARIANT_LIMIT = 250;
export const COMU_VARIANT_LIMIT = 100;
export type VariantAttributeDefinition = { code: string; sort_order: number };
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export function normalizeProductCode(value: string | null | undefined, previous?: string | null) {
  if (previous !== undefined && value === previous) return previous;
  if (!value?.trim()) return null;
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(code)) throw new Error("POS_PRODUCT_CODE_INVALID");
  return code;
}
export function validateSku(value: string | null | undefined, previous?: string | null) {
  if (previous !== undefined && value === previous) return previous;
  if (value && value.length > SKU_MAX_LENGTH) throw new Error("SKU_MAX_80");
  return value?.trim() || null;
}
/** Frozen POS identity comparator, retained only by its existing UI adapter. */
export function legacyVariantSignature(attributes: Record<string, unknown>) {
  return JSON.stringify(Object.fromEntries(Object.entries(attributes || {})
    .map(([key, value]) => [key.trim().toLowerCase(), String(value ?? "").trim().toLowerCase()])
    .filter(([, value]) => Boolean(value)).sort(([left], [right]) => left.localeCompare(right))));
}
// PostgreSQL btrim(text) strips spaces, not every JS whitespace character.
const sqlTrim = (value: string) => value.replace(/^ +| +$/g, "");
function jsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(jsonValue);
  if (typeof value === "object" && value) return Object.fromEntries(Object.keys(value).sort().map(k => [k, jsonValue((value as Record<string, unknown>)[k])]));
  throw new Error("POS_VARIANT_ATTRIBUTES_JSON_REQUIRED");
}
/** Same equivalence classes as pos_normalize_variant_attributes_v1; not a SQL text serialization. */
export function normalizeVariantAttributes(attributes: Record<string, unknown>) {
  if (!attributes || Array.isArray(attributes) || typeof attributes !== "object") throw new Error("POS_VARIANT_ATTRIBUTES_OBJECT_REQUIRED");
  const normalized: Record<string, JsonValue> = Object.create(null);
  for (const [key, value] of Object.entries(attributes)) {
    const code = sqlTrim(key).toLowerCase();
    if (!code) throw new Error("POS_VARIANT_ATTRIBUTE_KEY_REQUIRED");
    if (Object.hasOwn(normalized, code)) throw new Error("POS_VARIANT_ATTRIBUTE_KEY_COLLISION");
    normalized[code] = typeof value === "string" ? sqlTrim(value).toLowerCase() : jsonValue(value);
  }
  return Object.fromEntries(Object.keys(normalized).sort().map(k => [k, normalized[k]]));
}
export function variantSignature(attributes: Record<string, unknown>) { return JSON.stringify(normalizeVariantAttributes(attributes)); }

export function normalizeTokenSource(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
export function attributeToken(value: string) {
  const source = normalizeTokenSource(value);
  if (/^\d+$/.test(source)) return source;
  const words = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  return words.length > 1 ? words.map(word => word[0]).join("") : source.slice(0, 1) || "X";
}
export function createAttributeTokenMap(values: string[]) {
  const result = new Map<string, string>(), groups = new Map<string, string[]>();
  for (const value of values) { const base = attributeToken(value); groups.set(base, [...(groups.get(base) || []), value]); }
  for (const [base, group] of groups) {
    if (group.length === 1) { result.set(group[0], base); continue; }
    [...group].sort((a, b) => a.localeCompare(b, "es")).forEach((value, index) => {
      const expanded = normalizeTokenSource(value).slice(0, Math.max(3, base.length + 1)) || base;
      result.set(value, `${expanded}${index ? index + 1 : ""}`);
    });
  }
  return result;
}
export function generateMissingSkus<T extends { sku: string; attributes: Record<string, string> }>(variants: T[], productCode: string, attributes: VariantAttributeDefinition[]) {
  const code = productCode.trim().toUpperCase(), ordered = [...attributes].sort((a, b) => a.sort_order - b.sort_order);
  const maps = new Map(ordered.map(a => [a.code, createAttributeTokenMap([...new Set(variants.map(v => v.attributes[a.code] || "").map(v => v.trim()).filter(Boolean))])]));
  const occupied = new Set(variants.map(v => v.sku.trim().toUpperCase()).filter(Boolean));
  let generated = 0;
  const result = variants.map(v => {
    if (v.sku.trim()) return v;
    const tokens = ordered.map(a => maps.get(a.code)?.get((v.attributes[a.code] || "").trim()) || "").filter(Boolean);
    let candidate = tokens.length ? `${code}-${tokens.join("-")}` : code, suffix = 2;
    while (occupied.has(candidate)) candidate = `${code}-${tokens.join("-")}-${suffix++}`;
    occupied.add(candidate); generated += 1;
    return { ...v, sku: candidate };
  });
  return { variants: result, generated };
}
export function generateCombinations(dimensions: Array<{ code: string; values: string[] }>, limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > POS_VARIANT_LIMIT) throw new Error("VARIANT_LIMIT_INVALID");
  const populated = dimensions.map(d => ({ ...d, values: d.values.map(v => v.trim()).filter(Boolean) })).filter(d => d.values.length);
  let count = 1;
  for (const d of populated) { count *= d.values.length; if (count > limit) throw new Error("VARIANT_LIMIT_EXCEEDED"); }
  if (!populated.length) return [];
  return populated.reduce<Record<string, string>[]>((rows, d) => rows.flatMap(row => d.values.map(value => ({ ...row, [d.code]: value }))), [{}]);
}
export function reconcileVariants<T extends { id: string | null; localId: string; attributes: Record<string, string>; active: boolean }>(current: T[], combinations: Record<string, string>[], create: (index: number) => T, name: (variant: T, index: number) => string, signature: (attributes: Record<string, unknown>) => string = variantSignature) {
  const bySignature = new Map(current.map(v => [signature(v.attributes), v]));
  const technical = current.find(v => Object.values(v.attributes).every(value => !String(value || "").trim()));
  const used = new Set<string>();
  const generated = combinations.map((attributes, index) => {
    const existing = bySignature.get(signature(attributes)) || (index === 0 ? technical : undefined);
    if (existing) used.add(existing.localId);
    const next = existing || create(index);
    return { ...next, name: name({ ...next, attributes }, index), attributes, active: existing ? existing.active : true };
  });
  return [...generated, ...current.filter(v => v.id && !used.has(v.localId)).map(v => ({ ...v, active: false }))];
}
