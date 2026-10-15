import { createClient } from "@/lib/supabase/server";
import { PosApiError } from "@/lib/pos/server";
import { requireComuActor } from "./seller-access";

export async function requireComuReviewer() {
  const actor = await requireComuActor();
  if (!actor.isAdmin) throw new PosApiError(403, "COMU_ADMIN_REQUIRED", "Acceso exclusivo de COMETA.");
  return actor;
}

export async function listSellerApplications() {
  const { admin } = await requireComuReviewer();
  const { data, error } = await admin.from("comu_seller_applications")
    .select("id,user_id,contact_name,business_name,email,phone,city,business_type,status,created_at,updated_at,reviewed_by,reviewed_at,decision,review_note,brand_id,seller_id")
    .order("created_at", { ascending: false }).limit(200);
  if (error) throw new PosApiError(503, "COMU_FOUNDATION_PENDING", "La revisión de solicitudes requiere la migración C1.");
  return data || [];
}

export async function reviewSellerApplication(input: unknown) {
  await requireComuReviewer();
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new PosApiError(400, "COMU_INPUT_INVALID", "Revisa la decisión.");
  const body = input as Record<string, unknown>;
  const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  if (typeof body.applicationId !== "string" || !uuid.test(body.applicationId)
    || typeof body.decision !== "string" || !["APPROVED", "REJECTED"].includes(body.decision)
    || (body.note != null && (typeof body.note !== "string" || body.note.length > 2000))
    || (body.brandId != null && (typeof body.brandId !== "string" || !uuid.test(body.brandId)))) {
    throw new PosApiError(400, "COMU_INPUT_INVALID", "Revisa la solicitud, decisión y nota.");
  }
  const auth = await createClient();
  const { data, error } = await auth.rpc("comu_review_seller_application_v1", {
    p_application_id: body.applicationId, p_decision: body.decision,
    p_note: body.note ?? null, p_brand_id: body.brandId ?? null,
  });
  if (error || !data) throw new PosApiError(409, "COMU_REVIEW_FAILED", "No se pudo registrar la decisión. Verifica permisos, estado y titularidad de la marca; actualiza antes de reintentar.");
  return data;
}
