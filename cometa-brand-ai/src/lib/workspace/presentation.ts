export const CONTENT_STATUS_LABELS: Readonly<Record<string, string>> = {
  draft: "En preparación",
  generated: "Borrador interno",
  internal_review: "Revisión interna",
  sent_to_client: "En revisión del cliente",
  changes_requested: "Cambios solicitados",
  approved_client: "Aprobado por cliente",
  scheduled: "Programado",
  published: "Publicado",
  analyzed: "Analizado",
  cancelled: "Cancelado",
  active: "Activo",
  paused: "Pausado",
  inactive: "Inactivo",
  not_configured: "No configurado",
};

export function contentStatusLabel(status: string): string {
  return CONTENT_STATUS_LABELS[status] || "Estado pendiente";
}

export function shortEditorialDate(value: string): { day: string; month: string } {
  const date = new Date(`${value}T12:00:00-06:00`);
  if (Number.isNaN(date.getTime())) return { day: "—", month: "" };
  const parts = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short" }).formatToParts(date);
  return {
    day: parts.find((part) => part.type === "day")?.value || "—",
    month: (parts.find((part) => part.type === "month")?.value || "").replace(".", "").toUpperCase(),
  };
}

export function calendarPeriod(month: number, year: number): string {
  const date = new Date(Date.UTC(year, Math.max(0, month - 1), 1));
  if (!Number.isInteger(month) || !Number.isInteger(year)) return "Periodo sin definir";
  const name = new Intl.DateTimeFormat("es-MX", { month: "long", timeZone: "UTC" }).format(date);
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

export function timeInCometaZone(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

export function dateKeyInCometaZone(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
