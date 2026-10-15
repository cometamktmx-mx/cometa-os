import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function POST(request: Request) {
  const auth = await createClient(); const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Inicia sesión para enviar tu solicitud." }, { status: 401 });
  if (process.env.COMU_BUYER_FOUNDATION_ENABLED !== "true") return NextResponse.json({ ok: false, error: "Estamos preparando la recepción de solicitudes. Vuelve pronto para enviar la tuya." }, { status: 503 });
  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object") return NextResponse.json({ ok: false }, { status: 400 });
  const body = input as Record<string, unknown>;
  const keys = ["contact_name", "business_name", "email", "phone", "city", "business_type"];
  if (keys.some(key => typeof body[key] !== "string" || !String(body[key]).trim() || String(body[key]).length > 160) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email)) || !/^[+\d\s()-]{8,25}$/.test(String(body.phone))) return NextResponse.json({ ok: false, error: "Revisa los campos de tu solicitud." }, { status: 400 });
  // One persisted application per authenticated user: no anonymous spam,
  // no client-controlled status, no seller or Stripe account creation.
  const { error } = await auth.from("comu_seller_applications").insert({ ...Object.fromEntries(keys.map(key => [key, String(body[key]).trim()])), user_id: user.id });
  if (error) return NextResponse.json({ ok: false, error: error.code === "23505" ? "Ya recibimos una solicitud de esta cuenta." : "No pudimos guardar tu solicitud. Inténtalo nuevamente." }, { status: error.code === "23505" ? 409 : 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
