"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Priority = "Alta" | "Media" | "Baja";
type UserRole = "admin" | "client";

type WorkspaceUser = {
  id: string;
  email: string | null;
  role: UserRole;
  isAdmin: boolean;
  allowedBrandSlugs: string[];
};

type WorkspaceBrand = {
  id: string | null;
  slug: string;
  name: string;
  industry: string;
  city: string | null;
  sourceTable: string;
  health: number;
  salesAI: number;
  knowledge: number;
  learning: number;
  leads: number;
  status: string;
  priority: Priority;
  recommendedAction: string;
  href: string;
  missionHref: string;
  updatedAt: string | null;
};

type WorkspaceTotals = {
  brands: number;
  activeAgents: number;
  leads: number;
  learning: number;
  averageHealth: number;
};

type NavItem = {
  code: string;
  label: string;
  href: string;
  active?: boolean;
  disabled?: boolean;
  adminOnly?: boolean;
};

const fallbackTotals: WorkspaceTotals = {
  brands: 0,
  activeAgents: 0,
  leads: 0,
  learning: 0,
  averageHealth: 0,
};

const nav: NavItem[] = [
  { code: "WS", label: "Workspace", href: "/workspace", active: true },
  { code: "AD", label: "Accesos", href: "/workspace/admin", adminOnly: true },
  { code: "OR", label: "Nueva marca", href: "/new-analysis", adminOnly: true },
  { code: "IN", label: "Inbox", href: "/sales-ai/inbox" },
  { code: "KB", label: "Knowledge", href: "/sales-ai/knowledge" },
  { code: "LR", label: "Learning", href: "/sales-ai/learning" },
  { code: "MC", label: "Misión", href: "/cometa-os/design" },
];

export default function WorkspacePage() {
  const router = useRouter();

  const [user, setUser] = useState<WorkspaceUser | null>(null);
  const [brands, setBrands] = useState<WorkspaceBrand[]>([]);
  const [totals, setTotals] = useState<WorkspaceTotals>(fallbackTotals);
  const [loading, setLoading] = useState(true);
  const [systemMessage, setSystemMessage] = useState("");

  const isAdmin = user?.role === "admin";

  const topPriorityBrands = useMemo(() => {
    return brands.filter((brand) => brand.priority !== "Baja").slice(0, 4);
  }, [brands]);

  const readyBrands = useMemo(() => {
    return brands.filter((brand) => brand.health >= 80).length;
  }, [brands]);

  useEffect(() => {
    loadWorkspace();
  }, []);

  async function loadWorkspace() {
    try {
      setLoading(true);
      setSystemMessage("");

      const res = await fetch("/api/workspace-brands", {
        method: "GET",
        cache: "no-store",
      });

      const data = await res.json();

      if (res.status === 401) {
        router.replace("/login?next=/workspace");
        return;
      }

      if (!res.ok || data.ok === false) {
        throw new Error(data?.error || "No se pudo cargar el workspace.");
      }

      if (data.shouldRedirectToBusinessOnboarding) {
        router.replace("/onboarding/business");
        return;
      }

      if (data.shouldRedirectToBrand && data.redirectBrandHref) {
        router.replace(data.redirectBrandHref);
        return;
      }

      setUser(data.user || null);
      setBrands(Array.isArray(data.brands) ? data.brands : []);
      setTotals(data.totals || fallbackTotals);
    } catch (error: any) {
      setSystemMessage(error?.message || "Error cargando Workspace.");
      setBrands([]);
      setTotals(fallbackTotals);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f2f7fb] text-slate-950">
      <section className="mx-auto grid min-h-screen w-full max-w-[1800px] grid-cols-1 gap-4 p-4 xl:grid-cols-[214px_minmax(0,1fr)_390px]">
        <WorkspaceDock user={user} />

        <section className="flex min-w-0 flex-col gap-4">
          {systemMessage ? <LoadWarning message={systemMessage} /> : null}

          <WorkspaceHero
            user={user}
            totals={totals}
            loading={loading}
            onRefresh={loadWorkspace}
          />

          <WorkspaceMetrics
            totals={totals}
            readyBrands={readyBrands}
            loading={loading}
          />

          <AcquisitionCenter isAdmin={Boolean(isAdmin)} loading={loading} />

          <BrandCommandCenter
            brands={brands}
            loading={loading}
            isAdmin={Boolean(isAdmin)}
          />

          <AgentNetwork />
        </section>

        <aside className="sticky top-4 hidden h-fit min-w-0 flex-col gap-4 xl:flex">
          <TopControls
            loading={loading}
            onRefresh={loadWorkspace}
            isAdmin={Boolean(isAdmin)}
          />

          <WorkspacePulse totals={totals} loading={loading} />

          <PriorityPanel brands={topPriorityBrands} loading={loading} />

          <CometaPrinciple isAdmin={Boolean(isAdmin)} />
        </aside>
      </section>
    </main>
  );
}

function LoadWarning({ message }: { message: string }) {
  return (
    <div className="rounded-[26px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-700">
      No se pudo cargar la información real desde Supabase. Detalle: {message}
    </div>
  );
}

function WorkspaceDock({ user }: { user: WorkspaceUser | null }) {
  const isAdmin = user?.role === "admin";
  const visibleNav = nav.filter((item) => !item.adminOnly || isAdmin);

  return (
    <aside className="hidden rounded-[34px] border border-white bg-white/90 p-3 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur xl:flex xl:flex-col">
      <div className="flex items-center gap-3 rounded-[26px] bg-slate-50 px-3 py-3">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-slate-950 shadow-xl shadow-cyan-400/20">
          <div className="absolute h-7 w-7 rounded-full bg-cyan-400 blur-[6px]" />
          <div className="relative h-7 w-7 rounded-full bg-gradient-to-br from-cyan-300 via-emerald-400 to-slate-950" />
        </div>

        <div className="min-w-0">
          <p className="text-lg font-black leading-none tracking-[-0.06em] text-slate-950">
            cometa
          </p>
          <p className="text-lg font-black leading-none tracking-[-0.06em] text-slate-950">
            OS
          </p>
        </div>
      </div>

      <nav className="mt-7 flex flex-1 flex-col gap-2">
        {visibleNav.map((item) => {
          const className = `flex h-12 items-center gap-3 rounded-2xl px-3 text-left transition ${
            item.active
              ? "border border-cyan-200 bg-cyan-50 text-slate-950 shadow-sm shadow-cyan-950/5"
              : item.disabled
              ? "cursor-not-allowed text-slate-300"
              : "text-slate-500 hover:bg-slate-50 hover:text-slate-950"
          }`;

          const content = (
            <>
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[10px] font-black ${
                  item.active
                    ? "bg-white text-cyan-700 shadow-sm"
                    : item.disabled
                    ? "bg-slate-50 text-slate-300"
                    : "bg-slate-50 text-slate-400"
                }`}
              >
                {item.code}
              </span>

              <span className="truncate text-[13px] font-black">
                {item.label}
              </span>
            </>
          );

          if (item.disabled) {
            return (
              <button key={item.code} disabled className={className}>
                {content}
              </button>
            );
          }

          return (
            <Link key={item.code} href={item.href} className={className}>
              {content}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 rounded-[24px] border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">
            {isAdmin ? "CM" : "CL"}
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-800">
              {user?.email || "Cometa OS"}
            </p>
            <p className="text-xs font-bold text-slate-400">
              {isAdmin ? "Admin global" : "Cliente"}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-[22px] bg-emerald-50 px-3 py-3">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />

        <div className="min-w-0">
          <p className="text-xs font-bold text-emerald-700">Sistema</p>
          <p className="truncate text-xs font-black text-emerald-950">
            Workspace activo
          </p>
        </div>
      </div>
    </aside>
  );
}

function WorkspaceHero({
  user,
  totals,
  loading,
  onRefresh,
}: {
  user: WorkspaceUser | null;
  totals: WorkspaceTotals;
  loading: boolean;
  onRefresh: () => void;
}) {
  const isAdmin = user?.role === "admin";

  return (
    <header className="rounded-[38px] border border-white bg-white px-7 py-7 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
      <div className="grid gap-7 2xl:grid-cols-[minmax(0,1fr)_360px] 2xl:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-slate-950 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-white">
              Cometa OS
            </span>

            <span className="rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-700">
              {isAdmin ? "Admin Workspace" : "Client Workspace"}
            </span>

            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
              {loading ? "Sincronizando" : "Supabase conectado"}
            </span>
          </div>

          <p className="mt-7 text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">
            {isAdmin ? "Command Center global" : "Workspace de marca"}
          </p>

          <h1 className="mt-3 max-w-5xl text-5xl font-black leading-[0.92] tracking-[-0.085em] text-slate-950 md:text-6xl 2xl:text-[70px]">
            {isAdmin ? "Cometa OS" : "Tu Brand OS"}
            <br />
            Workspace
          </h1>

          <p className="mt-5 max-w-4xl text-[17px] font-semibold leading-8 text-slate-500">
            {isAdmin
              ? "Controla marcas, accesos, agentes, ventas, conocimiento y aprendizajes desde un solo centro operativo."
              : "Consulta únicamente las marcas asignadas a tu usuario, con datos, agentes y herramientas separadas por negocio."}
          </p>
        </div>

        <div className="rounded-[32px] bg-slate-950 p-5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.14)]">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
            Sistema operativo
          </p>

          <div className="mt-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-4xl font-black leading-[0.9] tracking-[-0.08em]">
                Brand
                <br />
                Network
              </h2>

              <div className="mt-4 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <p className="text-sm font-bold text-slate-300">
                  {loading
                    ? "Cargando marcas"
                    : `${totals.brands} marcas visibles`}
                </p>
              </div>
            </div>

            <ScoreRing value={totals.averageHealth || 0} />
          </div>

          <button
            onClick={onRefresh}
            disabled={loading}
            className="mt-5 h-12 w-full rounded-2xl bg-white px-5 text-sm font-black text-slate-950 transition hover:bg-slate-100 disabled:opacity-50"
          >
            {loading ? "Sincronizando..." : "Actualizar Workspace"}
          </button>
        </div>
      </div>
    </header>
  );
}

function WorkspaceMetrics({
  totals,
  readyBrands,
  loading,
}: {
  totals: WorkspaceTotals;
  readyBrands: number;
  loading: boolean;
}) {
  const metrics = [
    { label: "Marcas", value: totals.brands, code: "BR" },
    { label: "Agentes activos", value: totals.activeAgents, code: "AI" },
    { label: "Leads", value: totals.leads, code: "LD" },
    { label: "Learning", value: totals.learning, code: "LR" },
    { label: "Salud promedio", value: `${totals.averageHealth}%`, code: "HP" },
    { label: "Listas", value: readyBrands, code: "OK" },
  ];

  return (
    <section className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
      {metrics.map((metric) => (
        <article
          key={metric.label}
          className="min-w-0 rounded-[28px] border border-white bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)]"
        >
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-xs font-black text-cyan-700">
              {metric.code}
            </div>

            <p className="min-w-0 truncate text-right text-3xl font-black leading-none tracking-[-0.08em] text-slate-950 md:text-4xl">
              {loading ? "..." : metric.value}
            </p>
          </div>

          <p className="mt-4 truncate text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
            {metric.label}
          </p>
        </article>
      ))}
    </section>
  );
}

function AcquisitionCenter({
  isAdmin,
  loading,
}: {
  isAdmin: boolean;
  loading: boolean;
}) {
  if (!isAdmin) {
    return (
      <section className="rounded-[38px] border border-white bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
        <div className="rounded-[30px] bg-slate-950 p-6 text-white">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
            Client View
          </p>

          <h2 className="mt-3 text-4xl font-black tracking-[-0.07em]">
            Tus marcas asignadas.
          </h2>

          <p className="mt-3 max-w-3xl text-sm font-semibold leading-7 text-slate-300">
            Esta vista está filtrada por permisos. Solo aparecen las marcas
            conectadas a tu usuario por Cometa OS.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="grid gap-4 lg:grid-cols-3">
      <Link
        href="/new-analysis"
        className="group rounded-[34px] border border-white bg-slate-950 p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.12)] transition hover:-translate-y-1"
      >
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
          Centro de captación
        </p>

        <h2 className="mt-4 text-4xl font-black leading-[0.92] tracking-[-0.075em]">
          Analizar nueva marca con ORION.
        </h2>

        <p className="mt-4 text-sm font-semibold leading-7 text-slate-300">
          Crea un diagnóstico comercial y genera una nueva entrada en el sistema.
        </p>

        <p className="mt-5 text-sm font-black text-cyan-300">
          Iniciar diagnóstico →
        </p>
      </Link>

      <Link
        href="/workspace/admin"
        className="group rounded-[34px] border border-white bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)] transition hover:-translate-y-1 hover:border-cyan-200"
      >
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-700">
          Accesos
        </p>

        <h2 className="mt-4 text-4xl font-black leading-[0.92] tracking-[-0.075em] text-slate-950">
          Conectar usuarios con marcas.
        </h2>

        <p className="mt-4 text-sm font-semibold leading-7 text-slate-500">
          Administra qué cliente puede visualizar cada Brand OS.
        </p>

        <p className="mt-5 text-sm font-black text-cyan-700">
          Ir al Access Center →
        </p>
      </Link>

      <article className="rounded-[34px] border border-white bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
          Estado operativo
        </p>

        <h2 className="mt-4 text-4xl font-black leading-[0.92] tracking-[-0.075em] text-slate-950">
          Sistema listo para escalar.
        </h2>

        <p className="mt-4 text-sm font-semibold leading-7 text-slate-500">
          {loading
            ? "Sincronizando datos del workspace..."
            : "Workspace conectado con Supabase, roles y marcas visibles."}
        </p>

        <div className="mt-5 flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">
            Roles activos
          </p>
        </div>
      </article>
    </section>
  );
}

function BrandCommandCenter({
  brands,
  loading,
  isAdmin,
}: {
  brands: WorkspaceBrand[];
  loading: boolean;
  isAdmin: boolean;
}) {
  return (
    <section className="rounded-[38px] border border-white bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
            Brand Command Center
          </p>

          <h2 className="mt-1 text-3xl font-black tracking-[-0.055em] text-slate-950">
            {isAdmin ? "Marcas conectadas" : "Tus marcas"}
          </h2>
        </div>

        <span className="rounded-full border border-cyan-200 bg-cyan-50 px-5 py-2 text-xs font-black uppercase tracking-[0.16em] text-cyan-700">
          Supabase live
        </span>
      </div>

      <div className="mt-6 grid gap-4">
        {loading ? (
          <>
            <BrandSkeleton />
            <BrandSkeleton />
            <BrandSkeleton />
          </>
        ) : brands.length ? (
          brands.map((brand) => <BrandCard key={brand.slug} brand={brand} />)
        ) : (
          <EmptyWorkspace isAdmin={isAdmin} />
        )}
      </div>
    </section>
  );
}

function BrandCard({ brand }: { brand: WorkspaceBrand }) {
  const brandQuery = `brandSlug=${encodeURIComponent(brand.slug)}`;

  return (
    <article className="rounded-[32px] border border-slate-200 bg-slate-50/70 p-5">
      <div className="grid gap-5 2xl:grid-cols-[minmax(280px,1fr)_minmax(420px,500px)_170px] 2xl:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${
                brand.priority === "Alta"
                  ? "border-rose-200 bg-rose-50 text-rose-600"
                  : brand.priority === "Media"
                  ? "border-amber-200 bg-amber-50 text-amber-600"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {brand.priority}
            </span>

            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
              {brand.status}
            </span>

            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
              {brand.sourceTable}
            </span>
          </div>

          <h3 className="mt-4 truncate text-3xl font-black tracking-[-0.065em] text-slate-950">
            {brand.name}
          </h3>

          <p className="mt-1 truncate text-sm font-bold text-slate-500">
            {brand.industry}
            {brand.city ? ` · ${brand.city}` : ""}
          </p>

          <p className="mt-4 text-sm font-black text-cyan-700">
            {brand.recommendedAction}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <BrandMini label="Health" value={`${brand.health}%`} />
          <BrandMini label="Sales AI" value={`${brand.salesAI}%`} />
          <BrandMini label="Knowledge" value={`${brand.knowledge}%`} />
          <BrandMini label="Learning" value={String(brand.learning)} />
        </div>

        <div className="grid gap-3">
          <Link
            href={brand.href}
            className="flex h-12 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-black text-white shadow-lg shadow-slate-950/10 transition hover:bg-slate-800"
          >
            Entrar
          </Link>

          <Link
            href={`/sales-ai/inbox?${brandQuery}`}
            className="flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            Inbox
          </Link>

          <Link
            href={`/sales-ai/knowledge?${brandQuery}`}
            className="flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            Knowledge
          </Link>
        </div>
      </div>
    </article>
  );
}

function BrandMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-4">
      <p className="truncate text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>

      <p className="mt-2 truncate text-2xl font-black tracking-[-0.06em] text-slate-950">
        {value}
      </p>
    </div>
  );
}

function BrandSkeleton() {
  return (
    <div className="rounded-[32px] border border-slate-200 bg-slate-50 p-5">
      <div className="h-5 w-40 rounded-full bg-slate-200" />
      <div className="mt-5 h-9 w-72 rounded-2xl bg-slate-200" />
      <div className="mt-3 h-4 w-48 rounded-full bg-slate-200" />
      <div className="mt-5 grid grid-cols-4 gap-3">
        <div className="h-20 rounded-[22px] bg-slate-200" />
        <div className="h-20 rounded-[22px] bg-slate-200" />
        <div className="h-20 rounded-[22px] bg-slate-200" />
        <div className="h-20 rounded-[22px] bg-slate-200" />
      </div>
    </div>
  );
}

function EmptyWorkspace({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="rounded-[32px] border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
      <h3 className="text-3xl font-black tracking-[-0.06em] text-slate-950">
        {isAdmin
          ? "Todavía no hay marcas detectadas"
          : "No tienes marcas asignadas"}
      </h3>

      <p className="mx-auto mt-3 max-w-xl text-sm font-semibold leading-7 text-slate-500">
        {isAdmin
          ? "Cuando ORION o el análisis de marca guarde nuevos registros en Supabase, aparecerán automáticamente aquí."
          : "Pide al administrador de Cometa OS que conecte tu usuario con una marca desde el Access Center."}
      </p>
    </div>
  );
}

function AgentNetwork() {
  const agents = [
    {
      code: "OR",
      name: "ORION",
      role: "Diagnóstico",
      status: "Análisis de marca",
    },
    {
      code: "NV",
      name: "NOVA",
      role: "Business Map",
      status: "Contexto comercial",
    },
    {
      code: "SA",
      name: "SALES AI",
      role: "Ventas",
      status: "WhatsApp / Leads",
    },
    {
      code: "KB",
      name: "Knowledge",
      role: "Cerebro comercial",
      status: "Reglas / FAQs",
    },
  ];

  return (
    <section className="rounded-[38px] border border-white bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
      <div className="border-b border-slate-100 pb-5">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
          Agent Network
        </p>

        <h2 className="mt-1 text-3xl font-black tracking-[-0.055em] text-slate-950">
          Red de agentes Cometa OS
        </h2>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        {agents.map((agent) => (
          <article
            key={agent.code}
            className="rounded-[30px] border border-slate-200 bg-slate-50/70 p-5"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-xs font-black text-cyan-700 shadow-sm">
              {agent.code}
            </div>

            <h3 className="mt-5 text-2xl font-black tracking-[-0.055em] text-slate-950">
              {agent.name}
            </h3>

            <p className="mt-1 text-sm font-black text-slate-500">
              {agent.role}
            </p>

            <p className="mt-4 rounded-2xl bg-white px-3 py-3 text-xs font-black text-slate-500">
              {agent.status}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function TopControls({
  loading,
  onRefresh,
  isAdmin,
}: {
  loading: boolean;
  onRefresh: () => void;
  isAdmin: boolean;
}) {
  return (
    <div className="flex justify-end gap-3">
      {isAdmin ? (
        <Link
          href="/workspace/admin"
          className="flex h-12 items-center rounded-2xl bg-white px-5 text-sm font-black text-slate-950 shadow-sm transition hover:bg-slate-50"
        >
          Accesos
        </Link>
      ) : null}

      {isAdmin ? (
        <Link
          href="/new-analysis"
          className="flex h-12 items-center rounded-2xl bg-cyan-500 px-5 text-sm font-black text-slate-950 shadow-sm transition hover:bg-cyan-400"
        >
          + ORION
        </Link>
      ) : null}

      <button
        onClick={onRefresh}
        disabled={loading}
        className="flex h-12 items-center gap-3 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white shadow-lg shadow-slate-950/10 transition hover:bg-slate-800 disabled:opacity-50"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-400/15 text-cyan-300">
          <RefreshIcon />
        </span>
        Actualizar
      </button>
    </div>
  );
}

function WorkspacePulse({
  totals,
  loading,
}: {
  totals: WorkspaceTotals;
  loading: boolean;
}) {
  return (
    <section className="rounded-[38px] bg-slate-950 p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.16)]">
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
            Workspace Pulse
          </p>

          <h2 className="mt-4 whitespace-nowrap text-[46px] font-black leading-[0.92] tracking-[-0.075em]">
            {loading ? "..." : `${totals.averageHealth}%`}
          </h2>

          <div className="mt-4 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <p className="text-sm font-bold text-slate-300">
              Salud operativa
            </p>
          </div>
        </div>

        <ScoreRing value={totals.averageHealth || 0} />
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between text-xs font-bold text-slate-400">
          <span>Estado global</span>
          <span>{totals.averageHealth}%</span>
        </div>

        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.8)]"
            style={{ width: `${totals.averageHealth || 0}%` }}
          />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <DarkMini label="Marcas" value={String(totals.brands)} />
        <DarkMini label="Agentes" value={String(totals.activeAgents)} />
        <DarkMini label="Leads" value={String(totals.leads)} />
        <DarkMini label="Learning" value={String(totals.learning)} />
      </div>
    </section>
  );
}

function PriorityPanel({
  brands,
  loading,
}: {
  brands: WorkspaceBrand[];
  loading: boolean;
}) {
  return (
    <section className="rounded-[34px] border border-white bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
        Prioridades
      </p>

      <div className="mt-5 grid gap-3">
        {loading ? (
          <>
            <PrioritySkeleton />
            <PrioritySkeleton />
            <PrioritySkeleton />
          </>
        ) : brands.length ? (
          brands.map((brand, index) => (
            <Link
              key={brand.slug}
              href={brand.href}
              className="flex min-w-0 items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 transition hover:border-cyan-200 hover:bg-cyan-50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-sm font-black text-white">
                {index + 1}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-black text-slate-950">
                    {brand.name}
                  </p>

                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase ${
                      brand.priority === "Alta"
                        ? "bg-rose-50 text-rose-600"
                        : "bg-amber-50 text-amber-600"
                    }`}
                  >
                    {brand.priority}
                  </span>
                </div>

                <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                  {brand.recommendedAction}
                </p>
              </div>
            </Link>
          ))
        ) : (
          <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">
            Sin prioridades por ahora.
          </p>
        )}
      </div>
    </section>
  );
}

function PrioritySkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="h-4 w-40 rounded-full bg-slate-200" />
      <div className="mt-2 h-3 w-56 rounded-full bg-slate-200" />
    </div>
  );
}

function CometaPrinciple({ isAdmin }: { isAdmin: boolean }) {
  return (
    <section className="rounded-[34px] border border-cyan-100 bg-cyan-50 p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-700">
        Principio Cometa
      </p>

      <p className="mt-3 text-sm font-black leading-6 text-slate-950">
        {isAdmin
          ? "Cada marca debe operar con datos, memoria y agentes conectados."
          : "Cada marca opera de forma separada para proteger sus datos."}
      </p>

      <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
        {isAdmin
          ? "Si una marca nace desde análisis, debe aparecer aquí sin tocar código."
          : "Tu workspace solo muestra las marcas autorizadas para tu usuario."}
      </p>
    </section>
  );
}

function ScoreRing({ value }: { value: number }) {
  return (
    <div
      className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(#22d3ee ${
          value * 3.6
        }deg, rgba(255,255,255,0.12) 0deg)`,
      }}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-950 ring-8 ring-cyan-400/10">
        <div className="text-center">
          <p className="text-2xl font-black tracking-[-0.07em]">{value}</p>
          <p className="text-[10px] font-black text-slate-400">/100</p>
        </div>
      </div>
    </div>
  );
}

function DarkMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-[10px] font-bold text-slate-400">{label}</p>
      <p className="mt-1 truncate text-lg font-black text-white">{value}</p>
    </div>
  );
}

function RefreshIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 11-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}
