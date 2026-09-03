import Link from "next/link";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "./components/workspace-shell";
import { getAdminBrandSummaries, type AdminBrandSummary } from "@/lib/workspace/admin-brands";
import { getAdminCalendarWorkspaceOverview, type AdminTodayActivity } from "@/lib/workspace/admin-calendars";
import { getUserWorkspaceContext } from "@/lib/workspace/context";
import { BrandOsGuardError } from "@/lib/brand-os/server";
import { getBrandActivity } from "@/lib/cosmos/activity";
import { dateKeyInCometaZone, timeInCometaZone } from "@/lib/workspace/presentation";

export const dynamic = "force-dynamic";
const label = (value: string) => ({ active: "Activo", paused: "Pausado", inactive: "Inactivo", not_configured: "No configurado", preparation: "Configuración pendiente", unavailable: "Sin acceso" } as Record<string, string>)[value] || value;
type AdminHomeEvent = { id: string; brandName: string; title: string; occurredAt: string };

export default async function WorkspacePage() {
  let context: Awaited<ReturnType<typeof getUserWorkspaceContext>>;
  try { context = await getUserWorkspaceContext(); }
  catch (error) { if (error instanceof BrandOsGuardError && error.status === 401) redirect("/login?next=/workspace"); throw error; }
  if (context.isCanonicalTeam) redirect("/studio");
  if (context.isCanonicalAdmin) return <AdminWorkspace />;
  if (context.brands.length === 1) redirect(`/brand/${encodeURIComponent(context.brands[0].slug)}`);
  if (!context.brands.length) return <EmptyClientWorkspace />;
  return <ClientBrandSelector brands={context.brands} />;
}

async function AdminWorkspace() {
  const [brands, calendarOverview] = await Promise.all([getAdminBrandSummaries(), getAdminCalendarWorkspaceOverview()]);
  const events = await getTodayAdminEvents(brands);
  const counts = { os: brands.filter((brand) => brand.os.status === "active").length, pos: brands.filter((brand) => brand.pos.state === "active").length, setup: brands.filter((brand) => brand.pos.state === "preparation").length };
  return <WorkspaceShell><header className="flex flex-col justify-between gap-6 border-b border-white/[.08] pb-8 lg:flex-row lg:items-end"><div><p className="text-xs font-semibold uppercase tracking-[.24em] text-cyan-300">COMETA ADMIN</p><h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Centro operativo de Cometa</h1><p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">Marcas, productos y operación en un solo lugar.</p></div><div className="flex flex-wrap gap-2"><Link href="/workspace/calendars" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">Ver calendarios</Link><Link href="/workspace/brands" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-200">Ver marcas</Link><Link href="/workspace/access" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-200">Gestionar accesos</Link></div></header><div className="grid border-b border-white/[.08] sm:grid-cols-2 lg:grid-cols-4"><Metric label="Marcas" value={brands.length} /><Metric label="OS activos" value={counts.os} tone="cyan" /><Metric label="POS activos" value={counts.pos} tone="violet" /><Metric label="Configuración pendiente" value={counts.setup} tone="amber" /></div><TodayCommand activity={calendarOverview.today} events={events} /><BrandOverview brands={brands} /></WorkspaceShell>;
}

async function getTodayAdminEvents(brands: AdminBrandSummary[]): Promise<AdminHomeEvent[]> {
  const today = dateKeyInCometaZone(new Date());
  const pages = await Promise.all(brands.map(async (brand) => {
    try { const page = await getBrandActivity({ brandSlug: brand.slug, audience: "admin", limit: 8 }); return page.events.map((event) => ({ id: event.id, brandName: brand.name, title: event.title, occurredAt: event.occurredAt })); }
    catch { return [] as AdminHomeEvent[]; }
  }));
  return pages.flat().filter((event) => dateKeyInCometaZone(new Date(event.occurredAt)) === today).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 8);
}

function TodayCommand({ activity, events }: { activity: AdminTodayActivity; events: AdminHomeEvent[] }) {
  const attention = [["Cambios solicitados", activity.changesRequested],["Revisiones internas",activity.internalReviews],["Esperando al cliente",activity.awaitingClient],["Publicaciones de hoy",activity.scheduledPublications],["Vencimientos de hoy",activity.dueItems]].filter(([,value]) => Number(value) > 0) as Array<[string,number]>;
  return <section className="grid gap-8 border-b border-white/[.08] py-9 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]"><div><div className="flex items-end justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.22em] text-slate-500">Hoy en Cometa</p><h2 className="mt-2 text-2xl font-semibold text-white">Actividad real del día</h2></div><span className="text-xs text-slate-600">{activity.date}</span></div>{events.length ? <div className="mt-6 divide-y divide-white/[.06]">{events.map((event) => <div key={event.id} className="grid grid-cols-[54px_120px_minmax(0,1fr)] gap-4 py-4 first:pt-0"><time className="text-sm font-medium text-cyan-300">{timeInCometaZone(event.occurredAt)}</time><p className="truncate text-sm font-medium text-white">{event.brandName}</p><p className="text-sm leading-6 text-slate-400">{event.title}</p></div>)}</div> : <div className="mt-6 border-l border-white/10 py-4 pl-5"><p className="text-sm font-medium text-slate-300">No hay actividad registrada hoy.</p><p className="mt-1 text-xs leading-5 text-slate-600">La actividad aparecerá cuando una acción real genere un evento verificable.</p></div>}</div><aside className="xl:border-l xl:border-white/[.08] xl:pl-8"><p className="text-[10px] font-semibold uppercase tracking-[.22em] text-slate-500">Requiere atención</p>{attention.length ? <div className="mt-5 space-y-4">{attention.map(([text,value]) => <div key={text} className="flex items-baseline justify-between gap-4 border-b border-white/[.06] pb-3"><span className="text-sm text-slate-400">{text}</span><strong className="text-xl font-semibold text-white">{value}</strong></div>)}</div> : <p className="mt-5 text-sm leading-6 text-slate-500">No hay pendientes registrados en los calendarios actuales.</p>}<Link href="/workspace/calendars" className="mt-6 inline-flex text-sm font-semibold text-cyan-300">Abrir Calendar Hub →</Link></aside></section>;
}

function BrandOverview({ brands }: { brands: AdminBrandSummary[] }) { return <section className="py-9"><div className="flex items-end justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.22em] text-slate-500">Portafolio</p><h2 className="mt-2 text-2xl font-semibold text-white">Marcas y productos</h2></div><Link href="/workspace/brands" className="text-sm text-cyan-300">Ver todas →</Link></div><div className="mt-6 divide-y divide-white/[.07] border-y border-white/[.07]">{brands.slice(0,6).map((brand) => <div key={brand.slug} className="flex flex-col justify-between gap-4 py-5 sm:flex-row sm:items-center"><Link href={`/workspace/brands/${brand.slug}`} className="text-base font-medium text-white hover:text-cyan-200">{brand.name}</Link><div className="flex flex-wrap gap-2"><Badge tone="cyan">OS · {label(brand.os.status)}</Badge><Badge tone="violet">POS · {label(brand.pos.state)}</Badge><Link href={`/workspace/brands/${brand.slug}/calendar`} className="ml-1 text-sm text-slate-400 hover:text-white">Calendario →</Link></div></div>)}</div></section>; }

function ClientBrandSelector({ brands }: { brands: Awaited<ReturnType<typeof getUserWorkspaceContext>>["brands"] }) { return <main className="min-h-screen bg-[#050916] px-5 py-12 text-slate-100"><div className="mx-auto max-w-5xl"><p className="text-xs font-semibold uppercase tracking-[.28em] text-cyan-300">COMETA</p><h1 className="mt-4 text-4xl font-semibold">Tus empresas</h1><p className="mt-3 text-slate-400">Selecciona la empresa con la que quieres trabajar.</p><div className="mt-8 grid gap-4 md:grid-cols-2">{brands.map((brand) => <article key={brand.slug} className="rounded-3xl border border-white/10 bg-white/[.045] p-6"><h2 className="text-xl font-semibold">{brand.name}</h2><div className="mt-5 flex gap-2"><Badge tone="cyan">Cometa OS · {label(brand.osStatus)}</Badge><Badge tone="violet">Cometa POS · {label(brand.pos.state)}</Badge></div><Link href={`/brand/${encodeURIComponent(brand.slug)}`} className="mt-6 inline-flex rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950">Entrar →</Link></article>)}</div></div></main>; }
function EmptyClientWorkspace() { return <main className="flex min-h-screen items-center justify-center bg-[#050916] p-6 text-slate-100"><section className="max-w-lg rounded-3xl border border-white/10 bg-white/[.045] p-8 text-center"><p className="text-xs font-semibold uppercase tracking-[.24em] text-cyan-300">COMETA</p><h1 className="mt-4 text-3xl font-semibold">No tienes empresas activas</h1><p className="mt-4 text-sm leading-6 text-slate-400">Actualmente no tienes acceso a ninguna empresa en Cometa. Si crees que esto es un error, contacta a tu equipo de Cometa.</p></section></main>; }
function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: string }) { const colors = { cyan: "border-cyan-400/20 bg-cyan-400/10 text-cyan-200", violet: "border-violet-400/20 bg-violet-400/10 text-violet-200", slate: "border-white/10 bg-white/[.05] text-slate-300" } as Record<string,string>; return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] ${colors[tone]}`}>{children}</span>; }
function Metric({ label: text, value, tone = "slate" }: { label: string; value: number; tone?: string }) { return <div className="border-white/[.08] py-6 sm:border-r sm:px-6 sm:first:pl-0 sm:last:border-r-0"><p className="text-xs text-slate-500">{text}</p><p className={`mt-2 text-3xl font-semibold ${tone === "cyan" ? "text-cyan-300" : tone === "violet" ? "text-violet-300" : tone === "amber" ? "text-amber-300" : "text-white"}`}>{value}</p></div>; }
