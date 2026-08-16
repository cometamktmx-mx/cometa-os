"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type InvitationRole = "admin" | "manager" | "cashier" | "inventory";

type Invitation = {
  id: string;
  brandSlug: string;
  brandName: string;
  role: InvitationRole;
  expiresAt: string;
  requiresPasswordSetup: boolean;
};

const ROLE_LABELS: Record<InvitationRole, string> = {
  admin: "Administrador",
  manager: "Encargado",
  cashier: "Cajero",
  inventory: "Inventario",
};

function safeApiError(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    typeof (payload as { error?: unknown }).error === "string"
  ) {
    return (payload as { error: string }).error;
  }

  return fallback;
}

function formatExpiry(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function InvitePage() {
  const supabase = useMemo(() => createClient(), []);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [password, setPassword] = useState("");
  const [passwordReady, setPasswordReady] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const loadInvitations = useCallback(async () => {
    const response = await fetch("/api/pos/invitations", {
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as unknown;

    if (response.status === 401) {
      window.location.assign("/login?next=%2Finvite");
      return;
    }

    if (!response.ok) {
      throw new Error(safeApiError(payload, "No pudimos cargar tus invitaciones."));
    }

    const nextInvitations =
      payload &&
      typeof payload === "object" &&
      Array.isArray((payload as { invitations?: unknown }).invitations)
        ? ((payload as { invitations: Invitation[] }).invitations)
        : [];

    setInvitations(nextInvitations);
  }, []);

  useEffect(() => {
    let active = true;

    async function initialize() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.assign("/login?next=%2Finvite");
        return;
      }

      try {
        await loadInvitations();
      } catch (error) {
        if (active) {
          setErrorMessage(
            error instanceof Error ? error.message : "No pudimos cargar tus invitaciones."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void initialize();
    return () => {
      active = false;
    };
  }, [loadInvitations, supabase]);

  const needsPasswordSetup = invitations.some(
    (invitation) => invitation.requiresPasswordSetup
  );

  async function completePasswordSetup() {
    if (!password) {
      setErrorMessage("Escribe una contraseña para continuar.");
      return;
    }

    setPasswordLoading(true);
    setErrorMessage("");
    const { error } = await supabase.auth.updateUser({ password });
    setPasswordLoading(false);

    if (error) {
      setErrorMessage("No pudimos guardar tu contraseña. Revísala e inténtalo nuevamente.");
      return;
    }

    setPassword("");
    setPasswordReady(true);
    setNotice("Tu acceso quedó listo. Ahora puedes aceptar la invitación.");
  }

  async function acceptInvitation(invitation: Invitation) {
    if (invitation.requiresPasswordSetup && !passwordReady) {
      setErrorMessage("Primero completa la configuración de tu contraseña.");
      return;
    }

    setActionId(invitation.id);
    setErrorMessage("");
    setNotice("");

    try {
      const response = await fetch("/api/pos/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationId: invitation.id }),
      });
      const payload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        throw new Error(safeApiError(payload, "No pudimos aceptar la invitación."));
      }

      const brandSlug =
        payload && typeof payload === "object"
          ? (payload as { brandSlug?: unknown }).brandSlug
          : null;

      if (typeof brandSlug !== "string" || !brandSlug) {
        throw new Error("No pudimos abrir el negocio invitado.");
      }

      window.location.assign(`/brand/${encodeURIComponent(brandSlug)}/pos`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "No pudimos aceptar la invitación."
      );
      setActionId(null);
    }
  }

  async function declineInvitation(invitation: Invitation) {
    setActionId(invitation.id);
    setErrorMessage("");
    setNotice("");

    try {
      const response = await fetch("/api/pos/invitations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationId: invitation.id }),
      });
      const payload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        throw new Error(safeApiError(payload, "No pudimos rechazar la invitación."));
      }

      setInvitations((current) => current.filter((item) => item.id !== invitation.id));
      setNotice("Invitación rechazada.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "No pudimos rechazar la invitación."
      );
    } finally {
      setActionId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#06101f] px-5 py-10 text-white sm:px-8 sm:py-16">
      <div className="mx-auto w-full max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">
          COMETA POS · EQUIPO
        </p>
        <h1 className="mt-4 text-4xl font-black tracking-[-0.06em] sm:text-5xl">
          Tienes una invitación.
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-slate-300">
          Acepta explícitamente el acceso al negocio al que te invitaron.
        </p>

        {errorMessage ? (
          <div className="mt-8 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm font-semibold text-red-100" role="alert">
            {errorMessage}
          </div>
        ) : null}
        {notice ? (
          <div className="mt-8 rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-4 text-sm font-semibold text-cyan-50">
            {notice}
          </div>
        ) : null}

        {needsPasswordSetup && !passwordReady ? (
          <section className="mt-8 rounded-[28px] border border-cyan-300/20 bg-white/[0.05] p-6 shadow-2xl shadow-black/20">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Completa tu acceso</p>
            <h2 className="mt-3 text-2xl font-black tracking-[-0.04em]">Crea una contraseña</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
              Esta invitación creó tu acceso de Cometa POS. Define una contraseña antes de aceptar tu membresía.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Nueva contraseña"
                autoComplete="new-password"
                className="min-h-12 flex-1 rounded-xl border border-white/15 bg-slate-950/60 px-4 text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
              />
              <button
                type="button"
                onClick={() => void completePasswordSetup()}
                disabled={passwordLoading}
                className="min-h-12 rounded-xl bg-[#1d4ed8] px-5 text-sm font-bold text-white transition hover:bg-blue-500 disabled:opacity-50"
              >
                {passwordLoading ? "Guardando…" : "Continuar"}
              </button>
            </div>
          </section>
        ) : null}

        <section className="mt-8 space-y-4" aria-live="polite">
          {loading ? (
            <div className="h-52 animate-pulse rounded-[28px] border border-white/10 bg-white/[0.05]" />
          ) : null}

          {!loading && invitations.length === 0 ? (
            <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-7 text-slate-300">
              No tienes invitaciones pendientes para este correo.
            </div>
          ) : null}

          {!loading
            ? invitations.map((invitation) => (
                <article
                  key={invitation.id}
                  className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-2xl shadow-black/20"
                >
                  <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Negocio</p>
                      <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">{invitation.brandName}</h2>
                      <p className="mt-3 text-sm text-slate-300">
                        Rol: <span className="font-bold text-white">{ROLE_LABELS[invitation.role]}</span>
                      </p>
                      <p className="mt-1 text-sm text-slate-400">Vence: {formatExpiry(invitation.expiresAt)}</p>
                    </div>
                    <span className="w-fit rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-100">
                      Pendiente
                    </span>
                  </div>
                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => void acceptInvitation(invitation)}
                      disabled={actionId !== null || (invitation.requiresPasswordSetup && !passwordReady)}
                      className="min-h-12 rounded-xl bg-[#1d4ed8] px-5 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {actionId === invitation.id ? "Procesando…" : "Aceptar invitación"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void declineInvitation(invitation)}
                      disabled={actionId !== null}
                      className="min-h-12 rounded-xl border border-white/15 px-5 text-sm font-bold text-slate-200 transition hover:border-white/35 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Ahora no
                    </button>
                  </div>
                </article>
              ))
            : null}
        </section>
      </div>
    </main>
  );
}
