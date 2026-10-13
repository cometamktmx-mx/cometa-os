import { requirePosOperationalAccess } from "@/lib/pos/access";
import { requirePosMutationAccess } from "@/lib/pos/mutation-access";
import { getBrandSlugFromUrl, handlePosError, ok, PosApiError, uuidValue } from "@/lib/pos/server";
import { readProductChannels } from "@/lib/pos/product-channels";
import { getPosMode } from "@/lib/pos/staff-server";
export const dynamic = "force-dynamic";
type Context={params:Promise<{productId:string}>};
export async function GET(request:Request,route:Context){
  try {
    const context=await requirePosOperationalAccess({brandSlug:getBrandSlugFromUrl(request),entitlement:"pos.products"});
    const id=uuidValue((await route.params).productId,"productId");
    if(!id)throw new PosApiError(400,"POS_PRODUCT_ID_REQUIRED","Se requiere el producto.");
    return ok({channels:await readProductChannels(context,id)});
  }catch(error){return handlePosError(error);}
}
export async function PATCH(request:Request,route:Context){
  try {
    const context=await requirePosMutationAccess({brandSlug:getBrandSlugFromUrl(request),operation:"products.write"});
    const id=uuidValue((await route.params).productId,"productId");
    if(!id)throw new PosApiError(400,"POS_PRODUCT_ID_REQUIRED","Se requiere el producto.");
    if(await getPosMode(context)!=="RETAIL")throw new PosApiError(409,"POS_CHANNELS_RETAIL_ONLY","Los canales M1 solo aplican a Retail.");
    const body:unknown=await request.json();
    if(!body||typeof body!=="object"||Array.isArray(body))throw new PosApiError(400,"POS_VALIDATION_ERROR","Canales inválidos.");
    const input=body as Record<string,unknown>;
    if(Object.keys(input).some(k=>!["physicalRequested","onlineRequested","revision"].includes(k))||
      typeof input.physicalRequested!=="boolean"||typeof input.onlineRequested!=="boolean"||
      !Number.isSafeInteger(input.revision)||Number(input.revision)<0||Number(input.revision)>2147483646)
      throw new PosApiError(400,"POS_VALIDATION_ERROR","Indica ambos canales y su revisión.");
    const {error}=await context.admin.rpc("pos_set_product_channels_m1",{
      p_brand_slug:context.brand.slug,p_product_id:id,p_actor:context.user.userId,
      p_physical:input.physicalRequested,p_online:input.onlineRequested,p_revision:input.revision,
    });
    if(error){
      if(error.message.includes("DENIED"))throw new PosApiError(403,"POS_CHANNELS_DENIED","No tienes permiso para cambiar estos canales.");
      if(error.message.includes("NOT_FOUND"))throw new PosApiError(404,"POS_PRODUCT_NOT_FOUND","Producto no disponible en esta marca.");
      if(error.message.includes("CONFLICT"))throw new PosApiError(409,"POS_CHANNELS_CONFLICT","Los canales cambiaron. Recarga antes de guardar.");
      if(error.message.includes("SERVICE_DISABLED"))throw new PosApiError(409,"POS_ONLINE_SERVICE_DISABLED","La tienda debe estar habilitada por un administrador global.");
      throw new PosApiError(503,"POS_CHANNELS_SAVE_FAILED","No se pudo confirmar el cambio. Recarga los canales para comprobar su estado.");
    }
    return ok({channels:await readProductChannels(context,id)});
  }catch(error){return handlePosError(error);}
}
