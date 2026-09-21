import { NextResponse } from "next/server";
import { requireComuFeature } from "@/lib/comu/features";
import { requireSellerAccess } from "@/lib/comu/seller-access";

export async function GET(request: Request) {
  try {
    requireComuFeature("catalog");
    const sellerId = new URL(request.url).searchParams.get("sellerId") || "";
    const access = await requireSellerAccess(sellerId);
    const { data, error } = await access.admin.from("comu_storefronts").select("*").eq("seller_id", sellerId).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ ok: true, storefront: data });
  } catch (error) {
    return NextResponse.json({ ok: false, code: "COMU_STOREFRONT_FAILED", error: error instanceof Error ? error.message : "No se pudo cargar el storefront." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    requireComuFeature("catalog");
    const body = await request.json() as { sellerId?: unknown; name?: unknown; headline?: unknown; description?: unknown; logoUrl?: unknown; coverUrl?: unknown };
    const sellerId = String(body.sellerId || "");
    const access = await requireSellerAccess(sellerId, ["OWNER", "ADMIN"]);
    const updates = { name: String(body.name || "").trim(), headline: String(body.headline || "").trim() || null, description: String(body.description || "").trim() || null, logo_url: typeof body.logoUrl === "string" ? body.logoUrl : null, cover_url: typeof body.coverUrl === "string" ? body.coverUrl : null };
    if (!updates.name) return NextResponse.json({ ok: false, code: "COMU_STOREFRONT_NAME_REQUIRED" }, { status: 400 });
    const { data, error } = await access.admin.from("comu_storefronts").update(updates).eq("seller_id", sellerId).select("*").single();
    if (error) throw error;
    return NextResponse.json({ ok: true, storefront: data });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: unknown }).status) || 500 : 500;
    return NextResponse.json({ ok: false, code: "COMU_STOREFRONT_UPDATE_FAILED", error: error instanceof Error ? error.message : "No se pudo actualizar el storefront." }, { status });
  }
}
