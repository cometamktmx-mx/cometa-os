"use server";

import { createSellerConnectAccount, createSellerOnboardingLink, requireFinanceSeller } from "@/lib/comu/finance";

type PaymentStatus = "NOT_STARTED" | "PENDING" | "REVIEW" | "COMPLETE" | "RESTRICTED";
type PaymentState = { ok: true; status: PaymentStatus; suspended: boolean } | { ok: false; error: string };

async function readPaymentState(brandSlug: string): Promise<{ status: PaymentStatus; suspended: boolean }> {
  if (typeof brandSlug !== "string" || !brandSlug) throw new Error("INVALID_BRAND");
  const { admin, seller } = await requireFinanceSeller();
  if (seller.brand_slug !== brandSlug || seller.status !== "ACTIVE") throw new Error("SELLER_ACCESS_DENIED");
  const { data, error } = await admin.from("comu_seller_payment_accounts")
    .select("onboarding_status,financial_suspended").eq("seller_id", seller.id).maybeSingle();
  if (error) throw new Error("PAYMENT_STATUS_UNAVAILABLE");
  const status: unknown = data?.onboarding_status ?? "NOT_STARTED";
  if (status !== "NOT_STARTED" && status !== "PENDING" && status !== "REVIEW" && status !== "COMPLETE" && status !== "RESTRICTED") throw new Error("PAYMENT_STATUS_UNKNOWN");
  return { status, suspended: data?.financial_suspended === true };
}

export async function getConnectSettingsState(brandSlug: string): Promise<PaymentState> {
  try { return { ok: true, ...await readPaymentState(brandSlug) }; }
  catch { return { ok: false, error: "No pudimos consultar tus pagos. Verifica tu acceso a esta tienda e inténtalo nuevamente." }; }
}

export async function startConnectSettingsOnboarding(brandSlug: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const state = await readPaymentState(brandSlug);
    if (state.suspended || state.status === "REVIEW" || state.status === "COMPLETE") return { ok: false, error: "La configuración no está disponible en el estado actual de tu cuenta. Actualiza su estado." };
    // Both helpers independently authenticate the seller and resolve Stripe mode on the server.
    const account = await createSellerConnectAccount();
    if (account.onboarding_status === "REVIEW" || account.onboarding_status === "COMPLETE") return { ok: false, error: "Tu cuenta cambió de estado. Actualiza antes de continuar." };
    const link = await createSellerOnboardingLink();
    return { ok: true, url: link.url };
  } catch {
    return { ok: false, error: "No pudimos abrir la configuración de pagos. Actualiza el estado antes de reintentar." };
  }
}
