import { requireFoodAccess, assertFoodResult } from "@/lib/pos/food-server";
import { getBrandSlugFromUrl, handlePosError, ok, uuidValue } from "@/lib/pos/server";
import { requirePosCommercialAccess } from "@/lib/pos/access";

export async function GET(request: Request) {
  try {
    const { context, session } = await requireFoodAccess(getBrandSlugFromUrl(request));
    await requirePosCommercialAccess(context, "pos.cash");
    const cashSessionId = uuidValue(new URL(request.url).searchParams.get("cashSessionId"), "cashSessionId", false);
    const { data, error } = await context.admin.rpc("pos_cash_history_v1", { p_brand_slug: context.brand.slug, p_host_user_id: context.user.userId, p_session_id: session.id, p_cash_session_id: cashSessionId });
    if (error) assertFoodResult(error, null);
    return ok({ events: Array.isArray(data) ? data : [] });
  } catch (error) { return handlePosError(error); }
}
