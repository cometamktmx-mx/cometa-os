import "server-only";

// Same Resend HTTP transport/config names as existing invitations, no POS domain imports.
export type ComuEmail = { from: string; to: string[]; subject: string; text: string };
export type EmailResult = { ok: true } | { ok: false; error: "PROVIDER_UNAVAILABLE" | "PROVIDER_REJECTED" | "CONFIGURATION" };
export type EmailTransport = (payload: ComuEmail, idempotencyKey: string) => Promise<EmailResult>;
export function notificationEmailConfig() {
  const from = process.env.RESEND_FROM_EMAIL;
  const value = process.env.COMETA_APP_ORIGIN;
  if (!from || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from) || !value) return null;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.origin !== value.replace(/\/$/, "")) return null;
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") return null;
    return { from, origin: url.origin };
  } catch { return null; }
}
export const sendComuEmail: EmailTransport = async (payload, idempotencyKey) => {
  if (process.env.COMU_NOTIFICATIONS_EMAIL_ENABLED !== "true" || !process.env.RESEND_API_KEY) return { ok: false, error: "CONFIGURATION" };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(10000),
    });
    // Provider response bodies can contain addresses or credentials: never expose or log.
    return response.ok ? { ok: true } : { ok: false, error: response.status >= 500 || response.status === 429 ? "PROVIDER_UNAVAILABLE" : "PROVIDER_REJECTED" };
  } catch { return { ok: false, error: "PROVIDER_UNAVAILABLE" }; }
};
