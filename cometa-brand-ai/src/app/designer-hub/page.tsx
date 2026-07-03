"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type DesignerDashboardData = {
  ok: boolean;
  access: {
    role: "admin" | "internal" | "member";
    userId: string | null;
    email: string | null;
  };
  brands: DesignerBrand[];
  summary: {
    totalBrands: number;
    totalItems: number;
    pendingDesign: number;
    inDesign: number;
    changesRequested: number;
    dueToday: number;
    dueThisWeek: number;
  };
};

type DesignerBrand = {
  brandSlug: string;
  role: string;
  settings: any | null;
  selectedCalendar: any | null;
  items: any[];
  nextDueItem: any | null;
  summary: {
    totalItems: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    pendingDesign: number;
    inDesign: number;
    changesRequested: number;
    designUploaded: number;
    dueToday: number;
    dueThisWeek: number;
  };
};

type MercuryAsset = {
  id: string;
  content_item_id: string;
  asset_name?: string | null;
  asset_type?: string | null;
  asset_url?: string | null;
  notes?: string | null;
  provider?: string | null;
  created_at?: string | null;
};

type DesignerViewMode = "work" | "calendar" | "list" | "load";

const statusLabels: Record<string, string> = {
  generated: "Brief listo",
  internal_review: "Revisión interna",
  assigned: "Asignado",
  in_design: "En diseño",
  design_uploaded: "Diseño subido",
  changes_requested: "Cambios solicitados",
  approved_internal: "Aprobado Cometa",
  sent_to_client: "Enviado al cliente",
  approved_client: "Aprobado cliente",
  scheduled: "Programado",
  published: "Publicado",
  analyzed: "Analizado",
  cancelled: "Cancelado",
};

const typeLabels: Record<string, string> = {
  post: "Post",
  carousel: "Carrusel",
  reel: "Reel",
  story: "Historia",
  video: "Video",
  ad: "Campaña",
  email: "Email",
  whatsapp: "WhatsApp",
  other: "Otro",
};

const assetTypeLabels: Record<string, string> = {
  design_preview: "Preview diseño",
  final_design: "Diseño final",
  video: "Video / Reel",
  editable_file: "Editable",
  reference: "Referencia",
  published_evidence: "Evidencia publicada",
  external_link: "Link externo",
};

const providerLabels: Record<string, string> = {
  google_drive: "Drive",
  canva: "Canva",
  capcut: "CapCut",
  figma: "Figma",
  dropbox: "Dropbox",
  wetransfer: "WeTransfer",
  external: "Externo",
};

const statusColors: Record<string, string> = {
  generated: "bg-cyan-50 text-cyan-700 border-cyan-100",
  assigned: "bg-blue-50 text-blue-700 border-blue-100",
  in_design: "bg-amber-50 text-amber-700 border-amber-100",
  design_uploaded: "bg-emerald-50 text-emerald-700 border-emerald-100",
  internal_review: "bg-violet-50 text-violet-700 border-violet-100",
  changes_requested: "bg-orange-50 text-orange-700 border-orange-100",
  approved_internal: "bg-emerald-50 text-emerald-700 border-emerald-100",
  approved_client: "bg-emerald-50 text-emerald-700 border-emerald-100",
  scheduled: "bg-blue-50 text-blue-700 border-blue-100",
  published: "bg-slate-950 text-white border-slate-950",
};

const typeColors: Record<string, string> = {
  post: "bg-blue-50 text-blue-700 border-blue-100",
  carousel: "bg-cyan-50 text-cyan-700 border-cyan-100",
  reel: "bg-violet-50 text-violet-700 border-violet-100",
  story: "bg-emerald-50 text-emerald-700 border-emerald-100",
  video: "bg-purple-50 text-purple-700 border-purple-100",
  ad: "bg-orange-50 text-orange-700 border-orange-100",
  whatsapp: "bg-green-50 text-green-700 border-green-100",
  other: "bg-slate-50 text-slate-700 border-slate-100",
};

const sidebarItems = [
  { label: "Inicio", icon: "⌂", badge: null },
  { label: "Marcas", icon: "▦", badge: "12" },
  { label: "Piezas", icon: "◉", badge: null },
  { label: "Briefs", icon: "▤", badge: null },
  { label: "Calendario", icon: "▣", badge: null },
  { label: "Solicitudes", icon: "♧", badge: "1" },
  { label: "Cambios", icon: "↻", badge: null },
  { label: "Entregas", icon: "☑", badge: null },
  { label: "Reportes", icon: "▥", badge: null },
];

const toolItems = [
  { label: "Plantillas", icon: "▦" },
  { label: "Biblioteca", icon: "◫" },
  { label: "Guías de marca", icon: "▤" },
  { label: "Recursos", icon: "▧" },
];

function getStatusLabel(status?: string | null) {
  return statusLabels[status || ""] || status || "Sin estado";
}

function getTypeLabel(type?: string | null) {
  return typeLabels[type || ""] || type || "Pieza";
}

function getStatusColor(status?: string | null) {
  return (
    statusColors[status || ""] ||
    "bg-slate-50 text-slate-700 border-slate-100"
  );
}

function getTypeColor(type?: string | null) {
  return typeColors[type || ""] || typeColors.other;
}

function getAssetTypeLabel(type?: string | null) {
  return assetTypeLabels[type || ""] || type || "Asset";
}

function getProviderLabel(provider?: string | null) {
  return providerLabels[provider || ""] || provider || "Externo";
}

function formatDate(value?: string | null) {
  if (!value) return "Sin fecha";

  const date = new Date(`${value}T12:00:00`);

  return date.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatShortDate(value?: string | null) {
  if (!value) return "Sin fecha";

  const date = new Date(`${value}T12:00:00`);

  return date.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
  });
}

function formatMonth(month?: number, year?: number) {
  if (!month || !year) return "Sin calendario";

  const date = new Date(year, month - 1, 1);

  return date.toLocaleDateString("es-MX", {
    month: "long",
    year: "numeric",
  });
}

function getBrandName(brand: DesignerBrand) {
  return (
    brand.settings?.brand_name ||
    brand.selectedCalendar?.brand_name ||
    brand.brandSlug
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  );
}

function getTaskUrgency(item: any) {
  const dateValue = item.due_date || item.publish_date;

  if (!dateValue) return "normal";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(`${dateValue}T12:00:00`);
  due.setHours(0, 0, 0, 0);

  const diff = Math.ceil(
    (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diff < 0) return "late";
  if (diff === 0) return "today";
  if (diff <= 2) return "soon";

  return "normal";
}

function getUrgencyLabel(item: any) {
  const urgency = getTaskUrgency(item);

  if (urgency === "late") return "Atrasada";
  if (urgency === "today") return "Hoy";
  if (urgency === "soon") return "Próxima";

  return "En tiempo";
}

function getUrgencyClass(item: any) {
  const urgency = getTaskUrgency(item);

  if (urgency === "late") return "bg-red-50 text-red-700 border-red-100";
  if (urgency === "today")
    return "bg-orange-50 text-orange-700 border-orange-100";
  if (urgency === "soon")
    return "bg-amber-50 text-amber-700 border-amber-100";

  return "bg-slate-50 text-slate-500 border-slate-100";
}

function getPriorityFromItem(item: any) {
  if (item.priority === "high") return "alta";
  if (item.priority === "low") return "baja";

  const urgency = getTaskUrgency(item);

  if (urgency === "late" || urgency === "today") return "alta";
  if (urgency === "soon") return "media";

  return "media";
}

function getPriorityClass(item: any) {
  const priority = getPriorityFromItem(item);

  if (priority === "alta") return "bg-red-50 text-red-700 border-red-100";
  if (priority === "baja")
    return "bg-emerald-50 text-emerald-700 border-emerald-100";

  return "bg-amber-50 text-amber-700 border-amber-100";
}

function getPriorityLabel(item: any) {
  const priority = getPriorityFromItem(item);

  if (priority === "alta") return "Alta";
  if (priority === "baja") return "Baja";

  return "Media";
}

function getImportantDates(brand: DesignerBrand | null) {
  const month = Number(brand?.selectedCalendar?.cycle_month || new Date().getMonth() + 1);
  const year = Number(brand?.selectedCalendar?.cycle_year || new Date().getFullYear());

  const pad = (value: number) => String(value).padStart(2, "0");

  return [
    {
      date: `${year}-${pad(month)}-05`,
      day: "05",
      month: new Date(year, month - 1, 5).toLocaleDateString("es-MX", {
        month: "short",
      }),
      title: "Lanzamiento campaña principal",
      note: "Campaña del mes",
      priority: "Alta",
      className: "bg-red-50 text-red-700 border-red-100",
    },
    {
      date: `${year}-${pad(month)}-15`,
      day: "15",
      month: new Date(year, month - 1, 15).toLocaleDateString("es-MX", {
        month: "short",
      }),
      title: "Revisión creativa intermedia",
      note: "Ajustes y validación",
      priority: "Media",
      className: "bg-amber-50 text-amber-700 border-amber-100",
    },
    {
      date: `${year}-${pad(month)}-22`,
      day: "22",
      month: new Date(year, month - 1, 22).toLocaleDateString("es-MX", {
        month: "short",
      }),
      title: "Cierre de producción mensual",
      note: "Programación final",
      priority: "Baja",
      className: "bg-emerald-50 text-emerald-700 border-emerald-100",
    },
  ];
}

async function safeJson(response: Response) {
  const text = await response.text();

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: text };
  }
}

async function postAssetLink(payload: any) {
  const endpoints = [
    "/api/mercury/assets/add-link",
    "/api/mercury/assets/add-links",
  ];

  let lastError = "No se pudo guardar el link.";

  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json = await safeJson(response);

    if (response.ok && (json?.ok ?? true)) {
      return json;
    }

    lastError = json?.error || `Error ${response.status}`;

    if (response.status !== 404) {
      throw new Error(lastError);
    }
  }

  throw new Error(lastError);
}

export default function DesignerHubPage() {
  const [data, setData] = useState<DesignerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedBrandSlug, setSelectedBrandSlug] = useState<string | null>(
    null
  );
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [viewMode, setViewMode] = useState<DesignerViewMode>("work");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loadDesignerDashboard() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/mercury/designer-dashboard", {
        cache: "no-store",
      });

      const json = await response.json();

      if (!response.ok || !json.ok) {
        throw new Error(json.error || "No se pudo cargar Designer Hub.");
      }

      setData(json);

      if (!selectedBrandSlug && json.brands?.[0]?.brandSlug) {
        setSelectedBrandSlug(json.brands[0].brandSlug);
      }
    } catch (err: any) {
      setError(err?.message || "No se pudo cargar Designer Hub.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDesignerDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const brands = data?.brands || [];

  const selectedBrand = useMemo(() => {
    if (!brands.length) return null;

    return (
      brands.find((brand) => brand.brandSlug === selectedBrandSlug) ||
      brands[0] ||
      null
    );
  }, [brands, selectedBrandSlug]);

  const visibleItems = useMemo(() => {
    const items = selectedBrand?.items || [];
    const cleanQuery = query.trim().toLowerCase();

    if (!cleanQuery) return items;

    return items.filter((item) => {
      const text = [
        item.title,
        item.brief,
        item.copy_base,
        item.visual_direction,
        item.content_type,
        item.status,
        item.platform,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(cleanQuery);
    });
  }, [selectedBrand, query]);

  const pendingItems = visibleItems.filter((item) =>
    ["generated", "assigned", "in_design", "changes_requested"].includes(
      item.status
    )
  );

  const reviewItems = visibleItems.filter((item) =>
    ["design_uploaded", "internal_review"].includes(item.status)
  );

  const approvedItems = visibleItems.filter((item) =>
    ["approved_internal", "approved_client", "scheduled", "published"].includes(
      item.status
    )
  );

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f3f8fb] text-slate-950">
      <div className="flex min-h-screen">
        <DesignerSidebar
          brands={brands}
          selectedBrand={selectedBrand}
          selectedBrandSlug={selectedBrandSlug}
          setSelectedBrandSlug={setSelectedBrandSlug}
          loading={loading}
        />

        <section className="min-w-0 flex-1">
          <DesignerTopbar
            query={query}
            setQuery={setQuery}
            loading={loading}
            onReload={loadDesignerDashboard}
          />

          <div className="mx-auto w-full max-w-[1680px] px-5 py-6 lg:px-8">
            {error ? (
              <div className="mb-6 rounded-[24px] border border-red-200 bg-red-50 p-5 text-sm font-black text-red-700">
                {error}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
              <SummaryCard
                label="Marcas asignadas"
                value={String(data?.summary?.totalBrands ?? 0)}
                note="activas"
                icon="🏷️"
              />
              <SummaryCard
                label="Total de piezas"
                value={String(data?.summary?.totalItems ?? 0)}
                note="del ciclo activo"
                icon="▦"
              />
              <SummaryCard
                label="Pendientes diseño"
                value={String(data?.summary?.pendingDesign ?? 0)}
                note="por diseñar"
                icon="🎨"
              />
              <SummaryCard
                label="En diseño"
                value={String(data?.summary?.inDesign ?? 0)}
                note="en proceso"
                icon="✎"
              />
              <SummaryCard
                label="Cambios solicitados"
                value={String(data?.summary?.changesRequested ?? 0)}
                note="requieren ajuste"
                icon="●"
              />
              <SummaryCard
                label="Hoy"
                value={String(data?.summary?.dueToday ?? 0)}
                note="entregas"
                icon="⏰"
              />
            </div>

            <div className="mt-6 min-w-0 space-y-6">
  <SelectedBrandHero brand={selectedBrand} loading={loading} />

  <DesignerUtilityGrid
    brand={selectedBrand}
    items={visibleItems}
    onOpenItem={setSelectedItem}
  />

  <DesignerTabs viewMode={viewMode} setViewMode={setViewMode} />

  {viewMode === "work" ? (
    <div className="grid gap-5 xl:grid-cols-3">
      <TaskColumn
        title="Por diseñar"
        icon="🎨"
        items={pendingItems}
        empty="No hay piezas pendientes."
        onOpenItem={setSelectedItem}
      />

      <TaskColumn
        title="En revisión"
        icon="🔍"
        items={reviewItems}
        empty="No hay piezas en revisión."
        onOpenItem={setSelectedItem}
      />

      <TaskColumn
        title="Listas / programadas"
        icon="✅"
        items={approvedItems}
        empty="No hay piezas listas todavía."
        onOpenItem={setSelectedItem}
      />
    </div>
  ) : null}

  {viewMode === "calendar" ? (
    <CalendarSection items={visibleItems} onOpenItem={setSelectedItem} />
  ) : null}

  {viewMode === "list" ? (
    <ListSection items={visibleItems} onOpenItem={setSelectedItem} />
  ) : null}

  {viewMode === "load" ? (
    <LoadSection brand={selectedBrand} items={visibleItems} />
  ) : null}
</div>
          </div>
        </section>
      </div>

      {selectedItem ? (
        <DesignerTaskModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onUpdated={async () => {
            await loadDesignerDashboard();
          }}
        />
      ) : null}
    </main>
  );
}

function DesignerSidebar({
  brands,
  selectedBrand,
  selectedBrandSlug,
  setSelectedBrandSlug,
  loading,
}: {
  brands: DesignerBrand[];
  selectedBrand: DesignerBrand | null;
  selectedBrandSlug: string | null;
  setSelectedBrandSlug: (value: string) => void;
  loading: boolean;
}) {
  const visibleSidebarItems = [
    { label: "Inicio", icon: "⌂", badge: null },
    { label: "Marcas", icon: "▦", badge: brands.length ? String(brands.length) : null },
    { label: "Piezas", icon: "◉", badge: null },
    { label: "Calendario", icon: "▣", badge: null },
    { label: "Cambios", icon: "↻", badge: null },
    { label: "Entregas", icon: "☑", badge: null },
    { label: "Biblioteca", icon: "◫", badge: null },
  ];

  return (
    <aside className="hidden w-[260px] shrink-0 border-r border-white/10 bg-[#020818] text-white shadow-[20px_0_90px_rgba(2,8,24,0.22)] xl:block">
      <div className="sticky top-0 flex h-screen flex-col overflow-hidden px-4 py-5">
        <Link href="/designer-hub" className="flex items-center gap-3 px-1">
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-white">
            <Image
              src="/logo.png"
              alt="Cometa OS"
              width={44}
              height={44}
              className="h-full w-full object-contain p-1"
              priority
            />
          </div>

          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-cyan-300">
              Cometa OS
            </p>
            <p className="truncate text-lg font-black tracking-[0.08em] text-white">
              MERCURY
            </p>
          </div>
        </Link>

        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">
            Workspace
          </p>

          <button className="mt-3 flex w-full items-center justify-between gap-3 text-left">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-300 text-sm font-black text-slate-950">
                {selectedBrand ? getBrandName(selectedBrand).slice(0, 1) : "C"}
              </div>

              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white">
                  {selectedBrand ? getBrandName(selectedBrand) : "Workspace"}
                </p>
                <p className="mt-0.5 text-[10px] font-bold text-slate-500">
                  Marca activa
                </p>
              </div>
            </div>

            <span className="text-slate-500">⌄</span>
          </button>
        </div>

        <nav className="mt-5 space-y-1">
          {visibleSidebarItems.map((item, index) => (
            <button
              key={item.label}
              className={`flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm font-bold transition ${
                index === 0
                  ? "bg-cyan-300/10 text-cyan-200"
                  : "text-slate-300 hover:bg-white/[0.05] hover:text-white"
              }`}
            >
              <span className="flex items-center gap-3">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-xl text-xs ${
                    index === 0 ? "bg-cyan-300/10" : "bg-white/[0.04]"
                  }`}
                >
                  {item.icon}
                </span>
                {item.label}
              </span>

              {item.badge ? (
                <span className="rounded-full bg-cyan-400 px-2 py-0.5 text-[10px] font-black text-slate-950">
                  {item.badge}
                </span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">
              Marcas rápidas
            </p>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black text-cyan-200">
              {brands.length}
            </span>
          </div>

          <div className="grid max-h-[190px] gap-2 overflow-y-auto pr-1">
            {loading ? (
              <p className="rounded-xl bg-white/[0.04] px-3 py-3 text-xs font-bold text-slate-500">
                Cargando...
              </p>
            ) : brands.length === 0 ? (
              <p className="rounded-xl bg-white/[0.04] px-3 py-3 text-xs font-bold text-slate-500">
                Sin marcas asignadas.
              </p>
            ) : (
              brands.map((brand) => {
                const active = selectedBrandSlug === brand.brandSlug;

                return (
                  <button
                    key={brand.brandSlug}
                    onClick={() => setSelectedBrandSlug(brand.brandSlug)}
                    className={`rounded-xl px-3 py-2.5 text-left transition ${
                      active
                        ? "bg-white text-slate-950"
                        : "bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
                    }`}
                  >
                    <p className="truncate text-xs font-black">
                      {getBrandName(brand)}
                    </p>
                    <p
                      className={`mt-1 text-[10px] font-bold ${
                        active ? "text-slate-500" : "text-slate-500"
                      }`}
                    >
                      {brand.summary.pendingDesign} pendientes
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="mt-auto pt-5">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-100 text-sm font-black text-slate-950">
                D
              </div>

              <div>
                <p className="text-sm font-black text-white">Diseñador</p>
                <p className="text-xs font-bold text-slate-500">
                  Equipo Cometa
                </p>
              </div>
            </div>
          </div>

          <Link
            href="/mercury-hub"
            className="mt-3 flex items-center justify-between rounded-2xl px-3 py-3 text-sm font-bold text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
          >
            Ir a Mercury Hub
            <span>›</span>
          </Link>
        </div>
      </div>
    </aside>
  );
}

function DesignerTopbar({
  query,
  setQuery,
  loading,
  onReload,
}: {
  query: string;
  setQuery: (value: string) => void;
  loading: boolean;
  onReload: () => void;
}) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-5 px-5 py-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-700">
            Cometa OS / Mercury
          </p>
          <h1 className="mt-2 text-4xl font-black leading-[0.96] tracking-[-0.06em] md:text-5xl">
            Designer Hub
          </h1>
          <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
            Centraliza tu trabajo de diseño. Prioriza, diseña y entrega con
            claridad.
          </p>
        </div>

        <div className="flex flex-col gap-3 lg:w-[620px] lg:flex-row lg:items-center lg:justify-end">
          <label className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
            <span className="text-slate-400">⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar marcas, piezas, briefs..."
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-400"
            />
            <span className="rounded-lg bg-white px-2 py-1 text-[10px] font-black text-slate-400">
              ⌘ K
            </span>
          </label>

          <button className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-lg transition hover:bg-slate-50">
            🔔
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white">
              3
            </span>
          </button>

          <button
            onClick={onReload}
            disabled={loading}
            className="flex h-12 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "Actualizando..." : "Actualizar"}
          </button>
        </div>
      </div>
    </header>
  );
}

function SummaryCard({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: string;
}) {
  return (
    <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_70px_rgba(15,23,42,0.05)]">
      <div className="mb-4 flex items-center justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-50 text-lg">
          {icon}
        </span>
        <Link
          href="/mercury-hub"
          className="text-[10px] font-black text-cyan-700"
        >
          Ver →
        </Link>
      </div>

      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>

      <p className="mt-2 text-4xl font-black tracking-[-0.06em] text-slate-950">
        {value}
      </p>

      <p className="mt-1 text-xs font-bold text-slate-500">{note}</p>
    </article>
  );
}

function SelectedBrandHero({
  brand,
  loading,
}: {
  brand: DesignerBrand | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
        <EmptyState message="Cargando marca..." />
      </section>
    );
  }

  if (!brand) {
    return (
      <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
        <EmptyState message="Selecciona una marca para comenzar." />
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[34px] border border-slate-200 bg-white p-4 shadow-[0_24px_90px_rgba(15,23,42,0.06)]">
      <div className="relative overflow-hidden rounded-[28px] bg-slate-950 p-6 text-white md:p-8">
        <div className="absolute right-0 top-0 h-full w-[45%] bg-[radial-gradient(circle_at_80%_30%,rgba(34,211,238,0.22),transparent_35%),radial-gradient(circle_at_90%_90%,rgba(99,102,241,0.20),transparent_42%)]" />

        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
              Marca seleccionada
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h2 className="text-4xl font-black leading-none tracking-[-0.06em] md:text-5xl">
                {getBrandName(brand)}
              </h2>

              <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-300">
                ● Activa
              </span>
            </div>

            <p className="mt-4 text-sm font-semibold leading-6 text-slate-400">
              Campaña:{" "}
              <span className="font-black text-white">
                {formatMonth(
                  brand.selectedCalendar?.cycle_month,
                  brand.selectedCalendar?.cycle_year
                )}
              </span>
            </p>

            <p className="text-sm font-semibold leading-6 text-slate-400">
              Ciclo de trabajo:{" "}
              <span className="font-black text-white">
                producción mensual activa
              </span>
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:w-[560px] xl:grid-cols-4">
            <HeroMiniStat
              label="Pendientes"
              value={brand.summary.pendingDesign}
              tone="cyan"
            />
            <HeroMiniStat
              label="En diseño"
              value={brand.summary.inDesign}
              tone="violet"
            />
            <HeroMiniStat
              label="Cambios"
              value={brand.summary.changesRequested}
              tone="orange"
            />
            <HeroMiniStat
              label="Semana"
              value={brand.summary.dueThisWeek}
              tone="green"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroMiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "cyan" | "violet" | "orange" | "green";
}) {
  const tones = {
    cyan: "text-cyan-300",
    violet: "text-violet-300",
    orange: "text-orange-300",
    green: "text-emerald-300",
  };

  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>
      <p className={`mt-2 text-3xl font-black tracking-[-0.06em] ${tones[tone]}`}>
        {value}
      </p>
    </article>
  );
}

function HeroLegend({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-xs font-bold text-slate-400">
      <span className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
        {label}
      </span>
      <span className="font-black text-white">{value}</span>
    </div>
  );
}

function PriorityRow({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3">
      <span className="flex items-center gap-2 text-xs font-black text-slate-300">
        <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
        {label}
      </span>
      <span className="text-sm font-black text-white">{value}</span>
    </div>
  );
}

function DesignerTabs({
  viewMode,
  setViewMode,
}: {
  viewMode: DesignerViewMode;
  setViewMode: (value: DesignerViewMode) => void;
}) {
  const tabs: { key: DesignerViewMode; label: string; icon: string }[] = [
    { key: "work", label: "Vista de trabajo", icon: "▦" },
    { key: "calendar", label: "Calendario", icon: "▣" },
    { key: "list", label: "Lista de piezas", icon: "☰" },
    { key: "load", label: "Carga por marca", icon: "▥" },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-white p-2 shadow-[0_14px_50px_rgba(15,23,42,0.04)] lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const active = viewMode === tab.key;

          return (
            <button
              key={tab.key}
              onClick={() => setViewMode(tab.key)}
              className={`rounded-2xl px-4 py-3 text-xs font-black transition ${
                active
                  ? "bg-cyan-50 text-cyan-700 shadow-sm"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-950"
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-600">
          Todas las marcas
        </button>
        <button className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-600">
          Este mes
        </button>
        <button className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-600">
          Filtro
        </button>
      </div>
    </div>
  );
}

function TaskColumn({
  title,
  icon,
  items,
  empty,
  onOpenItem,
}: {
  title: string;
  icon: string;
  items: any[];
  empty: string;
  onOpenItem: (item: any) => void;
}) {
  return (
    <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_18px_70px_rgba(15,23,42,0.05)]">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xl font-black tracking-[-0.04em] text-slate-950">
          {icon} {title}
        </p>
        <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-black text-cyan-700">
          {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <EmptyState message={empty} />
      ) : (
        <div className="grid gap-3">
          {items.slice(0, 8).map((item) => (
            <TaskCard key={item.id} item={item} onOpen={() => onOpenItem(item)} />
          ))}
        </div>
      )}

      {items.length > 8 ? (
        <button className="mt-4 text-xs font-black text-cyan-700">
          Ver todas ({items.length}) →
        </button>
      ) : null}
    </section>
  );
}

function TaskCard({ item, onOpen }: { item: any; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="group rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-white hover:shadow-[0_18px_50px_rgba(15,23,42,0.08)]"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          <span
            className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${getPriorityClass(
              item
            )}`}
          >
            {getPriorityLabel(item)}
          </span>

          <span
            className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${getTypeColor(
              item.content_type
            )}`}
          >
            {getTypeLabel(item.content_type)}
          </span>
        </div>

        <span className="text-slate-400 transition group-hover:text-slate-950">
          ⋮
        </span>
      </div>

      <p className="line-clamp-2 text-sm font-black leading-5 text-slate-950">
        {item.title || "Pieza sin título"}
      </p>

      <p className="mt-2 truncate text-xs font-bold text-slate-500">
        {item.platform || "Instagram"} · {item.assigned_role || "Diseño"}
      </p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span
          className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${getStatusColor(
            item.status
          )}`}
        >
          {getStatusLabel(item.status)}
        </span>

        <span className="text-[10px] font-black text-slate-400">
          Vence: {formatShortDate(item.due_date || item.publish_date)}
        </span>
      </div>
    </button>
  );
}

function DesignerUtilityGrid({
  brand,
  items,
  onOpenItem,
}: {
  brand: DesignerBrand | null;
  items: any[];
  onOpenItem: (item: any) => void;
}) {
  const importantDates = getImportantDates(brand);

  const todayItems = items.filter((item) => getTaskUrgency(item) === "today");
  const lateItems = items.filter((item) => getTaskUrgency(item) === "late");
  const soonItems = items.filter((item) => getTaskUrgency(item) === "soon");

  const nextItems = [...items]
    .filter((item) => item.due_date || item.publish_date)
    .sort((a, b) =>
      String(a.due_date || a.publish_date).localeCompare(
        String(b.due_date || b.publish_date)
      )
    )
    .slice(0, 4);

  return (
    <section className="grid gap-5 xl:grid-cols-[1fr_1.2fr_1fr]">
      <PanelCard title="Próximas entregas" action="Ver calendario">
        <div className="grid gap-3">
          <DeadlineRow label="Atrasadas" value={lateItems.length} color="bg-red-500" />
          <DeadlineRow label="Hoy" value={todayItems.length} color="bg-blue-500" />
          <DeadlineRow label="Esta semana" value={soonItems.length} color="bg-orange-400" />
          <DeadlineRow
            label="Próximas"
            value={Math.max(
              items.length - lateItems.length - todayItems.length - soonItems.length,
              0
            )}
            color="bg-emerald-400"
          />
        </div>
      </PanelCard>

      <PanelCard title="Fechas importantes del mes">
        <div className="grid gap-3">
          {importantDates.map((date) => (
            <div
              key={date.date}
              className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3"
            >
              <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-white">
                <span className="text-sm font-black text-slate-950">
                  {date.day}
                </span>
                <span className="text-[9px] font-black uppercase text-slate-400">
                  {date.month}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-black text-slate-950">
                  {date.title}
                </p>
                <p className="mt-1 truncate text-[10px] font-bold text-slate-500">
                  {date.note}
                </p>
              </div>

              <span
                className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-black uppercase ${date.className}`}
              >
                {date.priority}
              </span>
            </div>
          ))}
        </div>
      </PanelCard>

      <PanelCard title="Activos recientes">
        <div className="grid gap-2">
          {nextItems.length === 0 ? (
            <EmptyState message="Sin activos recientes." />
          ) : (
            nextItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onOpenItem(item)}
                className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-cyan-200 hover:bg-white"
              >
                <p className="truncate text-xs font-black text-slate-950">
                  {item.title || "Pieza sin título"}
                </p>
                <p className="mt-1 text-[10px] font-bold text-slate-500">
                  {getTypeLabel(item.content_type)} ·{" "}
                  {formatShortDate(item.publish_date || item.due_date)}
                </p>
              </button>
            ))
          )}
        </div>
      </PanelCard>
    </section>
  );
}

function PanelCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_16px_55px_rgba(15,23,42,0.045)]">
      <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-black text-slate-950">
          {title}
        </p>

        {action ? (
          <button className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-black text-slate-500">
            {action}
          </button>
        ) : null}
      </div>

      {children}
    </section>
  );
}

function DeadlineRow({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-xs font-bold text-slate-600">
        <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
        {label}
      </span>
      <span className="text-xs font-black text-slate-950">
        {value} entregas
      </span>
    </div>
  );
}

function QuickAction({ label, icon }: { label: string; icon: string }) {
  return (
    <button className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-black text-slate-600 transition hover:border-cyan-200 hover:bg-white hover:text-slate-950">
      {icon} {label}
    </button>
  );
}

function CalendarSection({
  items,
  onOpenItem,
}: {
  items: any[];
  onOpenItem: (item: any) => void;
}) {
  return (
    <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_18px_70px_rgba(15,23,42,0.05)]">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xl font-black tracking-[-0.04em] text-slate-950">
            Calendario de la marca
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500">
            Vista rápida de piezas por fecha de publicación.
          </p>
        </div>

        <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-black text-slate-500">
          {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <EmptyState message="No hay piezas para mostrar." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items
            .filter((item) => item.publish_date || item.due_date)
            .slice(0, 18)
            .map((item) => (
              <button
                key={item.id}
                onClick={() => onOpenItem(item)}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-cyan-200 hover:bg-white"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-xs font-black text-slate-400">
                    {formatShortDate(item.publish_date || item.due_date)}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${getUrgencyClass(
                      item
                    )}`}
                  >
                    {getUrgencyLabel(item)}
                  </span>
                </div>

                <p className="line-clamp-2 text-sm font-black leading-5 text-slate-950">
                  {item.title || "Pieza sin título"}
                </p>

                <div className="mt-3 flex flex-wrap gap-1">
                  <span
                    className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${getTypeColor(
                      item.content_type
                    )}`}
                  >
                    {getTypeLabel(item.content_type)}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${getStatusColor(
                      item.status
                    )}`}
                  >
                    {getStatusLabel(item.status)}
                  </span>
                </div>
              </button>
            ))}
        </div>
      )}
    </section>
  );
}

function ListSection({
  items,
  onOpenItem,
}: {
  items: any[];
  onOpenItem: (item: any) => void;
}) {
  return (
    <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_18px_70px_rgba(15,23,42,0.05)]">
      <div className="mb-5">
        <p className="text-xl font-black tracking-[-0.04em] text-slate-950">
          Lista de piezas
        </p>
        <p className="mt-1 text-xs font-bold text-slate-500">
          Vista completa para revisar producción, estatus y fechas.
        </p>
      </div>

      <div className="grid gap-3">
        {items.length === 0 ? (
          <EmptyState message="No hay piezas para mostrar." />
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              onClick={() => onOpenItem(item)}
              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-cyan-200 hover:bg-white md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-950">
                  {item.title || "Pieza sin título"}
                </p>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {formatShortDate(item.due_date || item.publish_date)} ·{" "}
                  {item.platform || "Instagram"}
                </p>
              </div>

              <div className="flex flex-wrap gap-1">
                <span
                  className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${getTypeColor(
                    item.content_type
                  )}`}
                >
                  {getTypeLabel(item.content_type)}
                </span>
                <span
                  className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${getStatusColor(
                    item.status
                  )}`}
                >
                  {getStatusLabel(item.status)}
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

function LoadSection({
  brand,
  items,
}: {
  brand: DesignerBrand | null;
  items: any[];
}) {
  const byType = items.reduce<Record<string, number>>((acc, item) => {
    const type = item.content_type || "other";
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  return (
    <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_18px_70px_rgba(15,23,42,0.05)]">
      <div className="mb-5">
        <p className="text-xl font-black tracking-[-0.04em] text-slate-950">
          Carga por marca
        </p>
        <p className="mt-1 text-xs font-bold text-slate-500">
          Resumen operativo de formatos y presión creativa.
        </p>
      </div>

      {!brand ? (
        <EmptyState message="Selecciona una marca para ver carga." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Object.entries(byType).map(([type, count]) => (
            <div
              key={type}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
            >
              <span
                className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${getTypeColor(
                  type
                )}`}
              >
                {getTypeLabel(type)}
              </span>
              <p className="mt-4 text-4xl font-black tracking-[-0.06em] text-slate-950">
                {count}
              </p>
              <p className="mt-1 text-xs font-bold text-slate-500">
                piezas del ciclo
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DesignerTaskModal({
  item,
  onClose,
  onUpdated,
}: {
  item: any;
  onClose: () => void;
  onUpdated: () => Promise<void>;
}) {
  const [assets, setAssets] = useState<MercuryAsset[]>([]);
  const [pieceComments, setPieceComments] = useState<any[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingAsset, setSavingAsset] = useState(false);
  const [savingComment, setSavingComment] = useState(false);
  const [assetUrl, setAssetUrl] = useState("");
  const [assetName, setAssetName] = useState("");
  const [assetType, setAssetType] = useState("design_preview");
  const [assetNotes, setAssetNotes] = useState("");
  const [newCommentText, setNewCommentText] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loadAssets() {
    setLoadingAssets(true);

    try {
      const response = await fetch(
        `/api/mercury/assets/list?contentItemId=${encodeURIComponent(item.id)}`,
        {
          cache: "no-store",
        }
      );

      const json = await response.json();

      if (!response.ok || !json.ok) {
        throw new Error(json.error || "No se pudieron cargar los links.");
      }

      setAssets(json.assets || []);
    } catch (err: any) {
      setError(err?.message || "No se pudieron cargar los links.");
    } finally {
      setLoadingAssets(false);
    }
  }

  async function loadComments() {
    setLoadingComments(true);

    try {
      const response = await fetch(
        `/api/mercury/piece-comments?pieceId=${encodeURIComponent(item.id)}`,
        {
          cache: "no-store",
        }
      );

      const json = await response.json();

      if (!response.ok || !json.ok) {
        throw new Error(json.error || "No se pudieron cargar los comentarios.");
      }

      setPieceComments(json.comments || []);
    } catch (err: any) {
      setError(err?.message || "No se pudieron cargar los comentarios.");
    } finally {
      setLoadingComments(false);
    }
  }

  async function saveAssetLink() {
    setError(null);

    if (!assetUrl.trim()) {
      setError("Pega un link antes de guardar.");
      return;
    }

    setSavingAsset(true);

    try {
      await postAssetLink({
        contentItemId: item.id,
        assetName: assetName || "Link de diseño",
        assetType,
        assetUrl,
        notes: assetNotes,
      });

      setAssetName("");
      setAssetType("design_preview");
      setAssetUrl("");
      setAssetNotes("");

      await loadAssets();
    } catch (err: any) {
      setError(err?.message || "No se pudo guardar el link.");
    } finally {
      setSavingAsset(false);
    }
  }

  async function saveComment() {
    const cleanText = newCommentText.trim();

    if (!cleanText) {
      setError("Escribe un comentario antes de guardarlo.");
      return;
    }

    setSavingComment(true);
    setError(null);

    try {
      const response = await fetch("/api/mercury/piece-comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pieceId: item.id,
          commentText: cleanText,
          authorName: "Diseño",
          authorRole: "Diseñador",
          source: "designer_hub",
        }),
      });

      const json = await response.json();

      if (!response.ok || !json.ok) {
        throw new Error(json.error || "No se pudo guardar el comentario.");
      }

      setNewCommentText("");
      setPieceComments((current) => [...current, json.comment]);
    } catch (err: any) {
      setError(err?.message || "No se pudo guardar el comentario.");
    } finally {
      setSavingComment(false);
    }
  }

  async function updateStatus(status: string, comment: string) {
    setSavingStatus(true);
    setError(null);

    try {
      const response = await fetch("/api/mercury/content-item/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentItemId: item.id,
          status,
          comment,
          isPrivateComment: true,
        }),
      });

      const json = await response.json();

      if (!response.ok || !json.ok) {
        throw new Error(json.error || "No se pudo actualizar el estado.");
      }

      await onUpdated();
      onClose();
    } catch (err: any) {
      setError(err?.message || "No se pudo actualizar el estado.");
    } finally {
      setSavingStatus(false);
    }
  }

  useEffect(() => {
    loadAssets();
    loadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm md:items-center md:p-6">
      <section className="flex max-h-[96vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-t-[34px] bg-white shadow-[0_40px_140px_rgba(15,23,42,0.35)] md:rounded-[34px]">
        <header className="border-b border-slate-200 bg-white p-5 md:p-6">
          <div className="flex items-start justify-between gap-5">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap gap-2">
                <span
                  className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${getTypeColor(
                    item.content_type
                  )}`}
                >
                  {getTypeLabel(item.content_type)}
                </span>
                <span
                  className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${getStatusColor(
                    item.status
                  )}`}
                >
                  {getStatusLabel(item.status)}
                </span>
                <span
                  className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${getUrgencyClass(
                    item
                  )}`}
                >
                  {getUrgencyLabel(item)}
                </span>
              </div>

              <h2 className="text-3xl font-black leading-[0.98] tracking-[-0.06em] text-slate-950 md:text-4xl">
                {item.title || "Detalle de pieza"}
              </h2>

              <p className="mt-3 text-sm font-semibold text-slate-500">
                Entrega: {formatDate(item.due_date)} · Publicación:{" "}
                {formatDate(item.publish_date)}
              </p>
            </div>

            <button
              onClick={onClose}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-xl font-black text-slate-500 transition hover:bg-slate-50 hover:text-slate-950"
            >
              ×
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#f3f8fb] p-5 md:p-6">
          {error ? (
            <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-black text-red-700">
              {error}
            </div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section className="space-y-5">
              <ReadOnlyBlock label="Brief para producción" value={item.brief} />
              <ReadOnlyBlock label="Copy base" value={item.copy_base} />
              <ReadOnlyBlock
                label="Dirección visual"
                value={item.visual_direction}
              />
              <ReadOnlyBlock
                label="Notas de referencia"
                value={item.reference_notes}
              />
              <ReadOnlyBlock
                label="Notas internas Cometa"
                value={item.private_notes}
              />
            </section>

            <aside className="space-y-5">
              <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_70px_rgba(15,23,42,0.05)]">
                <p className="text-sm font-black text-slate-950">
                  Subir link de diseño
                </p>
                <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                  Pega aquí el link de Drive, Canva, Figma o preview.
                </p>

                <div className="mt-4 grid gap-3">
                  <input
                    value={assetName}
                    onChange={(event) => setAssetName(event.target.value)}
                    placeholder="Nombre del link"
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold outline-none focus:border-cyan-300 focus:bg-white"
                  />

                  <select
                    value={assetType}
                    onChange={(event) => setAssetType(event.target.value)}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black outline-none focus:border-cyan-300 focus:bg-white"
                  >
                    <option value="design_preview">Preview diseño</option>
                    <option value="final_design">Diseño final</option>
                    <option value="editable_file">Editable</option>
                    <option value="reference">Referencia</option>
                  </select>

                  <input
                    value={assetUrl}
                    onChange={(event) => setAssetUrl(event.target.value)}
                    placeholder="Pega aquí el link"
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold outline-none focus:border-cyan-300 focus:bg-white"
                  />

                  <textarea
                    value={assetNotes}
                    onChange={(event) => setAssetNotes(event.target.value)}
                    placeholder="Notas del link"
                    rows={3}
                    className="resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold outline-none focus:border-cyan-300 focus:bg-white"
                  />

                  <button
                    onClick={saveAssetLink}
                    disabled={savingAsset}
                    className="h-12 rounded-2xl bg-slate-950 px-4 text-xs font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {savingAsset ? "Guardando..." : "Guardar link"}
                  </button>
                </div>
              </section>

              <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_70px_rgba(15,23,42,0.05)]">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm font-black text-slate-950">
                    Links guardados
                  </p>
                  <span className="rounded-full bg-cyan-50 px-2 py-1 text-[10px] font-black text-cyan-700">
                    {assets.length}
                  </span>
                </div>

                {loadingAssets ? (
                  <EmptyState message="Cargando links..." />
                ) : assets.length === 0 ? (
                  <EmptyState message="Todavía no hay links." />
                ) : (
                  <div className="grid gap-3">
                    {assets.map((asset) => (
                      <AssetMiniCard key={asset.id} asset={asset} />
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_70px_rgba(15,23,42,0.05)]">
                <p className="text-sm font-black text-slate-950">
                  Comentarios
                </p>

                <div className="mt-4 grid gap-3">
                  <textarea
                    value={newCommentText}
                    onChange={(event) => setNewCommentText(event.target.value)}
                    placeholder="Escribe una duda, avance o comentario..."
                    rows={3}
                    className="resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold outline-none focus:border-cyan-300 focus:bg-white"
                  />

                  <button
                    onClick={saveComment}
                    disabled={savingComment}
                    className="h-12 rounded-2xl bg-slate-950 px-4 text-xs font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {savingComment ? "Guardando..." : "Agregar comentario"}
                  </button>
                </div>

                <div className="mt-5 grid gap-3">
                  {loadingComments ? (
                    <EmptyState message="Cargando comentarios..." />
                  ) : pieceComments.length === 0 ? (
                    <EmptyState message="Todavía no hay comentarios." />
                  ) : (
                    pieceComments.map((comment) => (
                      <div
                        key={comment.id}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                      >
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <p className="text-xs font-black text-slate-700">
                            {comment.author_name ||
                              comment.author_role ||
                              "Comentario"}
                          </p>
                          {comment.created_at ? (
                            <p className="text-[10px] font-bold text-slate-400">
                              {new Date(comment.created_at).toLocaleString(
                                "es-MX"
                              )}
                            </p>
                          ) : null}
                        </div>
                        <p className="text-xs font-semibold leading-5 text-slate-600">
                          {comment.comment_text ||
                            comment.comment ||
                            comment.text}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_70px_rgba(15,23,42,0.05)]">
                <p className="text-sm font-black text-slate-950">
                  Cambiar estado
                </p>

                <div className="mt-4 grid gap-3">
                  <button
                    disabled={savingStatus}
                    onClick={() =>
                      updateStatus(
                        "in_design",
                        "El diseñador inició la pieza desde Designer Hub."
                      )
                    }
                    className="h-12 rounded-2xl bg-slate-950 px-4 text-xs font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {savingStatus ? "Actualizando..." : "Iniciar diseño"}
                  </button>

                  <button
                    disabled={savingStatus}
                    onClick={() =>
                      updateStatus(
                        "design_uploaded",
                        "El diseñador subió el diseño desde Designer Hub."
                      )
                    }
                    className="h-12 rounded-2xl bg-emerald-50 px-4 text-xs font-black text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                  >
                    Diseño subido
                  </button>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}

function ReadOnlyBlock({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)]">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-700">
        {value || "Sin información todavía."}
      </p>
    </section>
  );
}

function AssetMiniCard({ asset }: { asset: MercuryAsset }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-black text-slate-950">
            {asset.asset_name || "Link de asset"}
          </p>

          <div className="mt-2 flex flex-wrap gap-1">
            <span className="rounded-full border border-cyan-100 bg-cyan-50 px-2 py-1 text-[9px] font-black uppercase text-cyan-700">
              {getAssetTypeLabel(asset.asset_type)}
            </span>

            <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[9px] font-black uppercase text-slate-500">
              {getProviderLabel(asset.provider)}
            </span>
          </div>
        </div>

        {asset.asset_url ? (
          <a
            href={asset.asset_url}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-xl bg-slate-950 px-3 py-2 text-[10px] font-black text-white transition hover:bg-slate-800"
          >
            Abrir
          </a>
        ) : null}
      </div>

      {asset.notes ? (
        <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">
          {asset.notes}
        </p>
      ) : null}
    </article>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
      <p className="text-sm font-black text-slate-400">{message}</p>
    </div>
  );
}