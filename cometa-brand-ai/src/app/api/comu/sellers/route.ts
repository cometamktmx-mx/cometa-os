import { NextResponse } from "next/server";
import { requireComuFeature } from "@/lib/comu/features";
import { changeSellerCommercialState } from "@/lib/comu/seller-activation";
import { requireComuActor } from "@/lib/comu/seller-access";
import { getAdminClient } from "@/lib/pos/server";

function fail(error: unknown) {
  const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: unknown }).status) || 500 : 500;
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "COMU_REQUEST_FAILED";
  return NextResponse.json({ ok: false, code, error: error instanceof Error ? error.message : "No se pudo completar la operación." }, { status });
}

export async function GET(request: Request) {
  try {
    requireComuFeature("enabled");
    const url = new URL(request.url);
    if (url.searchParams.get("mine") === "1") {
      const actor = await requireComuActor();
      const admin = actor.admin;
      const { data: memberships, error } = await actor.admin.from("comu_seller_memberships").select("seller_id,role,active").eq("user_id", actor.userId).eq("active", true);
      if (error) throw error;
      const ids = (memberships || []).map((item) => item.seller_id);
      const { data: sellers } = ids.length ? await admin.from("comu_sellers").select("*,comu_storefronts(id,name)").in("id", ids) : { data: [] };
      return NextResponse.json({ ok: true, sellers: sellers || [], memberships: memberships || [] });
    }
    if (url.searchParams.get("all") === "1") {
      const actor = await requireComuActor();
      if (!actor.isAdmin) return NextResponse.json({ ok: false, code: "COMU_ADMIN_REQUIRED" }, { status: 403 });
      const { data, error } = await actor.admin.from("comu_sellers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return NextResponse.json({ ok: true, sellers: data || [] });
    }
    const { data, error } = await getAdminClient().from("comu_sellers").select("id,slug,public_name,description,logo_url,cover_url,city,state,status,verification_status").eq("status", "ACTIVE").eq("verification_status", "VERIFIED").order("public_name");
    if (error) throw error;
    return NextResponse.json({ ok: true, sellers: data || [] });
  } catch (error) { return fail(error); }
}

// Creation/verification belongs exclusively to the transactional review RPC.
export async function POST() {
  try {
    const actor = await requireComuActor();
    return NextResponse.json({ ok: false, code: actor.isAdmin ? "COMU_APPROVAL_REQUIRED" : "COMU_ADMIN_REQUIRED", error: "Aprueba una solicitud desde la revisión COMETA." }, { status: actor.isAdmin ? 409 : 403 });
  } catch (error) { return fail(error); }
}
export async function PATCH(request: Request) {
  try {
    const body = await request.json() as { sellerId?: unknown; action?: unknown };
    const result = await changeSellerCommercialState(String(body.sellerId || ""), String(body.action || ""));
    return NextResponse.json({ ...result, ...(result.ok ? {} : { code: result.reason }) }, { status: result.ok ? 200 : 409, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return fail(error); }
}
