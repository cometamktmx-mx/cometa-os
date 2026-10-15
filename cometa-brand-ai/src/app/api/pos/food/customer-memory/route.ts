import { staffHasAnyRole, staffRoles } from "@/lib/pos/staff-shared";
﻿import { assertDatabaseResult, getBrandSlugFromUrl, handlePosError, ok, readJsonBody, requiredText, uuidValue } from "@/lib/pos/server";
import { requireFoodAccess } from "@/lib/pos/food-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MemoryBody = { brandSlug?: unknown; customerId?: unknown; allergyTags?: unknown; restrictionNote?: unknown };

function tags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(tag => typeof tag === "string" ? tag.trim() : "").filter(Boolean).slice(0, 20);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const brandSlug = getBrandSlugFromUrl(request);
    const customerId = uuidValue(url.searchParams.get("customerId"), "customerId", true);
    if (!customerId) return ok({ customer: null, profile: null, recentPurchases: [], topProducts: [] });
    const { context, session } = await requireFoodAccess(brandSlug, "customer_set");
    const { admin, brand } = context;
    const { data: customer, error: customerError } = await admin.from("pos_customers").select("id,brand_slug,first_name,last_name,phone,email,notes,active").eq("id", customerId).eq("brand_slug", brand.slug).eq("active", true).maybeSingle();
    assertDatabaseResult(customerError, "No se pudo cargar el cliente.");
    if (!customer) return ok({ customer: null, profile: null, recentPurchases: [], topProducts: [] });
    const [{ data: profile, error: profileError }, { data: sales, error: salesError }, { data: loyalty, error: loyaltyError }, { data: allSales, error: allSalesError }] = await Promise.all([
      admin.from("pos_customer_food_profiles").select("allergy_tags,restriction_note,confirmed_at,updated_at").eq("brand_slug", brand.slug).eq("customer_id", customerId).maybeSingle(),
      admin.from("pos_sales").select("id,sale_number,total,sold_at,pos_sale_items(product_name,variant_name,quantity)").eq("brand_slug", brand.slug).eq("customer_id", customerId).eq("status", "completed").order("sold_at", { ascending: false }),
      admin.from("pos_loyalty_members").select("points_balance").eq("brand_slug", brand.slug).eq("customer_id", customerId).eq("status", "active").maybeSingle(),
      admin.from("pos_sales").select("total").eq("brand_slug", brand.slug).eq("customer_id", customerId).eq("status", "completed"),
    ]);
    assertDatabaseResult(profileError, "No se pudo cargar el perfil Food.");
    assertDatabaseResult(salesError, "No se pudo cargar el historial del cliente.");
    assertDatabaseResult(loyaltyError, "No se pudo cargar el saldo Loyalty.");
    assertDatabaseResult(allSalesError, "No se pudo calcular el total del cliente.");
    const salesRows = (sales || []) as Array<{ id: string; sale_number: string; total: number; sold_at: string; pos_sale_items?: Array<{ product_name: string; variant_name: string; quantity: number }> }>;
    const rows = salesRows.map(sale => ({ id: sale.id, saleNumber: sale.sale_number, total: Number(sale.total), soldAt: sale.sold_at, items: Array.isArray(sale.pos_sale_items) ? sale.pos_sale_items : [] }));
    const counts = new Map<string, { productName: string; variantName: string; orders: number; lastOrderedAt: string }>();
    for (const sale of rows) for (const item of sale.items) {
      const key = `${item.product_name}::${item.variant_name}`;
      const current = counts.get(key);
      if (current) { current.orders += Number(item.quantity || 0); }
      else counts.set(key, { productName: item.product_name, variantName: item.variant_name, orders: Number(item.quantity || 0), lastOrderedAt: sale.soldAt });
    }
    const memory = { customer, profile: profile || { allergy_tags: [], restriction_note: null, confirmed_at: null, updated_at: null }, pointsBalance: Number(loyalty?.points_balance || 0), visits: (allSales || []).length, totalSpent: (allSales || []).reduce((sum, row) => sum + Number(row.total || 0), 0), recentPurchases: rows.slice(0, 10), topProducts: [...counts.values()].sort((a, b) => b.orders - a.orders).slice(0, 5) };
    return ok(staffRoles(session.staff).every(role => role === "KITCHEN") ? { customer: { ...customer, notes: null }, profile: memory.profile, allergyAlert: memory.profile.allergy_tags, pointsBalance: null, visits: null, totalSpent: null, recentPurchases: [], topProducts: [] } : memory);
  } catch (error) { return handlePosError(error); }
}

export async function PATCH(request: Request) {
  try {
    const body = await readJsonBody<MemoryBody>(request);
    const brandSlug = requiredText(body.brandSlug, "brandSlug", 120);
    const customerId = uuidValue(body.customerId, "customerId", true);
    if (!customerId) throw new Error("customerId es obligatorio.");
    const { context, session } = await requireFoodAccess(brandSlug, "customer_set");
    if (!staffHasAnyRole(session.staff, ["ADMIN", "MANAGER", "WAITER"])) return Response.json({ error: "Este operador sólo puede consultar el perfil Food." }, { status: 403 });
    const { admin, brand, user } = context;
    const { data: customer, error: customerError } = await admin.from("pos_customers").select("id").eq("id", customerId).eq("brand_slug", brand.slug).eq("active", true).maybeSingle();
    assertDatabaseResult(customerError, "No se pudo validar el cliente.");
    if (!customer) return Response.json({ error: "El cliente no pertenece a esta marca." }, { status: 404 });
    const allergyTags = tags(body.allergyTags);
    const restrictionNote = typeof body.restrictionNote === "string" ? body.restrictionNote.trim().slice(0, 500) || null : null;
    const { data, error } = await admin.from("pos_customer_food_profiles").upsert({ brand_slug: brand.slug, customer_id: customerId, allergy_tags: allergyTags, restriction_note: restrictionNote, confirmed_at: new Date().toISOString(), updated_by: user.userId }, { onConflict: "brand_slug,customer_id" }).select("allergy_tags,restriction_note,confirmed_at,updated_at").single();
    assertDatabaseResult(error, "No se pudo guardar el perfil Food.");
    return ok({ profile: data });
  } catch (error) { return handlePosError(error); }
}
