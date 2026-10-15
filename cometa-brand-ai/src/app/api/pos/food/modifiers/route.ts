import { getBrandSlugFromUrl, handlePosError, ok, PosApiError, readJsonBody, requiredText, uuidValue } from "@/lib/pos/server";
import { requirePosAdminSurfaceAccess } from "@/lib/pos/admin-access";
import { requireStaffSession } from "@/lib/pos/staff-server";
import { assertFoodResult } from "@/lib/pos/food-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function access(brandSlug: string) {
  const context = await requirePosAdminSurfaceAccess(brandSlug);
  const session = await requireStaffSession(context,"STAFF_MANAGE");
  return { context, session };
}

export async function GET(request: Request) {
  try {
    const { context, session } = await access(getBrandSlugFromUrl(request));
    const { data,error } = await context.admin.rpc("pos_food_modifiers_catalog_v1",{p_brand_slug:context.brand.slug,p_host_user_id:context.user.userId,p_session_id:session.id});
    assertFoodResult(error,data);
    return ok({catalog:data});
  } catch(error) { return handlePosError(error); }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<Record<string,unknown>>(request);
    const {context,session} = await access(requiredText(body.brandSlug,"brandSlug",120));
    const action = requiredText(body.action,"action",40);
    const payload: Record<string,unknown> = {};
    function integer(key:string,min:number,max:number) {
      const value=body[key];
      if(typeof value!=="number" || !Number.isSafeInteger(value) || value<min || value>max) throw new PosApiError(400,"POS_VALIDATION_ERROR",`Valor inválido: ${key}.`);
      payload[key]=value; return value;
    }
    function boolean(key:string) {
      if(typeof body[key]!=="boolean") throw new PosApiError(400,"POS_VALIDATION_ERROR",`Valor inválido: ${key}.`);
      payload[key]=body[key];
    }
    if(action==="group_save" || action==="option_save") {
      if(body.id!=null) payload.id=uuidValue(body.id,"id");
      payload.name=requiredText(body.name,"name",100);
      integer("display_order",0,100000); boolean("active");
      if(action==="group_save") {
        boolean("required");
        const min=integer("min_selections",0,100),max=integer("max_selections",1,100);
        if(!["single","multiple"].includes(String(body.selection_mode)) || min>max || (body.required && min<1) || (body.selection_mode==="single" && max!==1)) throw new PosApiError(400,"POS_VALIDATION_ERROR","Límites del grupo inválidos.");
        payload.selection_mode=body.selection_mode;
      } else {
        payload.group_id=uuidValue(body.group_id,"group_id");
        if(!["choice","add","remove"].includes(String(body.type))) throw new PosApiError(400,"POS_VALIDATION_ERROR","Tipo de opción inválido.");
        const delta=body.price_delta;
        if(typeof delta!=="number" || !Number.isFinite(delta) || Math.abs(delta)>1000000 || (delta<0 && body.type!=="remove") || Math.abs(delta*100-Math.round(delta*100))>0.00001) throw new PosApiError(400,"POS_VALIDATION_ERROR","Precio extra inválido.");
        payload.type=body.type; payload.price_delta=delta;
      }
    } else if(action==="product_groups_save") {
      payload.product_id=uuidValue(body.product_id,"product_id");
      if(!Array.isArray(body.group_ids) || body.group_ids.length>100) throw new PosApiError(400,"POS_VALIDATION_ERROR","Grupos inválidos.");
      const ids=body.group_ids.map(id=>uuidValue(id,"groupId"));
      if(new Set(ids).size!==ids.length) throw new PosApiError(400,"POS_VALIDATION_ERROR","No repitas grupos.");
      payload.group_ids=ids;
    } else throw new PosApiError(400,"POS_VALIDATION_ERROR","Acción de configuración inválida.");
    const {data,error}=await context.admin.rpc("pos_food_modifiers_admin_v1",{p_brand_slug:context.brand.slug,p_host_user_id:context.user.userId,p_session_id:session.id,p_action:action,p_payload:payload});
    assertFoodResult(error,data);
    return ok({result:data});
  } catch(error) {return handlePosError(error);}
}
