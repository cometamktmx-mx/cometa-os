import { NextResponse } from "next/server";
import { getBuyerAddresses, requireComuBuyer } from "@/lib/comu/buyers";
import { PosApiError } from "@/lib/pos/server";

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
