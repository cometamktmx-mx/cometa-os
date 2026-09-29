import { NextResponse } from "next/server";
import { getBuyerAddresses, requireComuBuyer } from "@/lib/comu/buyers";
import { PosApiError } from "@/lib/pos/server";
import { createClient } from "@/lib/supabase/server";

function failure(error: unknown, code: string, message: string) {
  const status = error instanceof PosApiError ? error.status : 500;
  return NextResponse.json({ ok: false, code: status === 401 ? "COMU_UNAUTHORIZED" : code, error: status === 401 ? "Inicia sesión para continuar." : message }, { status });
}

export async function GET() {
  try {
    const { buyer, addresses } = await getBuyerAddresses();
    return NextResponse.json({ ok: true, buyer, addresses });
  } catch (error) {
    return failure(error, "COMU_ADDRESS_FAILED", "No se pudieron cargar tus direcciones. Inténtalo nuevamente.");
  }
}

export async function POST(request: Request) {
  try {
    const { buyer, admin } = await requireComuBuyer();
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ ok: false, code: "COMU_ADDRESS_REQUIRED", error: "Completa los campos obligatorios." }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    const value = (key: string) => typeof input[key] === "string" ? input[key].trim() : "";
    const required = ["label", "recipientName", "phone", "line1", "city", "state", "postalCode"];
    if (required.some((key) => !value(key))) {
      return NextResponse.json({ ok: false, code: "COMU_ADDRESS_REQUIRED", error: "Completa los campos obligatorios." }, { status: 400 });
    }
    const country = (value("country") || "MX").toUpperCase();
    if (country === "MX" && !/^\d{5}$/.test(value("postalCode"))) {
      return NextResponse.json({ ok: false, code: "COMU_ADDRESS_REQUIRED", error: "Revisa tu código postal." }, { status: 400 });
    }
    const { data, error } = await admin.from("comu_buyer_addresses").insert({
      buyer_id: buyer.id,
      label: value("label"), recipient_name: value("recipientName"), phone: value("phone"),
      line1: value("line1"), line2: value("line2") || null, city: value("city"),
      state: value("state"), postal_code: value("postalCode"), country,
      references: value("references") || null, is_default: input.isDefault === true,
    }).select("*").single();
    if (error || !data) return failure(error, "COMU_ADDRESS_CREATE_FAILED", "No pudimos guardar la dirección. Inténtalo nuevamente.");
    return NextResponse.json({ ok: true, address: data }, { status: 201 });
  } catch (error) {
    return failure(error, "COMU_ADDRESS_CREATE_FAILED", "No pudimos guardar la dirección. Inténtalo nuevamente.");
  }
}

export async function PATCH(request: Request) {
  try {
    const { buyer, admin } = await requireComuBuyer();
    const input = await request.json() as Record<string, unknown>;
    if (typeof input.id !== "string" || !/^[0-9a-f-]{36}$/i.test(input.id)) throw new PosApiError(400, "COMU_ADDRESS_REQUIRED", "Selecciona una dirección.");
    const { data: address, error: lookupError } = await admin.from("comu_buyer_addresses").select("id").eq("id", input.id).eq("buyer_id", buyer.id).maybeSingle();
    if (lookupError) throw lookupError;
    if (!address) return NextResponse.json({ ok: false, error: "Dirección no disponible." }, { status: 404 });
    if (input.action === "default") {
      if (process.env.COMU_BUYER_FOUNDATION_ENABLED !== "true") return NextResponse.json({ ok: false, error: "La selección de dirección principal estará disponible próximamente." }, { status: 503 });
      const auth = await createClient();
      const { error } = await auth.rpc("comu_set_default_address_v1", { p_address_id: address.id });
      if (error) throw error;
    } else {
      const fields = ["label", "recipient_name", "phone", "line1", "city", "state", "postal_code"];
      if (fields.some(field => typeof input[field] !== "string" || !String(input[field]).trim() || String(input[field]).length > 200) || !/^\d{5}$/.test(String(input.postal_code))) return NextResponse.json({ ok: false, error: "Revisa los campos y el código postal." }, { status: 400 });
      const values = Object.fromEntries(fields.map(field => [field, String(input[field]).trim()]));
      const { error } = await admin.from("comu_buyer_addresses").update({ ...values, line2: typeof input.line2 === "string" ? input.line2.slice(0, 200) : null, updated_at: new Date().toISOString() }).eq("id", address.id).eq("buyer_id", buyer.id);
      if (error) throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error, "COMU_ADDRESS_UPDATE_FAILED", "No pudimos actualizar la dirección."); }
}

export async function DELETE(request: Request) {
  try {
    const { buyer, admin } = await requireComuBuyer();
    const id = new URL(request.url).searchParams.get("id");
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false }, { status: 400 });
    const { error } = await admin.from("comu_buyer_addresses").delete().eq("id", id).eq("buyer_id", buyer.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error, "COMU_ADDRESS_DELETE_FAILED", "No pudimos eliminar la dirección."); }
}
