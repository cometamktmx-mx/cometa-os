import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readOnlineStoreService } from "@/lib/workspace/online-store-access";
import { PosApiError, type PosRequestContext } from "./server";
import { getPosMode } from "./staff-server";

export type ProductChannels = {
  physicalRequested: boolean; onlineRequested: boolean; revision: number;
  physicalEffective: boolean; onlineEffective: boolean; catalogEligible: boolean;
  canManagePhysical: boolean; canManageOnline: boolean; serviceStatus: "enabled" | "disabled" | "suspended" | "unknown";
};
export async function readProductChannels(context: PosRequestContext, productId: string): Promise<ProductChannels> {
  if (await getPosMode(context) !== "RETAIL") throw new PosApiError(409,"POS_CHANNELS_RETAIL_ONLY","Los canales M1 solo aplican a Retail.");
  const {admin,brand,user,membership}=context;
  const [product, channels, variants, brandRow] = await Promise.all([
    admin.from("pos_products").select("id,active,sellable,product_type,inventory_mode").eq("id",productId).eq("brand_slug",brand.slug).eq("brand_id",brand.id).maybeSingle(),
    admin.from("pos_product_sales_channels").select("physical_requested,online_requested,revision").eq("product_id",productId).maybeSingle(),
    admin.from("pos_product_variants").select("id").eq("product_id",productId).eq("brand_slug",brand.slug).eq("active",true).limit(1),
    admin.from("brands").select("status").eq("id",brand.id).eq("slug",brand.slug).maybeSingle(),
  ]);
  if(product.error||channels.error||variants.error||brandRow.error) throw new PosApiError(503,"POS_CHANNELS_LOOKUP_FAILED","No se pudieron consultar los canales. No se guardó ningún cambio.");
  if(!product.data) throw new PosApiError(404,"POS_PRODUCT_NOT_FOUND","Producto no disponible en esta marca.");
  let serviceStatus:ProductChannels["serviceStatus"]="unknown";
  try { serviceStatus=(await readOnlineStoreService(admin,brand.id)).status; } catch { /* No grants on failed lookup. Physical management remains independent. */ }
  const c=channels.data;
  if(c&&(typeof c.physical_requested!=="boolean"||typeof c.online_requested!=="boolean"||!Number.isSafeInteger(c.revision))) throw new PosApiError(503,"POS_CHANNELS_INVALID","Los canales requieren revisión.");
  const physicalRequested=c?.physical_requested??true,onlineRequested=c?.online_requested??false;
  const eligible=product.data.active===true&&product.data.sellable===true&&product.data.product_type==="physical"&&product.data.inventory_mode==="direct"&&Boolean(variants.data?.length);
  return {physicalRequested,onlineRequested,revision:c?.revision??0,
    physicalEffective:physicalRequested&&product.data.active===true&&product.data.sellable===true,
    onlineEffective:onlineRequested&&serviceStatus==="enabled"&&brandRow.data?.status==="active"&&eligible,
    catalogEligible:eligible,canManagePhysical:user.isAdmin||Boolean(membership?.permissions.includes("pos.products.write")),
    canManageOnline:user.isAdmin||membership?.role==="owner"||membership?.role==="admin",serviceStatus};
}

/** Negative selections only; absent rows preserve legacy sellable behavior. */
export async function physicalExclusions(admin: SupabaseClient, brandSlug: string): Promise<string[]> {
  const ids:string[]=[];
  for(let from=0;;from+=500){
    const {data,error}=await admin.from("pos_product_sales_channels")
      .select("product_id,product:pos_products!inner(brand_slug)").eq("product.brand_slug",brandSlug).eq("physical_requested",false)
      .order("product_id").range(from,from+499);
    if(error)throw new PosApiError(503,"POS_CHANNELS_LOOKUP_FAILED","No se pudo verificar el canal físico.");
    ids.push(...(data??[]).map(row=>String(row.product_id)));
    if((data??[]).length<500)return ids;
  }
}
export async function physicalRequestedForProduct(admin: SupabaseClient, productId:string) {
  const {data,error}=await admin.from("pos_product_sales_channels").select("physical_requested").eq("product_id",productId).maybeSingle();
  if(error)throw new PosApiError(503,"POS_CHANNELS_LOOKUP_FAILED","No se pudo verificar el canal físico.");
  return data ? data.physical_requested === true : true;
}
