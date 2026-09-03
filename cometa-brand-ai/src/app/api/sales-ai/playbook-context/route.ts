import { NextResponse } from "next/server";
import { brandContextErrorResponse } from "@/lib/brand-os/api";
import { requireCanonicalBrandContext } from "@/lib/brand-os/server";
import {
  buildSalesPlaybookContext,
  getSalesPlaybook,
} from "@/lib/sales-ai/playbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const context = await requireCanonicalBrandContext({
      brandSlug: searchParams.get("brandSlug"),
      legacyBrandName: searchParams.get("brandName"),
    });
    const playbook = await getSalesPlaybook(context.brandName);

    return NextResponse.json({
      ok: true,
      brand: {
        id: context.brandId,
        slug: context.brandSlug,
        name: context.brandName,
      },
      playbook,
      context: buildSalesPlaybookContext(playbook),
    });
  } catch (error: unknown) {
    return brandContextErrorResponse(error);
  }
}
