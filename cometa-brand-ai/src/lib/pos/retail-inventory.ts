export type InventoryVariant = {
  id: string; name: string; sku: string | null; barcode: string | null; attributes: Record<string, unknown>;
  unit_code: string; image_url: string | null; quantity: number; reserved: number; available: number; outside: number; version: string;
};
export type InventoryModel = { id: string; name: string; product_code: string | null; image_url: string | null; category_id: string | null; variants: InventoryVariant[]; quantity: number; reserved: number; available: number; outside: number };
export type InventoryAction = "receive" | "count" | "out" | "return" | "dispose";
export function variantLabel(v: Pick<InventoryVariant, "name" | "attributes">) {
  return Object.values(v.attributes || {}).filter(x => typeof x === "string" && x.trim()).join(" / ") || v.name.replace(/\s+[?\ufffd]\s+/g, " / ");
}
export function variantMatrix(variants: InventoryVariant[]) {
  const attrs = variants.map(v => Object.entries(v.attributes || {}).filter(([, value]) => typeof value === "string" && value.trim()));
  const sizeKeys = ["size", "talla"], colorKeys = ["color", "colour"];
  if (!attrs.every(a => a.length > 0 && a.every(([key]) => [...sizeKeys, ...colorKeys].includes(key)))) return null;
  const cells = variants.map((v, index) => ({ variant: v, size: String(attrs[index].find(([k]) => sizeKeys.includes(k))?.[1] || "Única"), color: String(attrs[index].find(([k]) => colorKeys.includes(k))?.[1] || "Único") }));
  if (new Set(cells.map(c => JSON.stringify([c.color, c.size]))).size !== cells.length) return null;
  return { sizes: [...new Set(cells.map(c => c.size))], colors: [...new Set(cells.map(c => c.color))], cells };
}
export function capturedRows(models: InventoryModel[], values: Record<string, string>, action: InventoryAction) {
  return models.flatMap(model => model.variants.filter(v => (values[v.id] ?? "").trim() !== "").map(v => {
    const quantity = Number(values[v.id]);
    if (!Number.isFinite(quantity) || quantity < 0 || quantity > 1000000 || (v.unit_code === "piece" && !Number.isSafeInteger(quantity)) || Math.round(quantity * 1000) !== quantity * 1000) throw new Error(`Revisa la cantidad de ${model.name}, ${variantLabel(v)}.`);
    if (action !== "count" && quantity === 0) return null;
    if (action === "count" && quantity < v.reserved) throw new Error(`${model.name}, ${variantLabel(v)}: hay ${v.reserved} reservadas. El conteo no puede ser menor.`);
    if (action === "out" && quantity > v.available) throw new Error(`${model.name}, ${variantLabel(v)}: solo hay ${v.available} disponibles.`);
    return { variant_id: v.id, quantity, version: v.version };
  }).filter((v): v is NonNullable<typeof v> => v !== null));
}
