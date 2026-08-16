"use client";

import { useCallback, useEffect, useState } from "react";
import { usePosContext } from "../../components/pos-shell";

type BillingModel = {
  canManage: boolean;
  subscription: { planCode: string; status: string; listPrice: number | string | null; contractedPrice: number | string | null; currency: string | null; billingInterval: string | null; trialEndsAt: string | null; currentPeriodStart: string | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; planName: string | null } | null;
  effectiveCommercialAccess: { accessAllowed: boolean; accessSource: string; planCode: string | null; planSource: string | null } | null;
  grant: { active: boolean; code: string | null; type: string | null; startsAt: string | null; endsAt: string | null; daysRemaining: number | null };
  stripe: { connected: boolean; subscriptionConnected: boolean };
};

const plans = [{ code: "start", label: "Start", price: 399 }, { code: "pro", label: "Pro", price: 499 }, { code: "multi", label: "Multi", price: 899 }];

export default function PosSubscriptionPage() {
  const { brand, lifecycle } = usePosContext();
  const [model, setModel] = useState<BillingModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/pos/billing?brandSlug=${encodeURIComponent(brand.slug)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || "No se pudo cargar la facturación.");
      setModel(data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo cargar la facturación."); }
    finally { setLoading(false); }
  }, [brand.slug]);

  useEffect(() => { void load(); }, [load]);

  async function checkout(planCode: string) {
    setBusy(planCode); setError(null);
    try {
      const response = await fetch("/api/pos/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandSlug: brand.slug, planCode }) });
      const data = await response.json();
      if (!response.ok || !data?.ok || typeof data.checkoutUrl !== "string") throw new Error(data?.error || "No se pudo iniciar el Checkout.");
      window.location.assign(data.checkoutUrl);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo iniciar el Checkout."); setBusy(null); }
  }

  async function portal() {
    setBusy("portal"); setError(null);
    try {
      const response = await fetch("/api/pos/billing/portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandSlug: brand.slug }) });
      const data = await response.json();
      if (!response.ok || !data?.ok || typeof data.portalUrl !== "string") throw new Error(data?.error || "No se pudo abrir la facturación.");
      window.location.assign(data.portalUrl);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo abrir la facturación."); setBusy(null); }
  }

  if (loading) return <div className="mx-auto max-w-4xl text-sm text-[var(--pos-text-muted)]">Cargando facturación...</div>;
  if (!model) return <div className="mx-auto max-w-4xl rounded-[var(--pos-radius-md)] bg-[var(--pos-warning-soft)] p-4 text-sm text-[var(--pos-warning)]">{error || "No disponible."}</div>;

  const subscription = model.subscription;
  const status = subscription?.status || "";
  const isCancelled = subscription?.status === "cancelled";
  const hasStripeSubscription = model.stripe.subscriptionConnected;
  const isActivePaid = status === "active" && hasStripeSubscription;
  const isTrial = status === "trial" && !hasStripeSubscription;
  const isNonTerminalStripe = hasStripeSubscription && ["trial", "active", "past_due", "suspended"].includes(status);
  const canChoosePlan = model.canManage && !model.grant.active && !isNonTerminalStripe;
  const price = subscription?.contractedPrice ?? subscription?.listPrice;

  return <div className="mx-auto max-w-4xl space-y-5">
    <header><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--pos-primary)]">Producto comercial</p><h2 className="mt-1 text-2xl font-bold tracking-[-0.03em] text-[var(--pos-text-primary)]">Suscripción de Cometa POS</h2><p className="mt-2 text-sm text-[var(--pos-text-secondary)]">Administra tu plan, facturación y acceso a Cometa POS.</p></header>
    {error ? <div className="rounded-[var(--pos-radius-md)] bg-[var(--pos-warning-soft)] px-4 py-3 text-sm text-[var(--pos-warning)]">{error}</div> : null}
    <section className="rounded-[var(--pos-radius-lg)] border border-[var(--pos-line-subtle)] bg-[var(--pos-panel)] p-5 md:p-6">
      <div className="grid gap-6 md:grid-cols-2"><div><p className="text-xs text-[var(--pos-text-muted)]">Plan actual</p><p className="mt-1 text-xl font-semibold text-[var(--pos-text-primary)]">{subscription?.planName || subscription?.planCode || "Sin plan"}</p><p className="mt-4 text-xs text-[var(--pos-text-muted)]">Estado</p><p className="mt-1 text-sm font-semibold text-[var(--pos-text-primary)]">{statusLabel(status)}</p></div>
        <dl className="space-y-3 rounded-[var(--pos-radius-md)] bg-[var(--pos-panel-raised)] p-4 text-sm"><Detail label="Precio" value={formatPrice(price, subscription?.currency, subscription?.billingInterval)} /><Detail label="Periodo" value={formatInterval(subscription?.billingInterval)} />{isActivePaid ? <Detail label="Próxima facturación" value={formatDate(subscription?.currentPeriodEnd || null)} /> : null}{isTrial ? <Detail label="Trial termina" value={formatDate(subscription?.trialEndsAt || null)} /> : null}{status === "cancelled" ? <Detail label="Último periodo" value={formatPeriod(lifecycle?.period.startsAt || subscription?.currentPeriodStart || null, lifecycle?.period.endsAt || subscription?.currentPeriodEnd || null)} /> : null}<Detail label="Acceso" value={model.effectiveCommercialAccess?.accessAllowed ? "Activo" : "Restringido"} /></dl>
      </div>
      {subscription?.cancelAtPeriodEnd && subscription.currentPeriodEnd ? <p className="mt-5 rounded bg-amber-400/10 px-4 py-3 text-sm text-amber-200">Cancelación programada: tu suscripción se cancelará el {formatDate(subscription.currentPeriodEnd)}.</p> : null}
    </section>
    {model.grant.active ? <section className="rounded-[var(--pos-radius-lg)] border border-cyan-400/30 bg-cyan-400/5 p-5"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-300">Beneficio comercial</p><h3 className="mt-2 text-lg font-semibold text-[var(--pos-text-primary)]">Cometa POS Pro</h3><p className="mt-1 text-sm text-[var(--pos-text-secondary)]">Incluido con Cometa Growth Partner.</p><p className="mt-3 text-sm text-cyan-100">Tu acceso está bonificado hasta {formatDate(model.grant.endsAt)}.</p></section> : null}
    {status === "cancelled" ? <p className="text-sm text-[var(--pos-text-secondary)]">Tu suscripción está cancelada. Puedes volver a activar Cometa POS contratando cualquiera de los planes.</p> : null}
    {isActivePaid ? <section className="rounded-[var(--pos-radius-md)] border border-cyan-400/20 bg-cyan-400/5 p-4 text-sm text-[var(--pos-text-secondary)]"><p className="font-semibold text-[var(--pos-text-primary)]">Tu suscripción está activa.</p><p className="mt-1">Los cambios de facturación y cancelación se gestionan desde Stripe.</p></section> : null}
    {isTrial ? <p className="text-sm text-[var(--pos-text-secondary)]">Prueba gratuita de Cometa POS. Te quedan {lifecycle?.trial.daysRemaining ?? 0} días de prueba.</p> : null}
    {canChoosePlan ? <section className="space-y-3"><h3 className="text-sm font-semibold text-[var(--pos-text-primary)]">Elegir plan</h3><div className="grid gap-3 md:grid-cols-3">{plans.map((plan) => <button key={plan.code} type="button" disabled={busy !== null} onClick={() => void checkout(plan.code)} className="pos-ui-focus rounded-[var(--pos-radius-md)] border border-[var(--pos-line-subtle)] bg-[var(--pos-panel)] p-4 text-left transition hover:border-[var(--pos-primary)] disabled:opacity-60"><span className="block font-semibold text-[var(--pos-text-primary)]">{plan.label}</span><span className="mt-1 block text-sm text-[var(--pos-text-secondary)]">{formatPrice(plan.price, "MXN", "month")}</span><span className="mt-3 block text-xs font-semibold text-[var(--pos-primary)]">{busy === plan.code ? "Abriendo Checkout..." : "Contratar"}</span></button>)}</div></section> : null}
    {model.canManage && model.stripe.connected ? <button type="button" disabled={busy !== null} onClick={() => void portal()} className="pos-ui-focus inline-flex min-h-11 rounded-[var(--pos-radius-sm)] bg-[var(--pos-primary)] px-5 text-sm font-semibold text-slate-950 disabled:opacity-60">{busy === "portal" ? "Abriendo..." : "Administrar facturación"}</button> : null}
  </div>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4"><dt className="text-[var(--pos-text-muted)]">{label}</dt><dd className="text-right font-medium text-[var(--pos-text-primary)]">{value}</dd></div>; }
function formatDate(value: string | null) { if (!value) return "No disponible"; return new Intl.DateTimeFormat("es-MX", { dateStyle: "long" }).format(new Date(value)); }
function formatPeriod(start: string | null, end: string | null) { if (!start && !end) return "No disponible"; return `${formatDate(start)} — ${formatDate(end)}`; }
function formatInterval(interval: string | null | undefined) { const normalized = String(interval || "month").toLowerCase(); if (normalized === "month" || normalized === "monthly") return "mes"; if (normalized === "year" || normalized === "annual" || normalized === "yearly") return "año"; return normalized.replaceAll("_", " "); }
function formatPrice(value: number | string | null | undefined, currency: string | null | undefined, interval: string | null | undefined) { const numeric = Number(value); if (!Number.isFinite(numeric)) return "Por definir"; return `${new Intl.NumberFormat("es-MX", { style: "currency", currency: currency || "MXN", maximumFractionDigits: 0 }).format(numeric)} / ${formatInterval(interval)}`; }
function statusLabel(status: string) { return ({ trial: "Trial activo", active: "Activa", past_due: "Pago pendiente", suspended: "Suspendida", cancelled: "Cancelada" } as Record<string, string>)[status] || status || "No disponible"; }
