import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireBrandOsAccess } from "@/lib/brand-os/server";
import { brandContextErrorResponse } from "@/lib/brand-os/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Missing Supabase server configuration");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type RowFilter = { column: string; values?: string[]; equals?: boolean };
async function countRows(client: ReturnType<typeof admin>, table: string, brandSlug: string, brandName: string, filter?: RowFilter) {
  try {
    let query = client.from(table).select("id", { count: "exact", head: true }).eq("brand_slug", brandSlug);
    if (filter?.values) query = query.in(filter.column, filter.values);
    if (typeof filter?.equals === "boolean") query = query.eq(filter.column, filter.equals);
    const result = await query;
    if (!result.error) return { value: result.count || 0, available: true };
    let legacy = client.from(table).select("id", { count: "exact", head: true }).is("brand_slug", null).eq("brand_name", brandName);
    if (filter?.values) legacy = legacy.in(filter.column, filter.values);
    if (typeof filter?.equals === "boolean") legacy = legacy.eq(filter.column, filter.equals);
    const legacyResult = await legacy;
    return legacyResult.error ? { value: 0, available: false } : { value: legacyResult.count || 0, available: true };
  } catch { return { value: 0, available: false }; }
}

export async function GET(request: Request, { params }: { params: Promise<{ brandSlug: string }> }) {
  try {
    const { brandSlug } = await params;
    const access = await requireBrandOsAccess(brandSlug);
    const client = admin();
    const slug = access.brand.slug;
    const name = access.brand.name;
    const [leads, hot, human, followups, contentReview, contentPublished, strategy, settings, pos] = await Promise.all([
      countRows(client, "sales_leads", slug, name),
      countRows(client, "sales_leads", slug, name, { column: "temperature", values: ["hot", "caliente"] }),
      countRows(client, "sales_leads", slug, name, { column: "requires_human", equals: true }),
      countRows(client, "sales_followups", slug, name, { column: "status", values: ["pending", "due", "overdue"] }),
      countRows(client, "mercury_content_items", slug, name, { column: "status", values: ["review", "in_review", "pending_review"] }),
      countRows(client, "mercury_content_items", slug, name, { column: "status", values: ["published"] }),
      countRows(client, "strategy_publications", slug, name),
      countRows(client, "sales_ai_settings", slug, name),
      countRows(client, "pos_subscriptions", slug, name),
    ]);
    const totalAttention = human.value + followups.value + contentReview.value;
    return NextResponse.json({ ok: true, brand: { id: access.brand.id, slug, name }, pulse: { attentionCount: totalAttention }, sales: { leads: leads.value, hotLeads: hot.value, requiresHuman: human.value, followupsPending: followups.value }, marketing: { strategyPublished: strategy.value > 0, contentInReview: contentReview.value, contentPublished: contentPublished.value }, work: { recent: [] }, intelligence: { signals: [] }, connections: { whatsapp: { status: settings.value > 0 ? "configured" : "available" }, pos: { status: pos.value > 0 ? "connected" : "available" } }, availability: { sales: leads.available, marketing: strategy.available || contentReview.available, connections: settings.available } });
  } catch (error: unknown) {
    console.error("[OS_COMMAND_CENTER]", error);
    return brandContextErrorResponse(error);
  }
}
