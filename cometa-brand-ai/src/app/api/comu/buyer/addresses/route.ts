import { NextResponse } from "next/server";
import { getBuyerAddresses, requireComuBuyer } from "@/lib/comu/buyers";
import { PosApiError } from "@/lib/pos/server";
import { createClient } from "@/lib/supabase/server";

function failure(error: unknown) {
  const status = error instanceof PosApiError ? error.status : 500;
  return NextResponse.json({ ok: false, code: status === 401 ? "COMU_UNAUTHORIZED" : "COMU_ADDRESS_FAILED", error: status === 401 ? "Inicia sesión para continuar." : status === 404 ? "Dirección no disponible." : status === 400 ? "Revisa los campos de tu dirección." : "No pudimos actualizar tus direcciones. Inténtalo nuevamente." }, { status });
}
export async function GET() {
  try { const { buyer, addresses } = await getBuyerAddresses(); return NextResponse.json({ ok: true, buyer, addresses }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return failure(error); }
}
async function mutate(action: string, id: unknown, input: Record<string, unknown>) {
  await requireComuBuyer();
  if (process.env.COMU_BUYER_FOUNDATION_ENABLED !== "true") throw new PosApiError(503, "COMU_FOUNDATION_PENDING", "Direcciones temporalmente no disponibles.");
  if (action !== "create" && (typeof id !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))) throw new PosApiError(400, "COMU_ADDRESS_INVALID", "Selecciona una dirección.");
  const auth = await createClient();
  // Authenticated RPC owns authorization, per-buyer locking and primary selection.
  const { data, error } = action === "default"
    ? await auth.rpc("comu_set_default_address_v1", { p_address_id: id })
    : await auth.rpc("comu_mutate_address_v1", { p_action: action, p_address_id: id ?? null, p_input: input });
  if (error) {
    const missing = error.message.includes("COMU_ADDRESS_NOT_FOUND");
    const invalid = /COMU_ADDRESS_INVALID|COMU_ADDRESS_SELECT_REPLACEMENT/.test(error.message);
    throw new PosApiError(missing ? 404 : invalid ? 400 : 500, "COMU_ADDRESS_FAILED", "No pudimos guardar la dirección.");
  }
  return NextResponse.json({ ok: true, ...(action === "create" ? { address: data } : {}) }, { status: action === "create" ? 201 : 200 });
}
async function body(request: Request) {
  const value: unknown = await request.json().catch(() => null);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PosApiError(400, "COMU_ADDRESS_INVALID", "Revisa la dirección.");
  return value as Record<string, unknown>;
}
export async function POST(request: Request) {
  try {
    const value = await body(request);
    return await mutate("create", null, { label: value.label, recipient_name: value.recipientName, phone: value.phone, line1: value.line1, line2: value.line2, city: value.city, state: value.state, postal_code: value.postalCode, country: value.country ?? "MX", references: value.references, is_default: value.isDefault ?? false });
  } catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
  try { const value = await body(request); const input = { ...value }; delete input.id; delete input.buyer_id;
    if (Object.hasOwn(value, "isDefault")) input.is_default = value.isDefault;
    return await mutate(value.action === "default" ? "default" : "edit", value.id, input);
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request) {
  try { return await mutate("delete", new URL(request.url).searchParams.get("id"), {}); }
  catch (error) { return failure(error); }
}
