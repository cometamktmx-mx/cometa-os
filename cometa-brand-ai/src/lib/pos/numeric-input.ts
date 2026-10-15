export type NumericIntent = "INTEGER" | "DECIMAL" | "MONEY" | "PERCENT";

/** Keeps an editable numeric draft human-friendly without coercing it to NaN. */
export function sanitizeNumericDraft(value: string, intent: NumericIntent): string {
  if (value === "") return "";
  const allowDecimal = intent !== "INTEGER";
  const sign = value.startsWith("-") ? "-" : "";
  const body = value.replace(/^-/, "").replace(/[^0-9.]/g, "");
  const [whole = "", ...fractionParts] = body.split(".");
  const fraction = fractionParts.join("");
  const normalizedWhole = whole.replace(/^0+(?=\d)/, "") || "0";
  if (!allowDecimal) return `${sign}${normalizedWhole}`;
  return `${sign}${normalizedWhole}${body.includes(".") ? `.${fraction}` : ""}`;
}

export function normalizeNumericDraft(value: string, intent: NumericIntent): string {
  const sanitized = sanitizeNumericDraft(value, intent);
  if (!sanitized || sanitized === "-") return "";
  if (sanitized.endsWith(".")) return sanitized.slice(0, -1);
  return sanitized;
}

export function numericDraftValue(value: string, intent: NumericIntent): number | null {
  const normalized = normalizeNumericDraft(value, intent);
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
