import Link from "next/link";
import { redirect } from "next/navigation";
import { getPosEntryBrands } from "@/lib/pos/entry-server";
import { posEntryDestination, posReturnTo } from "@/lib/pos/navigation";
import { PosApiError } from "@/lib/pos/server";
import { PosExit } from "@/components/pos-exit";

export const dynamic = "force-dynamic";
export default async function PosEntry({ searchParams }: { searchParams: Promise<{ next?: string; returnTo?: string; select?: string }> }) {
  const query = await searchParams;
  let brands: Awaited<ReturnType<typeof getPosEntryBrands>> = [];
  let failure: string | null = null;
  try { brands = await getPosEntryBrands(); }
  catch (error) {
    if (error instanceof PosApiError && error.status === 401) {
      redirect(`/login?next=${encodeURIComponent(posReturnTo(query.next, query.returnTo) || "/pos")}`);
    }
    failure = "No se pudo verificar el acceso a tus negocios. Reintenta.";
  }
  const requested = posReturnTo(query.next, query.returnTo);
  if (!failure && requested && new URL(requested, "https://pos.invalid").pathname !== "/pos") redirect(requested);
  const available = brands.filter(brand => brand.availability.available);
  if (!failure && available.length === 1 && query.select !== "1") redirect(posEntryDestination(available));
  return <main className="min-h-screen bg-slate-950 p-6 text-white"><section className="mx-auto max-w-xl space-y-5 py-12">
    <p className="text-sm text-cyan-300">COMETA POS</p><h1 className="text-2xl font-semibold">Selecciona tu negocio</h1>
    {failure ? <p role="alert">{failure}</p> : brands.length ? brands.map(brand => <Link key={brand.id} href={`/brand/${encodeURIComponent(brand.slug)}/pos`} className="block rounded-xl border border-white/20 p-4">
      <strong>{brand.name}</strong><span className="block text-sm text-slate-300">{brand.availability.available ? "Abrir POS" : "Acceso no disponible · revisar estado"}</span>
    </Link>) : <p>No tienes un negocio POS autorizado. Solicita acceso al propietario.</p>}
    <PosExit />
  </section></main>;
}
