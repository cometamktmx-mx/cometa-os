export const CONTENT_STATUS_LABELS = {
  generated: "Planeada", assigned: "Asignada", in_design: "En producción", design_uploaded: "Lista para revisión", internal_review: "Revisión interna", changes_requested: "Cambios solicitados", approved_internal: "Lista para cliente", sent_to_client: "Cliente revisando", approved_client: "Aprobada por cliente", scheduled: "Programada", published: "Publicada", analyzed: "Analizada", cancelled: "Cancelada",
} as const;

export type ContentStatus = keyof typeof CONTENT_STATUS_LABELS;
export type ContentGroup = "planned" | "production" | "review" | "changes" | "client" | "scheduled" | "published" | "cancelled";
export type ApprovalBucket = "internal_review" | "ready_for_client" | "internal_changes" | "client_changes" | "client_reviewing";

export const CONTENT_GROUP_LABELS: Record<ContentGroup, string> = { planned: "Planeado", production: "En producción", review: "Revisión", changes: "Cambios", client: "Cliente", scheduled: "Programado", published: "Publicado", cancelled: "Cancelado" };
export const APPROVAL_BUCKET_LABELS: Record<ApprovalBucket, string> = { internal_review: "Revisión interna", ready_for_client: "Listas para cliente", internal_changes: "Cambios internos", client_changes: "Cliente solicitó cambios", client_reviewing: "Cliente revisando" };

export function contentStatusLabel(status: string) { return CONTENT_STATUS_LABELS[status as ContentStatus] || "Estado pendiente"; }
export function contentGroup(status: string): ContentGroup { if (["generated", "assigned"].includes(status)) return "planned"; if (status === "in_design") return "production"; if (["design_uploaded", "internal_review", "approved_internal"].includes(status)) return "review"; if (status === "changes_requested") return "changes"; if (["sent_to_client", "approved_client"].includes(status)) return "client"; if (status === "scheduled") return "scheduled"; if (["published", "analyzed"].includes(status)) return "published"; return "cancelled"; }
export function contentTypeLabel(value: string | null) { return ({ reel: "Reel", post: "Post", static_post: "Post", feed_post: "Post", story: "Story", carousel: "Carrusel", video: "Video", ad: "Anuncio", email: "Email", whatsapp: "WhatsApp", other: "Contenido" } as Record<string, string>)[value || ""] || "Contenido"; }
export function distributionLabel(value: string | null) { return value === "paid" ? "Pauta" : value === "organic_paid" ? "Orgánico + Pauta" : "Orgánico"; }
export function deliveryLabel(value: string | null) { return value === "extra" ? "Extra" : value === "replacement" ? "Reemplazo" : value === "contractual" ? "Paquete" : null; }
export function dateKindLabel(distribution: string | null) { return distribution === "paid" ? "Activación prevista" : "Publicación"; }
export function dateLabel(value: string | null) { if (!value) return "Sin fecha"; const date = new Date(`${value.slice(0, 10)}T12:00:00Z`); return Number.isNaN(date.getTime()) ? "Sin fecha" : new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date); }
export function periodLabel(month: number, year: number) { const value = new Date(Date.UTC(year, month - 1, 1)); return new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }).format(value); }

export type WorkspaceContentItem = {
  id: string; brandSlug: string; brandName: string; title: string; contentType: string | null; distributionType: string | null; deliveryType: string | null; status: string; statusLabel: string; group: ContentGroup; assignedTo: string | null; assigneeName: string | null; publishDate: string | null; dueDate: string | null; periodSource: "publish_date" | "calendar"; thumbnailUrl: string | null;
};

export type ApprovalItem = WorkspaceContentItem & {
  bucket: ApprovalBucket; objective: string | null; brief: string | null; cta: string | null; visualDirection: string | null; referenceNotes: string | null; assets: Array<{ id: string; type: string | null; label: string | null; url: string | null; mimeType: string | null }>; latestComment: { text: string; createdAt: string | null; source: "internal" | "client" } | null; reviewHistory: Array<{ id: string; status: string; submittedAt: string | null; decidedAt: string | null; decisionComment: string | null }>;
};
