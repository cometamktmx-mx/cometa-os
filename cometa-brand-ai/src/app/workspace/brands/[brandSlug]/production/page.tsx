import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceShell } from "@/app/workspace/components/workspace-shell";
import { getAdminBrandSummaries } from "@/lib/workspace/admin-brands";
import { getBrandProductionProfile } from "@/lib/studio/production";
import { ProductionProfileForm } from "./production-form";
export const dynamic = "force-dynamic";
export default async function ProductionPage({ params }: { params: Promise<{ brandSlug: string }> }) { const { brandSlug } = await params; const brand = (await getAdminBrandSummaries()).find((item) => item.slug === brandSlug); if (!brand) notFound(); const profile = await getBrandProductionProfile(brand.slug); return <WorkspaceShell><Link href={`/workspace/brands/${encodeURIComponent(brand.slug)}`} className="text-sm text-cyan-300">← Volver a {brand.name}</Link><div className="mt-6"><p className="text-xs uppercase tracking-[.2em] text-cyan-300">PRODUCCIÓN</p><h1 className="mt-2 text-3xl font-semibold text-white">Perfil de producción</h1><p className="mt-2 max-w-2xl text-sm text-slate-400">Configura cómo puede producirse contenido para esta marca. Esta información guía al equipo operativo; no modifica estrategia ni productos contratados.</p></div><div className="mt-8"><ProductionProfileForm brandSlug={brand.slug} initial={profile} /></div></WorkspaceShell>; }
