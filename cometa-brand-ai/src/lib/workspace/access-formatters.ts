const ACCESS_TIME_ZONE = "America/Mexico_City";

export function formatLastSignIn(value: string | null): string {
  if (!value) return "Nunca ha ingresado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Nunca ha ingresado";

  const now = new Date();
  const dateKey = calendarDateKey(date);
  const todayKey = calendarDateKey(now);
  if (dateKey === todayKey) {
    const time = new Intl.DateTimeFormat("es-MX", { timeZone: ACCESS_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
    return `Hoy, ${time}`;
  }

  const days = Math.floor((dateKeyToUtc(todayKey) - dateKeyToUtc(dateKey)) / 86_400_000);
  if (days > 0 && days < 30) return `Hace ${days} días`;
  return new Intl.DateTimeFormat("es-MX", { timeZone: ACCESS_TIME_ZONE, dateStyle: "medium" }).format(date);
}

function calendarDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: ACCESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateKeyToUtc(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}
