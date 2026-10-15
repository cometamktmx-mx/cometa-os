import {
  assertDatabaseResult,
  getBrandSlugFromUrl,
  handlePosError,
  ok,
} from "@/lib/pos/server";
import { requirePosOperationalAccess } from "@/lib/pos/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const brandSlug = getBrandSlugFromUrl(request);
    const { admin, brand } = await requirePosOperationalAccess({ brandSlug, entitlement: "pos.reports" });

    const url = new URL(request.url);
    const start =
      url.searchParams.get("start") ||
      new Date(
        new Date().setHours(0, 0, 0, 0)
      ).toISOString();
    const end =
      url.searchParams.get("end") ||
      new Date().toISOString();

    const { data, error } = await admin.rpc(
      "pos_report_summary",
      {
        p_brand_slug: brand.slug,
        p_start: start,
        p_end: end,
      }
    );

    assertDatabaseResult(
      error,
      "No se pudo generar el resumen comercial."
    );

    return ok({
      brand,
      period: {
        start,
        end,
      },
      summary: data,
    });
  } catch (error) {
    return handlePosError(error);
  }
}
