import { NextResponse } from "next/server";
import { brandContextErrorResponse } from "@/lib/brand-os/api";
import { requireCanonicalBrandContext } from "@/lib/brand-os/server";
import {
  buildSalesKnowledgeContext,
  getSalesKnowledgeBase,
} from "@/lib/sales-ai/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const context = await requireCanonicalBrandContext({
      brandSlug: searchParams.get("brandSlug"),
      legacyBrandName: searchParams.get("brandName"),
    });
    const knowledgeBase = await getSalesKnowledgeBase(context.brandName);
    const content = buildSalesKnowledgeContext(knowledgeBase);

    return NextResponse.json({
      ok: true,
      brand: {
        id: context.brandId,
        slug: context.brandSlug,
        name: context.brandName,
      },
      counts: {
        knowledgeSources: knowledgeBase.knowledgeSources.length,
        catalogItems: knowledgeBase.catalogItems.length,
        businessRules: knowledgeBase.businessRules.length,
        faqs: knowledgeBase.faqs.length,
        suggestions: knowledgeBase.suggestions.length,
      },
      knowledgeBase,
      context: content,
    });
  } catch (error: unknown) {
    return brandContextErrorResponse(error);
  }
}
