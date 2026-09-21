import type { ComuActor } from "./seller-access";

export type Availability = "available" | "low_stock" | "out_of_stock";

export async function getAvailability(admin: ComuActor["admin"], variantIds: string[]) {
  if (!variantIds.length) return new Map<string, Availability>();
  await admin.rpc("comu_expire_inventory_reservations");
  const { data } = await admin.from("pos_inventory").select("variant_id,location_id,quantity,reserved_quantity").in("variant_id", variantIds);
  const inventoryRows = data || [];
  const totals = new Map<string, number>();
  for (const row of inventoryRows) {
    totals.set(row.variant_id, (totals.get(row.variant_id) || 0) + Number(row.quantity || 0) - Number(row.reserved_quantity || 0));
  }
  return new Map(variantIds.map((id) => { const quantity = totals.get(id) || 0; return [id, quantity <= 0 ? "out_of_stock" : quantity <= 3 ? "low_stock" : "available"] as const; }));
}
