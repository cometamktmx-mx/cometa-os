import { NextResponse } from "next/server";
import {
  buildSalesKnowledgeContext,
  getSalesKnowledgeBase,
} from "@/lib/sales-ai/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const brandName = searchParams.get("brandName") || "Mar Cosmetic";

    const knowledgeBase = await getSalesKnowledgeBase(brandName);
    const context = buildSalesKnowledgeContext(knowledgeBase);

    return NextResponse.json({
      ok: true,
      brandName,
      counts: {
        knowledgeSources: knowledgeBase.knowledgeSources.length,
        catalogItems: knowledgeBase.catalogItems.length,
        businessRules: knowledgeBase.businessRules.length,
        faqs: knowledgeBase.faqs.length,
        suggestions: knowledgeBase.suggestions.length,
      },
      knowledgeBase,
      context,
    });
  } catch (error: any) {
    console.error("Error generando contexto de Knowledge Base:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Error generando contexto de Knowledge Base",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}