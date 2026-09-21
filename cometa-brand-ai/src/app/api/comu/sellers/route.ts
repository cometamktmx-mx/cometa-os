import { NextResponse } from "next/server";
import { requireComuFeature } from "@/lib/comu/features";
import { canActivateComuSeller, slugifyComu } from "@/lib/comu/sellers";
import { requireComuActor, requireSellerAccess, resolveBrandForActor } from "@/lib/comu/seller-access";
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

export async function POST(request: Request) {
  try {
    requireComuFeature("sellerOnboarding");
    const actor = await requireComuActor();
    if (!actor.isAdmin) return NextResponse.json({ ok: false, code: "COMU_ADMIN_REQUIRED" }, { status: 403 });
    const body = await request.json() as { brandSlug?: unknown; publicName?: unknown; slug?: unknown; ownerUserId?: unknown };
    const { brand } = await resolveBrandForActor(String(body.brandSlug || ""));
    const publicName = String(body.publicName || brand.name).trim();
    const slug = slugifyComu(String(body.slug || publicName));
    const { data: seller, error } = await actor.admin.from("comu_sellers").insert({ brand_id: String(brand.id), brand_slug: brand.slug, public_name: publicName, slug, status: "DRAFT", verification_status: "UNVERIFIED" }).select("*").single();
    if (error) throw error;
    const storefrontSlug = slugifyComu(slug);
    const { data: storefront, error: storefrontError } = await actor.admin.from("comu_storefronts").insert({ seller_id: seller.id, name: publicName, slug: storefrontSlug, status: "DRAFT" }).select("*").single();
    if (storefrontError) { await actor.admin.from("comu_sellers").delete().eq("id", seller.id); throw storefrontError; }
    if (typeof body.ownerUserId === "string" && body.ownerUserId) {
      const { error: membershipError } = await actor.admin.from("comu_seller_memberships").insert({ seller_id: seller.id, user_id: body.ownerUserId, role: "OWNER", active: true });
      if (membershipError) { await actor.admin.from("comu_sellers").delete().eq("id", seller.id); throw membershipError; }
    }
    return NextResponse.json({ ok: true, seller, storefront }, { status: 201 });
  } catch (error) { return fail(error); }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as { sellerId?: unknown; action?: unknown };
    const sellerId = String(body.sellerId || "");
    const action = String(body.action || "");
    const actor = await requireComuActor();
    if (!actor.isAdmin) await requireSellerAccess(sellerId, ["OWNER", "ADMIN"]);
    if (["activate", "verify", "suspend", "pause", "close"].includes(action) && !actor.isAdmin) return NextResponse.json({ ok: false, code: "COMU_ADMIN_REQUIRED" }, { status: 403 });
    if (action === "activate") {
      const check = await canActivateComuSeller(actor.admin, sellerId);
      if (!check.ok) return NextResponse.json({ ok: false, code: check.reason, publishedListings: check.publishedListings }, { status: 409 });
      const { data, error } = await actor.admin.from("comu_sellers").update({ status: "ACTIVE", activated_at: new Date().toISOString(), verification_status: "VERIFIED", verified_at: new Date().toISOString() }).eq("id", sellerId).select("*").single();
      if (error) throw error;
      await actor.admin.from("comu_storefronts").update({ status: "ACTIVE" }).eq("seller_id", sellerId);
      return NextResponse.json({ ok: true, seller: data });
    }
    const updates = action === "verify" ? { verification_status: "VERIFIED", status: "PENDING_VERIFICATION", verified_at: new Date().toISOString() } : action === "suspend" ? { status: "SUSPENDED" } : action === "pause" ? { status: "PAUSED" } : action === "close" ? { status: "CLOSED" } : null;
    if (!updates) return NextResponse.json({ ok: false, code: "COMU_SELLER_ACTION_INVALID" }, { status: 400 });
    const { data, error } = await actor.admin.from("comu_sellers").update(updates).eq("id", sellerId).select("*").single();
    if (error) throw error;
    if (action === "verify") await actor.admin.from("comu_storefronts").update({ status: "PUBLISHED" }).eq("seller_id", sellerId);
    return NextResponse.json({ ok: true, seller: data });
  } catch (error) { return fail(error); }
}
