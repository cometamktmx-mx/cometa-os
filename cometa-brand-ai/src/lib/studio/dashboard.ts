import "server-only";
import { getProductionCapabilities } from "@/lib/studio/production";
import { getStudioOperationState } from "@/lib/studio/operation";
import { getStudioWorkspaceData, requireStudioAccess } from "@/lib/studio/server";

export const studioStatusLabels: Record<string, string> = { generated: "Planeada", assigned: "Asignada", in_design: "En producción", design_uploaded: "Lista para revisión", internal_review: "Revisión interna", changes_requested: "Cambios solicitados", approved_internal: "Aprobada por Cometa", sent_to_client: "Cliente revisando", approved_client: "Aprobada por cliente", scheduled: "Programada", published: "Publicada", analyzed: "Analizada", cancelled: "Cancelada" };
export function distributionLabel(value: unknown) { return value === "paid" ? "Pauta" : value === "organic_paid" ? "Orgánico + Pauta" : "Orgánico"; }

export async function getStudioDashboard(studio: Awaited<ReturnType<typeof requireStudioAccess>>) {
  const [data, operation] = await Promise.all([getStudioWorkspaceData(studio), getStudioOperationState(studio.userId)]);
  const now = new Date(); const day = now.getDay() || 7; const start = new Date(now); start.setDate(now.getDate() - day + 1); start.setHours(0, 0, 0, 0); const end = new Date(start); end.setDate(start.getDate() + 7);
  const items = data.items as Array<Record<string, unknown>>;
  const week = items.filter((item) => { const date = String(item.due_date || item.publish_date || ""); if (!date) return false; const d = new Date(`${date}T00:00:00`); return d >= start && d < end; });
  const today = items.filter((item) => String(item.due_date || item.publish_date || "").startsWith(now.toISOString().slice(0, 10)));
  const changes = items.filter((item) => item.status === "changes_requested");
  const ready = items.filter((item) => ["design_uploaded", "approved_internal"].includes(String(item.status)));
  const completed = new Set(["approved_internal", "sent_to_client", "approved_client", "scheduled", "published", "analyzed"]);
  return { ...data, items, week, today, changes, ready, paid: items.filter((item) => item.distribution_type === "paid"), progress: { total: week.length, completed: week.filter((item) => completed.has(String(item.status))).length }, capabilities: await Promise.all(data.brands.map(async (brand) => [brand.slug, await getProductionCapabilities(String(brand.slug))] as const)), operation };
}
