import { NextResponse } from "next/server";
import { requireComuBuyer } from "@/lib/comu/buyers";
import { PosApiError } from "@/lib/pos/server";
const ready = () => process.env.COMU_BUYER_FOUNDATION_ENABLED === "true";
function fail(error: unknown) { return NextResponse.json({ ok: false, error: error instanceof PosApiError ? error.message : "No pudimos consultar tu cuenta." }, { status: error instanceof PosApiError ? error.status : 500 }); }
export async function GET() {
  try {
    const { buyer, admin, user } = await requireComuBuyer();
    let favorites: string[] = [], points: Array<{ points: number; created_at: string; expires_at: string }> = [];
    if (ready()) {
      const [saved, rewards] = await Promise.all([admin.from("comu_buyer_favorites").select("listing_id").eq("buyer_id", buyer.id), admin.from("comu_buyer_points").select("points,created_at,expires_at").eq("buyer_id", buyer.id).order("created_at", { ascending: false })]);
      if (saved.error || rewards.error) throw new Error("Buyer foundation unavailable");
      favorites = (saved.data || []).map(row => row.listing_id); points = rewards.data || [];
    }
    return NextResponse.json({ ok: true, profile: { displayName: buyer.display_name || "", email: user.email || "" }, favorites, points, foundationReady: ready(), paymentsReady: false }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return fail(error); }
}
export async function POST(request: Request) {
  try {
    const { buyer, admin } = await requireComuBuyer();
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") throw new PosApiError(400, "COMU_INPUT_INVALID", "Revisa la información.");
    const input = body as Record<string, unknown>;
    if (input.action === "profile") {
      const name = typeof input.displayName === "string" ? input.displayName.trim() : "";
      if (!name || name.length > 100) throw new PosApiError(400, "COMU_PROFILE_INVALID", "Escribe un nombre de hasta 100 caracteres.");
      const { error } = await admin.from("comu_buyers").update({ display_name: name, updated_at: new Date().toISOString() }).eq("id", buyer.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (input.action !== "favorite" || typeof input.listingId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.listingId) || typeof input.saved !== "boolean") throw new PosApiError(400, "COMU_INPUT_INVALID", "Selecciona un producto válido.");
    if (!ready()) throw new PosApiError(503, "COMU_FOUNDATION_PENDING", "Pronto podrás guardar tus favoritos. Mientras tanto, sigue descubriendo piezas.");
    const result = input.saved ? await admin.from("comu_buyer_favorites").upsert({ buyer_id: buyer.id, listing_id: input.listingId }, { onConflict: "buyer_id,listing_id", ignoreDuplicates: true }) : await admin.from("comu_buyer_favorites").delete().eq("buyer_id", buyer.id).eq("listing_id", input.listingId);
    if (result.error) throw result.error;
    return NextResponse.json({ ok: true, saved: input.saved });
  } catch (error) { return fail(error); }
}
