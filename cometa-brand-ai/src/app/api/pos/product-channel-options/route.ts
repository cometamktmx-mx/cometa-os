import { requirePosOperationalAccess } from "@/lib/pos/access";
import { getBrandSlugFromUrl, handlePosError, ok } from "@/lib/pos/server";
import { readOnlineStoreService } from "@/lib/workspace/online-store-access";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const context = await requirePosOperationalAccess({ brandSlug: getBrandSlugFromUrl(request), entitlement: "pos.products" });
    const service = await readOnlineStoreService(context.admin, context.brand.id);
    return ok({ onlineEnabled: service.status === "enabled", canManageOnline: context.user.isAdmin || ["owner", "admin"].includes(context.membership?.role ?? "") });
  } catch (error) { return handlePosError(error); }
}
