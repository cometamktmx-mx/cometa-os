// This module is intentionally imported only by server-side route handlers.
// Keeping the Resend configuration here prevents provider credentials from
// becoming part of a browser bundle or an API response.

export const POS_INVITATION_ROLE_LABELS = {
  admin: "Administrador",
  manager: "Encargado",
  cashier: "Cajero",
  inventory: "Inventario",
} as const;

export type PosInvitationInitialRole = keyof typeof POS_INVITATION_ROLE_LABELS;

type InvitationEmailInput = {
  email: string;
  brandName: string;
  role: PosInvitationInitialRole;
};

type InvitationEmailDelivery =
  | { ok: true }
  | { ok: false; reason: "configuration" | "provider" };

function isBrowserRuntime() {
  return typeof window !== "undefined";
}

function normalizeOrigin(value: string | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.origin !== value.replace(/\/$/, "")
    ) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

function isSenderEmail(value: string | undefined): value is string {
  return Boolean(
    value &&
      /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value) &&
      !/[\r\n]/.test(value)
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function getPosInvitationRoleLabel(role: PosInvitationInitialRole) {
  return POS_INVITATION_ROLE_LABELS[role];
}

/**
 * Delivers the app-level email used only for an already-existing Auth user.
 * The acceptance authorization remains: authenticated session + matching
 * pending invitation + V1A RPC; this email contains no bearer credential.
 */
export async function sendExistingAuthInvitationEmail(
  input: InvitationEmailInput
): Promise<InvitationEmailDelivery> {
  if (isBrowserRuntime()) {
    throw new Error("POS invitation email delivery is server-only.");
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const origin = normalizeOrigin(process.env.COMETA_APP_ORIGIN);

  if (!apiKey || !isSenderEmail(fromEmail) || !origin) {
    return { ok: false, reason: "configuration" };
  }

  const roleLabel = getPosInvitationRoleLabel(input.role);
  const brandName = escapeHtml(input.brandName);
  const role = escapeHtml(roleLabel);
  const acceptanceUrl = new URL("/invite", origin).toString();

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Cometa POS <${fromEmail}>`,
        to: [input.email],
        subject: "Te invitaron a Cometa POS",
        text: `${input.brandName} te invitó a formar parte de su equipo en Cometa POS.\n\nRol: ${roleLabel}\n\nAcepta la invitación después de iniciar sesión: ${acceptanceUrl}`,
        html: `
          <main style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5">
            <h1 style="font-size:24px">Te invitaron a Cometa POS</h1>
            <p><strong>${brandName}</strong> te invitó a formar parte de su equipo en Cometa POS.</p>
            <p>Rol: <strong>${role}</strong></p>
            <p><a href="${acceptanceUrl}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Aceptar invitación</a></p>
            <p style="color:#475569;font-size:14px">Si ya tienes cuenta, inicia sesión para aceptar. Si no tienes cuenta, crea tu acceso y continúa.</p>
          </main>
        `,
      }),
    });

    return response.ok
      ? { ok: true }
      : { ok: false, reason: "provider" };
  } catch {
    return { ok: false, reason: "provider" };
  }
}
