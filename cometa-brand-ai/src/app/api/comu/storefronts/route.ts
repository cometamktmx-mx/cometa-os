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
    const { data: seller } = await access.admin.from("comu_sellers").select("city,state").eq("id", sellerId).maybeSingle();
    return NextResponse.json({ ok: true, storefront: data ? { ...data, comu_sellers: seller } : data });
  } catch (error) {
    return NextResponse.json({ ok: false, code: "COMU_STOREFRONT_FAILED", error: error instanceof Error ? error.message : "No se pudo cargar el storefront." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    requireComuFeature("catalog");
    const body = await request.json() as { sellerId?: unknown; name?: unknown; headline?: unknown; description?: unknown; logoUrl?: unknown; coverUrl?: unknown; whatsapp?: unknown; address?: unknown; showLocation?: unknown; city?: unknown };
    const sellerId = String(body.sellerId || "");
    const access = await requireSellerAccess(sellerId, ["OWNER", "ADMIN"]);
    const { data: current } = await access.admin.from("comu_storefronts").select("theme_config,logo_url,cover_url").eq("seller_id", sellerId).maybeSingle();
    const previousTheme = current?.theme_config && typeof current.theme_config === "object" ? current.theme_config as Record<string, unknown> : {};
    const updates = { name: String(body.name || "").trim(), headline: String(body.headline || "").trim() || null, description: String(body.description || "").trim() || null, logo_url: typeof body.logoUrl === "string" ? body.logoUrl : current?.logo_url || null, cover_url: typeof body.coverUrl === "string" ? body.coverUrl : current?.cover_url || null, theme_config: { ...previousTheme, whatsapp: typeof body.whatsapp === "string" ? body.whatsapp.trim() || null : previousTheme.whatsapp || null, address: typeof body.address === "string" ? body.address.trim() || null : previousTheme.address || null, showLocation: body.showLocation === undefined ? previousTheme.showLocation !== false : body.showLocation === true } };
    if (!updates.name) return NextResponse.json({ ok: false, code: "COMU_STOREFRONT_NAME_REQUIRED" }, { status: 400 });
    const { data, error } = await access.admin.from("comu_storefronts").update(updates).eq("seller_id", sellerId).select("*").single();
    if (error) throw error;
    if (typeof body.city === "string") await access.admin.from("comu_sellers").update({ city: body.city.trim() || null, updated_at: new Date().toISOString() }).eq("id", sellerId);
    return NextResponse.json({ ok: true, storefront: data });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: unknown }).status) || 500 : 500;
    return NextResponse.json({ ok: false, code: "COMU_STOREFRONT_UPDATE_FAILED", error: error instanceof Error ? error.message : "No se pudo actualizar el storefront." }, { status });
  }
}
