import Link from "next/link";
import { PageHeader } from "./components/os-primitives";
import { requireBrandOsAccess } from "@/lib/brand-os/server";
import { CommandCenterClient } from "./components/command-center-client";
import { RecentActivity } from "./components/recent-activity";
export const dynamic = "force-dynamic";
export default async function CometaOsPage({ params }: { params: Promise<{ brandSlug: string }> }) {
  const { brandSlug } = await params; const access = await requireBrandOsAccess(brandSlug); const base = `/brand/${encodeURIComponent(access.brand.slug)}/os`;
  return <div className="space-y-6"><PageHeader eyebrow="RESUMEN · HOY" title={`El pulso de ${access.brand.name}`} description="Una vista clara de lo que está pasando, lo que hizo Cometa y lo que merece atención." /><section className="os-card-primary overflow-hidden"><div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-start gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">✦</div><div><p className="os-label text-blue-700">CENTRO DE CRECIMIENTO</p><h2 className="mt-1.5 max-w-xl text-lg font-semibold tracking-[-0.03em] text-[var(--os-text)]">Tu negocio, la ejecución de Cometa y las próximas decisiones en un solo lugar.</h2></div></div><div className="flex shrink-0 flex-wrap gap-2"><Link className="inline-flex rounded-xl bg-[var(--os-primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700" href={`${base}/intelligence`}>Ver Intelligence</Link><Link className="inline-flex rounded-xl border border-[var(--os-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--os-text)] transition hover:border-blue-300" href={`${base}/sales`}>Abrir Sales AI</Link></div></div></section><CommandCenterClient brandSlug={access.brand.slug} /><RecentActivity brandSlug={access.brand.slug} /></div>;
}
