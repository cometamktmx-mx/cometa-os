"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type MercuryDashboardData = {
  ok: boolean;
  brandSlug: string;
  settings: any | null;
  calendars: any[];
  selectedCalendar: any | null;
  items: any[];
  recentRuns: any[];
  summary: {
    totalItems: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    pendingItems: number;
    approvedItems: number;
  };
};

type StatusChangePayload = {
  itemId: string;
  status: string;
  comment?: string;
};

type DetailUpdatePayload = {
  itemId: string;
  title?: string;
  objective?: string | null;
  brief?: string | null;
  copyBase?: string | null;
  cta?: string | null;
  visualDirection?: string | null;
  referenceNotes?: string | null;
  privateNotes?: string | null;
  clientNotes?: string | null;
  dueDate?: string | null;
  publishDate?: string | null;
  comment?: string | null;
};

type MercuryAsset = {
  id: string;
  content_item_id: string;
  brand_name?: string | null;
  brand_slug?: string | null;
  asset_name?: string | null;
  asset_type?: string | null;
  asset_url?: string | null;
  asset_status?: string | null;
  notes?: string | null;
  provider?: string | null;
  uploaded_by_role?: string | null;
  created_at?: string | null;
};

type MercurySectionKey =
  | "resumen"
  | "calendario"
  | "produccion"
  | "disenadores"
  | "aprobaciones"
  | "entregas"
  | "reportes"
  | "configuracion"
  | "automatizaciones"
  | "integraciones"
  | "historial";

type SidebarLinkItem = {
  key: MercurySectionKey;
  label: string;
  icon: string;
};

const statusLabels: Record<string, string> = {
  generated: "Brief listo",
  internal_review: "Revisión interna",
  assigned: "Asignado",
  in_design: "En diseño",
  design_uploaded: "Diseño subido",
  changes_requested: "Cambios",
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

const statusColors: Record<string, string> = {
  generated: "bg-cyan-50 text-cyan-700 border-cyan-100",
  internal_review: "bg-violet-50 text-violet-700 border-violet-100",
  assigned: "bg-blue-50 text-blue-700 border-blue-100",
  in_design: "bg-amber-50 text-amber-700 border-amber-100",
  design_uploaded: "bg-emerald-50 text-emerald-700 border-emerald-100",
  changes_requested: "bg-orange-50 text-orange-700 border-orange-100",
  approved_internal: "bg-emerald-50 text-emerald-700 border-emerald-100",
  sent_to_client: "bg-slate-50 text-slate-700 border-slate-100",
  approved_client: "bg-emerald-50 text-emerald-700 border-emerald-100",
  scheduled: "bg-blue-50 text-blue-700 border-blue-100",
  published: "bg-slate-950 text-white border-slate-950",
  analyzed: "bg-cyan-50 text-cyan-700 border-cyan-100",
  cancelled: "bg-red-50 text-red-700 border-red-100",
};

const pipelineColumns = [
  {
    key: "generated",
    title: "Brief listo",
    icon: "📝",
  },
  {
    key: "in_design",
    title: "Diseño",
    icon: "🎨",
  },
  {
    key: "internal_review",
    title: "Revisión",
    icon: "🔍",
  },
  {
    key: "approved_internal",
    title: "Aprobado",
    icon: "✅",
  },
  {
    key: "scheduled",
    title: "Programado",
    icon: "📅",
  },
];

const teamMembers = [
  {
    name: "Diseñador principal",
    role: "Diseño gráfico",
    initials: "DP",
    load: 82,
  },
  {
    name: "Reels / video",
    role: "Producción audiovisual",
    initials: "RV",
    load: 68,
  },
  {
    name: "Community manager",
    role: "Historias y programación",
    initials: "CM",
    load: 54,
  },
];

function formatDate(value?: string | null) {
  if (!value) return "Sin fecha";

  const date = new Date(`${value}T12:00:00`);

  return date.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
  });
}

function formatFullDate(value?: string | null) {
  if (!value) return "Sin fecha";

  const date = new Date(`${value}T12:00:00`);

  return date.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMonth(month?: number, year?: number) {
  if (!month || !year) return "Calendario";

  const date = new Date(year, month - 1, 1);

  return date.toLocaleDateString("es-MX", {
    month: "long",
    year: "numeric",
  });
}

function getStatusLabel(status?: string) {
  return statusLabels[status || ""] || status || "Sin estado";
}

function getTypeLabel(type?: string) {
  return typeLabels[type || ""] || type || "Pieza";
}

function getAssetTypeLabel(type?: string | null) {
  return assetTypeLabels[type || ""] || type || "Asset";
}

function getProviderLabel(provider?: string | null) {
  return providerLabels[provider || ""] || provider || "Externo";
}

function getTypeColor(type?: string) {
  return typeColors[type || ""] || typeColors.other;
}

function getStatusColor(status?: string) {
  return statusColors[status || ""] || statusColors.generated;
}

function getInitials(value?: string | null) {
  if (!value) return "AI";

  return value
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getQuickActions(status?: string) {
  const current = status || "generated";

  if (current === "generated" || current === "assigned") {
    return [
      {
        label: "Iniciar diseño",
        status: "in_design",
        comment: "La pieza pasó a diseño.",
        className: "bg-slate-950 text-white hover:bg-slate-800",
      },
      {
        label: "Enviar a revisión",
        status: "internal_review",
        comment: "La pieza pasó a revisión interna.",
        className: "bg-cyan-50 text-cyan-700 hover:bg-cyan-100",
      },
    ];
  }

  if (current === "in_design") {
    return [
      {
        label: "Diseño subido",
        status: "design_uploaded",
        comment: "El diseño fue subido para revisión.",
        className: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
      },
      {
        label: "Pedir cambios",
        status: "changes_requested",
        comment: "Se solicitaron cambios en la pieza.",
        className: "bg-orange-50 text-orange-700 hover:bg-orange-100",
      },
    ];
  }

  if (
    current === "design_uploaded" ||
    current === "internal_review" ||
    current === "changes_requested"
  ) {
    return [
      {
        label: "Aprobar Cometa",
        status: "approved_internal",
        comment: "La pieza fue aprobada internamente por Cometa.",
        className: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
      },
      {
        label: "Pedir cambios",
        status: "changes_requested",
        comment: "La pieza requiere ajustes antes de aprobarse.",
        className: "bg-orange-50 text-orange-700 hover:bg-orange-100",
      },
    ];
  }

  if (
    current === "approved_internal" ||
    current === "sent_to_client" ||
    current === "approved_client"
  ) {
    return [
      {
        label: "Programar",
        status: "scheduled",
        comment: "La pieza quedó programada para publicación.",
        className: "bg-blue-50 text-blue-700 hover:bg-blue-100",
      },
      {
        label: "Publicado",
        status: "published",
        comment: "La pieza fue marcada como publicada.",
        className: "bg-slate-950 text-white hover:bg-slate-800",
      },
    ];
  }

  if (current === "scheduled") {
    return [
      {
        label: "Publicado",
        status: "published",
        comment: "La pieza fue marcada como publicada.",
        className: "bg-slate-950 text-white hover:bg-slate-800",
      },
    ];
  }

  if (current === "published") {
    return [
      {
        label: "Analizado",
        status: "analyzed",
        comment: "La pieza fue marcada como analizada.",
        className: "bg-cyan-50 text-cyan-700 hover:bg-cyan-100",
      },
    ];
  }

  return [];
}

export default function MercuryHubPage() {
  const [brandSlug, setBrandSlug] = useState("cometa-mkt");
  const [data, setData] = useState<MercuryDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [savingDetail, setSavingDetail] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [activeSection, setActiveSection] =
    useState<MercurySectionKey>("resumen");
  const [error, setError] = useState<string | null>(null);

  async function loadDashboard(nextBrandSlug = brandSlug) {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/mercury/dashboard?brandSlug=${encodeURIComponent(nextBrandSlug)}`,
        {
          cache: "no-store",
        }
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Error ${response.status}`);
      }

      const json = (await response.json()) as MercuryDashboardData;
      setData(json);
    } catch (err: any) {
      setError(err?.message || "No se pudo cargar MERCURY.");
    } finally {
      setLoading(false);
    }
  }

  async function generateCalendar() {
    const ok = window.confirm(
      "¿Quieres regenerar el calendario? Esto reemplazará las piezas actuales del ciclo activo."
    );

    if (!ok) return;

    setGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/mercury/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          brandName: data?.settings?.brand_name || "Cometa MKT",
          forceRegenerate: true,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Error ${response.status}`);
      }

      await loadDashboard();
    } catch (err: any) {
      setError(err?.message || "No se pudo generar el calendario.");
    } finally {
      setGenerating(false);
    }
  }

  async function updateItemStatus({
    itemId,
    status,
    comment,
  }: StatusChangePayload) {
    setError(null);
    setUpdatingItemId(itemId);

    try {
      const response = await fetch("/api/mercury/content-item/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentItemId: itemId,
          status,
          comment:
            comment ||
            `MERCURY Hub actualizó el estatus de la pieza a: ${status}`,
          isPrivateComment: true,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Error ${response.status}`);
      }

      const json = await response.json();

      if (json?.item && selectedItem?.id === itemId) {
        setSelectedItem(json.item);
      }

      await loadDashboard();
    } catch (err: any) {
      setError(err?.message || "No se pudo actualizar la tarea.");
    } finally {
      setUpdatingItemId(null);
    }
  }

  async function updateItemDetails(payload: DetailUpdatePayload) {
    setError(null);
    setSavingDetail(true);

    try {
      const response = await fetch("/api/mercury/content-item/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentItemId: payload.itemId,
          title: payload.title,
          objective: payload.objective,
          brief: payload.brief,
          copyBase: payload.copyBase,
          cta: payload.cta,
          visualDirection: payload.visualDirection,
          referenceNotes: payload.referenceNotes,
          privateNotes: payload.privateNotes,
          clientNotes: payload.clientNotes,
          dueDate: payload.dueDate,
          publishDate: payload.publishDate,
          comment: payload.comment || "Se actualizaron detalles de la pieza.",
          isPrivateComment: true,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Error ${response.status}`);
      }

      const json = await response.json();

      if (json?.item) {
        setSelectedItem(json.item);
      }

      await loadDashboard();
    } catch (err: any) {
      setError(err?.message || "No se pudo guardar el detalle de la tarea.");
    } finally {
      setSavingDetail(false);
    }
  }

  useEffect(() => {
    loadDashboard("cometa-mkt");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSectionChange(section: MercurySectionKey) {
    setActiveSection(section);

    const sectionTargetMap: Record<MercurySectionKey, string> = {
      resumen: "resumen",
      calendario: "calendario",
      produccion: "produccion",
      disenadores: "disenadores",
      aprobaciones: "produccion",
      entregas: "produccion",
      reportes: "reportes",
      configuracion: "configuracion",
      automatizaciones: "automatizaciones",
      integraciones: "configuracion",
      historial: "historial",
    };

    const target = sectionTargetMap[section];
    const element = document.getElementById(`mercury-section-${target}`);

    if (element) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }

  const items = data?.items || [];

  const calendarTitle = useMemo(() => {
    return formatMonth(
      data?.selectedCalendar?.cycle_month,
      data?.selectedCalendar?.cycle_year
    );
  }, [data?.selectedCalendar]);

  const calendarDays = useMemo(() => {
    const selected = data?.selectedCalendar;

    if (!selected?.cycle_month || !selected?.cycle_year) return [];

    const year = Number(selected.cycle_year);
    const month = Number(selected.cycle_month);
    const daysInMonth = new Date(year, month, 0).getDate();

    return Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const date = new Date(year, month - 1, day);
      const key = date.toISOString().slice(0, 10);

      return {
        day,
        key,
        items: items.filter((item) => item.publish_date === key),
      };
    });
  }, [data?.selectedCalendar, items]);

  const pipeline = useMemo(() => {
    return pipelineColumns.map((column) => {
      let columnItems = items.filter((item) => item.status === column.key);

      if (column.key === "generated") {
        columnItems = items.filter((item) =>
          ["generated", "assigned"].includes(item.status)
        );
      }

      if (column.key === "internal_review") {
        columnItems = items.filter((item) =>
          ["internal_review", "design_uploaded", "changes_requested"].includes(
            item.status
          )
        );
      }

      if (column.key === "approved_internal") {
        columnItems = items.filter((item) =>
          ["approved_internal", "sent_to_client", "approved_client"].includes(
            item.status
          )
        );
      }

      if (column.key === "scheduled") {
        columnItems = items.filter((item) =>
          ["scheduled", "published", "analyzed"].includes(item.status)
        );
      }

      return {
        ...column,
        items: columnItems,
      };
    });
  }, [items]);

  const productionSummary = useMemo(() => {
    const byType = data?.summary?.byType || {};
    const total = data?.summary?.totalItems || 0;

    return Object.entries(byType).map(([type, count]) => ({
      type,
      count,
      percent: total > 0 ? Math.round((Number(count) / total) * 100) : 0,
    }));
  }, [data?.summary]);

  const nextPublish = useMemo(() => {
    const upcoming = items
      .filter((item) => item.publish_date)
      .sort((a, b) =>
        String(a.publish_date).localeCompare(String(b.publish_date))
      );

    return upcoming[0] || null;
  }, [items]);

  return (
    <main className="min-h-screen bg-[#f3f8fb] text-slate-950">
      <div className="flex min-h-screen">
        <Sidebar
          activeSection={activeSection}
          onSectionChange={handleSectionChange}
        />

        <section className="min-w-0 flex-1">
          <Topbar
            onGenerate={generateCalendar}
            generating={generating}
            loading={loading}
          />

          <div className="mx-auto w-full max-w-[1580px] px-5 py-6 lg:px-8">
            {error ? (
              <div className="mb-6 rounded-[24px] border border-red-200 bg-red-50 p-5 text-sm font-black text-red-700">
                {error}
              </div>
            ) : null}

            <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_390px]">
              <section className="min-w-0 space-y-6">
                <div id="mercury-section-resumen" className="scroll-mt-8">
                  <HeroPanel
                    data={data}
                    calendarTitle={calendarTitle}
                    loading={loading}
                  />
                </div>

                <div className="grid gap-6 xl:grid-cols-2">
                  <div id="mercury-section-calendario" className="scroll-mt-8">
                    <CalendarPanel
                      days={calendarDays}
                      calendarTitle={calendarTitle}
                      loading={loading}
                      onOpenItem={setSelectedItem}
                    />
                  </div>

                  <div id="mercury-section-produccion" className="scroll-mt-8">
                    <ProductionFlowPanel
                      pipeline={pipeline}
                      loading={loading}
                      updatingItemId={updatingItemId}
                      onOpenItem={setSelectedItem}
                      onStatusChange={updateItemStatus}
                    />
                  </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
                  <div id="mercury-section-disenadores" className="scroll-mt-8">
                    <TeamLoadPanel items={items} />
                  </div>

                  <div id="mercury-section-reportes" className="scroll-mt-8">
                    <ProductionSummaryPanel
                      total={data?.summary?.totalItems || 0}
                      productionSummary={productionSummary}
                    />
                  </div>
                </div>
              </section>

              <aside className="grid gap-6 md:grid-cols-2 2xl:block 2xl:space-y-6">
                <div
                  id="mercury-section-automatizaciones"
                  className="scroll-mt-8"
                >
                  <MercuryAiPanel
                    data={data}
                    nextPublish={nextPublish}
                    pending={data?.summary?.pendingItems || 0}
                  />
                </div>

                <div
                  id="mercury-section-configuracion"
                  className="scroll-mt-8"
                >
                  <CycleConfigPanel
                    data={data}
                    brandSlug={brandSlug}
                    setBrandSlug={setBrandSlug}
                    onLoad={() => loadDashboard(brandSlug)}
                  />
                </div>

                <div id="mercury-section-historial" className="scroll-mt-8">
                  <RecentRunsPanel runs={data?.recentRuns || []} />
                </div>
              </aside>
            </div>
          </div>
        </section>
      </div>

      {selectedItem ? (
        <TaskDetailModal
          key={selectedItem.id}
          item={selectedItem}
          saving={savingDetail}
          updating={updatingItemId === selectedItem.id}
          onClose={() => setSelectedItem(null)}
          onSave={updateItemDetails}
          onStatusChange={updateItemStatus}
        />
      ) : null}
    </main>
  );
}

/* ----------------------------- UI COMPONENTS ----------------------------- */

function Sidebar({
  activeSection,
  onSectionChange,
}: {
  activeSection: MercurySectionKey;
  onSectionChange: (section: MercurySectionKey) => void;
}) {
  const mainLinks: SidebarLinkItem[] = [
    { key: "resumen", label: "Resumen", icon: "▦" },
    { key: "calendario", label: "Calendario", icon: "📅" },
    { key: "produccion", label: "Producción", icon: "▣" },
    { key: "disenadores", label: "Diseñadores", icon: "👥" },
    { key: "aprobaciones", label: "Aprobaciones", icon: "✓" },
    { key: "entregas", label: "Entregas", icon: "📦" },
    { key: "reportes", label: "Reportes", icon: "📊" },
  ];

  const systemLinks: SidebarLinkItem[] = [
    { key: "configuracion", label: "Configuración", icon: "⚙️" },
    { key: "automatizaciones", label: "Automatizaciones", icon: "🔁" },
    { key: "integraciones", label: "Integraciones", icon: "🔌" },
    { key: "historial", label: "Historial", icon: "🕘" },
  ];

  return (
    <aside className="hidden w-[300px] shrink-0 border-r border-slate-200 bg-white p-5 shadow-[20px_0_80px_rgba(15,23,42,0.04)] xl:block">
      <Link
        href="/"
        className="flex items-center gap-3 rounded-[26px] border border-slate-200 bg-slate-50 p-4"
      >
        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm">
          <Image
            src="/logo.png"
            alt="Cometa OS"
            width={56}
            height={56}
            className="h-full w-full object-contain p-1"
            priority
          />
        </div>

        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-700">
            Cometa OS
          </p>
          <p className="mt-1 text-sm font-black text-slate-950">
            Mercury Hub
          </p>
        </div>
      </Link>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-3">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
          Workspace
        </p>

        <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-950 px-3 py-3 text-white">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-300 text-sm font-black text-slate-950">
              C
            </span>
            <div>
              <p className="text-sm font-black">Cometa MKT</p>
              <p className="text-[10px] font-bold text-slate-400">
                Marca activa
              </p>
            </div>
          </div>
          <span className="text-slate-500">⌄</span>
        </div>
      </div>

      <nav className="mt-6">
        <SidebarSection
          title="Principal"
          links={mainLinks}
          activeSection={activeSection}
          onSectionChange={onSectionChange}
        />

        <SidebarSection
          title="Sistema"
          links={systemLinks}
          activeSection={activeSection}
          onSectionChange={onSectionChange}
        />
      </nav>

      <button
        type="button"
        onClick={() => onSectionChange("automatizaciones")}
        className="mt-6 w-full rounded-[24px] border border-cyan-100 bg-cyan-50 p-4 text-left transition hover:border-cyan-200 hover:bg-cyan-100"
      >
        <p className="text-sm font-black text-slate-950">Mercury AI</p>
        <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">
          Calendarios, producción, responsables y aprendizaje mensual.
        </p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
          <div className="h-full w-[72%] rounded-full bg-cyan-400" />
        </div>
        <p className="mt-3 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-700">
          Sistema activo
        </p>
      </button>
    </aside>
  );
}

function SidebarSection({
  title,
  links,
  activeSection,
  onSectionChange,
}: {
  title: string;
  links: SidebarLinkItem[];
  activeSection: MercurySectionKey;
  onSectionChange: (section: MercurySectionKey) => void;
}) {
  return (
    <div className="mb-6">
      <p className="px-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
        {title}
      </p>

      <div className="mt-3 grid gap-1">
        {links.map((link) => {
          const isActive = activeSection === link.key;

          return (
            <button
              key={link.key}
              type="button"
              onClick={() => onSectionChange(link.key)}
              className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-black transition ${
                isActive
                  ? "bg-slate-950 text-white shadow-lg shadow-slate-950/10"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-950"
              }`}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-xl text-sm ${
                  isActive ? "bg-white/10" : "bg-slate-50"
                }`}
              >
                {link.icon}
              </span>
              {link.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Topbar({
  onGenerate,
  generating,
  loading,
}: {
  onGenerate: () => void;
  generating: boolean;
  loading: boolean;
}) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-[1580px] flex-col gap-5 px-5 py-7 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-700">
            Mercury Execution Hub
          </p>
          <h1 className="mt-2 max-w-4xl text-4xl font-black leading-[0.98] tracking-[-0.06em] md:text-5xl">
            Calendario, producción y flujo del contenido.
          </h1>
          <p className="mt-4 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
            MERCURY convierte estrategia en ejecución: calendario, tareas,
            diseñadores, aprobaciones y publicaciones.
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
          <button
            onClick={onGenerate}
            disabled={generating || loading}
            className="flex h-14 items-center justify-center rounded-2xl bg-cyan-300 px-7 text-sm font-black text-slate-950 shadow-lg shadow-cyan-400/20 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generating ? "Generando..." : "✦ Regenerar calendario"}
          </button>

          <button className="flex h-14 items-center justify-center rounded-2xl border border-slate-200 bg-white px-7 text-sm font-black text-slate-700 transition hover:bg-slate-50">
            👥 Ver equipo
          </button>
        </div>
      </div>
    </header>
  );
}

function HeroPanel({
  data,
  calendarTitle,
  loading,
}: {
  data: MercuryDashboardData | null;
  calendarTitle: string;
  loading: boolean;
}) {
  return (
    <section className="rounded-[34px] border border-slate-200 bg-white p-4 shadow-[0_24px_90px_rgba(15,23,42,0.06)]">
      <div className="rounded-[28px] bg-slate-950 p-6 text-white md:p-8">
        <div className="flex flex-col gap-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-5">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[28px] bg-white shadow-xl shadow-cyan-400/10">
                <Image
                  src="/logo.png"
                  alt="Cometa MKT"
                  width={96}
                  height={96}
                  className="h-full w-full object-contain p-2"
                  priority
                />
              </div>

              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">
                  Marca activa
                </p>
                <h2 className="mt-2 text-4xl font-black tracking-[-0.06em]">
                  {data?.settings?.brand_name || "Cometa MKT"}
                </h2>
                <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-400">
                  {loading
                    ? "Cargando operación de Mercury..."
                    : "MERCURY transforma estrategia mensual en calendario, briefs, producción y seguimiento operativo."}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-5 py-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200">
                Ciclo activo
              </p>
              <p className="mt-1 text-xl font-black capitalize text-white">
                {calendarTitle}
              </p>
              <p className="mt-1 text-xs font-bold uppercase text-slate-400">
                {data?.selectedCalendar?.status || "Sin calendario"}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <HeroMetric
              label="Piezas del mes"
              value={String(data?.summary?.totalItems ?? 0)}
              note="contenido generado"
              icon="▦"
            />
            <HeroMetric
              label="Pendientes"
              value={String(data?.summary?.pendingItems ?? 0)}
              note="por producir"
              icon="◉"
            />
            <HeroMetric
              label="En revisión"
              value={String(
                (data?.summary?.byStatus?.internal_review || 0) +
                  (data?.summary?.byStatus?.design_uploaded || 0) +
                  (data?.summary?.byStatus?.changes_requested || 0)
              )}
              note="requieren atención"
              icon="🔍"
            />
            <HeroMetric
              label="Aprobadas"
              value={String(data?.summary?.approvedItems ?? 0)}
              note="listas"
              icon="✓"
            />
            <HeroMetric
              label="Publicadas"
              value={String(data?.summary?.byStatus?.published || 0)}
              note="contenido en redes"
              icon="📅"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroMetric({
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
    <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
          {label}
        </p>
        <span className="text-cyan-300">{icon}</span>
      </div>
      <p className="text-3xl font-black tracking-[-0.05em] text-white">
        {value}
      </p>
      <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
        {note}
      </p>
    </article>
  );
}

/* ----------------------------- CORE PANELS ----------------------------- */

function CalendarPanel({
  days,
  calendarTitle,
  loading,
  onOpenItem,
}: {
  days: { day: number; key: string; items: any[] }[];
  calendarTitle: string;
  loading: boolean;
  onOpenItem: (item: any) => void;
}) {
  const visibleDays = days.slice(0, 35);

  return (
    <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_18px_70px_rgba(15,23,42,0.05)]">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-lg font-black text-slate-950">
            Calendario de contenido
          </p>
          <p className="mt-1 text-xs font-bold capitalize text-slate-500">
            {calendarTitle}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-black">
            ‹
          </button>
          <button className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-black">
            ›
          </button>
        </div>
      </div>

      {loading ? (
        <EmptyMini message="Cargando calendario..." />
      ) : visibleDays.length === 0 ? (
        <EmptyMini message="Todavía no hay calendario generado." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid grid-cols-7">
            {["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"].map((day) => (
              <div
                key={day}
                className="border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-center text-[9px] font-black uppercase tracking-[0.08em] text-slate-500 last:border-r-0"
              >
                {day}
              </div>
            ))}

            {visibleDays.map((day) => (
              <div
                key={day.key}
                className="min-h-[92px] border-r border-t border-slate-200 bg-white p-2 last:border-r-0"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-400">
                    {day.day}
                  </span>
                  {day.items.length > 0 ? (
                    <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[9px] font-black text-cyan-700">
                      {day.items.length}
                    </span>
                  ) : null}
                </div>

                <div className="mt-2 grid gap-1">
                  {day.items.slice(0, 2).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => onOpenItem(item)}
                      className={`truncate rounded-lg border px-2 py-1 text-left text-[9px] font-black transition hover:scale-[1.01] ${getTypeColor(
                        item.content_type
                      )}`}
                    >
                      {getTypeLabel(item.content_type)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        {["post", "reel", "story", "carousel", "ad"].map((type) => (
          <div key={type} className="flex items-center gap-2">
            <span
              className={`h-3 w-3 rounded-full border ${getTypeColor(type)}`}
            />
            <span className="text-xs font-bold text-slate-500">
              {getTypeLabel(type)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProductionFlowPanel({
  pipeline,
  loading,
  updatingItemId,
  onOpenItem,
  onStatusChange,
}: {
  pipeline: any[];
  loading: boolean;
  updatingItemId: string | null;
  onOpenItem: (item: any) => void;
  onStatusChange: (params: StatusChangePayload) => Promise<void>;
}) {
  return (
    <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_18px_70px_rgba(15,23,42,0.05)]">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-lg font-black text-slate-950">
            Flujo de producción
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500">
            De brief a publicación
          </p>
        </div>

        <button className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-600">
          Formatos
        </button>
      </div>

      {loading ? (
        <EmptyMini message="Cargando flujo..." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {pipeline.map((column) => (
            <div key={column.key} className="rounded-2xl bg-slate-50 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-black text-slate-700">
                  {column.icon} {column.title}
                </p>
                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-cyan-700">
                  {column.items.length}
                </span>
              </div>

              <div className="grid gap-2">
                {column.items.slice(0, 3).map((item: any) => (
                  <MiniTask
                    key={item.id}
                    item={item}
                    updating={updatingItemId === item.id}
                    onOpenItem={onOpenItem}
                    onStatusChange={onStatusChange}
                  />
                ))}

                {column.items.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-center text-[11px] font-bold text-slate-400">
                    Sin piezas
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function MiniTask({
  item,
  updating,
  onOpenItem,
  onStatusChange,
}: {
  item: any;
  updating: boolean;
  onOpenItem: (item: any) => void;
  onStatusChange: (params: StatusChangePayload) => Promise<void>;
}) {
  const quickActions = getQuickActions(item.status);

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => onOpenItem(item)}
          className="text-left text-xs font-black leading-4 text-slate-950 transition hover:text-cyan-700"
        >
          {item.title}
        </button>

        <button
          onClick={() => onOpenItem(item)}
          className="text-slate-400 transition hover:text-slate-950"
        >
          ⋮
        </button>
      </div>

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

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-950 text-[9px] font-black text-white">
            {getInitials(item.assigned_role || "AI")}
          </span>
          <span className="text-[10px] font-bold text-slate-500">
            {item.assigned_role || "sin rol"}
          </span>
        </div>

        <span className="text-[10px] font-black text-slate-400">
          {formatDate(item.publish_date)}
        </span>
      </div>

      {quickActions.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {quickActions.map((action) => (
            <button
              key={action.status}
              disabled={updating}
              onClick={() =>
                onStatusChange({
                  itemId: item.id,
                  status: action.status,
                  comment: action.comment,
                })
              }
              className={`rounded-xl px-3 py-2 text-[11px] font-black transition disabled:cursor-not-allowed disabled:opacity-60 ${action.className}`}
            >
              {updating ? "Actualizando..." : action.label}
            </button>
          ))}
        </div>
      ) : null}

      <button
        onClick={() => onOpenItem(item)}
        className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
      >
        Ver detalle
      </button>
    </article>
  );
}

/* ----------------------------- DETAIL MODAL ----------------------------- */

function TaskDetailModal({
  item,
  saving,
  updating,
  onClose,
  onSave,
  onStatusChange,
}: {
  item: any;
  saving: boolean;
  updating: boolean;
  onClose: () => void;
  onSave: (payload: DetailUpdatePayload) => Promise<void>;
  onStatusChange: (params: StatusChangePayload) => Promise<void>;
}) {
  const [title, setTitle] = useState(item.title || "");
  const [objective, setObjective] = useState(item.objective || "");
  const [brief, setBrief] = useState(item.brief || "");
  const [copyBase, setCopyBase] = useState(item.copy_base || "");
  const [cta, setCta] = useState(item.cta || "");
  const [visualDirection, setVisualDirection] = useState(
    item.visual_direction || ""
  );
  const [referenceNotes, setReferenceNotes] = useState(
    item.reference_notes || ""
  );
  const [privateNotes, setPrivateNotes] = useState(item.private_notes || "");
  const [clientNotes, setClientNotes] = useState(item.client_notes || "");

  const [pieceComments, setPieceComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [newCommentText, setNewCommentText] = useState("");
  const [savingComment, setSavingComment] = useState(false);

  const [dueDate, setDueDate] = useState(item.due_date || "");
  const [publishDate, setPublishDate] = useState(item.publish_date || "");

  const [assets, setAssets] = useState<MercuryAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [savingAsset, setSavingAsset] = useState(false);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [assetName, setAssetName] = useState("");
  const [assetType, setAssetType] = useState("design_preview");
  const [assetUrl, setAssetUrl] = useState("");
  const [assetNotes, setAssetNotes] = useState("");

  const quickActions = getQuickActions(item.status);

  async function loadPieceComments() {
    if (!item?.id) {
      setPieceComments([]);
      return;
    }

    try {
      setCommentsLoading(true);
      setCommentsError(null);

      const res = await fetch(
        `/api/mercury/piece-comments?pieceId=${encodeURIComponent(item.id)}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "No se pudieron cargar los comentarios.");
      }

      setPieceComments(json.comments || []);
    } catch (error) {
      console.error("Error loading piece comments:", error);
      setCommentsError("No se pudieron cargar los comentarios.");
    } finally {
      setCommentsLoading(false);
    }
  }

  async function savePieceComment() {
    const cleanText = newCommentText.trim();

    if (!cleanText) {
      setCommentsError("Escribe un comentario antes de guardarlo.");
      return;
    }

    try {
      setSavingComment(true);
      setCommentsError(null);

      const response = await fetch("/api/mercury/piece-comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pieceId: item.id,
          commentText: cleanText,
          authorName: "Cometa",
          authorRole: "Equipo interno",
          source: "manual",
        }),
      });

      const json = await response.json();

      if (!response.ok || !json.ok) {
        throw new Error(json.error || "No se pudo guardar el comentario.");
      }

      setNewCommentText("");
      setPieceComments((current) => [...current, json.comment]);
    } catch (err: any) {
      setCommentsError(err?.message || "No se pudo guardar el comentario.");
    } finally {
      setSavingComment(false);
    }
  }

  async function loadAssets() {
    setLoadingAssets(true);
    setAssetError(null);

    try {
      const response = await fetch(
        `/api/mercury/assets/list?contentItemId=${encodeURIComponent(item.id)}`,
        {
          cache: "no-store",
        }
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Error ${response.status}`);
      }

      const json = await response.json();
      setAssets(json?.assets || []);
    } catch (err: any) {
      setAssetError(err?.message || "No se pudieron cargar los links.");
    } finally {
      setLoadingAssets(false);
    }
  }

  async function saveAssetLink() {
    setAssetError(null);

    if (!assetUrl.trim()) {
      setAssetError("Pega un link antes de guardar.");
      return;
    }

    setSavingAsset(true);

    try {
      const response = await fetch("/api/mercury/assets/add-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentItemId: item.id,
          assetName: assetName || "Link de asset",
          assetType,
          assetUrl,
          notes: assetNotes,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Error ${response.status}`);
      }

      setAssetName("");
      setAssetType("design_preview");
      setAssetUrl("");
      setAssetNotes("");

      await loadAssets();
    } catch (err: any) {
      setAssetError(err?.message || "No se pudo guardar el link.");
    } finally {
      setSavingAsset(false);
    }
  }

  useEffect(() => {
    loadPieceComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  useEffect(() => {
    loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm md:items-center md:p-6">
      <section className="flex max-h-[96vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-t-[34px] bg-white shadow-[0_40px_140px_rgba(15,23,42,0.35)] md:rounded-[34px]">
        <header className="border-b border-slate-200 bg-white p-5 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap gap-2">
                <span
                  className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${getTypeColor(
                    item.content_type
                  )}`}
                >
                  {getTypeLabel(item.content_type)}
                </span>

                <span
                  className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${getStatusColor(
                    item.status
                  )}`}
                >
                  {getStatusLabel(item.status)}
                </span>

                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                  {item.platform || "instagram"}
                </span>
              </div>

              <h2 className="text-3xl font-black leading-[0.98] tracking-[-0.06em] text-slate-950 md:text-4xl">
                Detalle de pieza
              </h2>

              <p className="mt-2 text-sm font-semibold text-slate-500">
                Revisa, ajusta y avanza esta tarea dentro del flujo de MERCURY.
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
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-5">
              <EditInput
                label="Título"
                value={title}
                onChange={setTitle}
                placeholder="Título de la pieza"
              />

              <EditTextarea
                label="Objetivo"
                value={objective}
                onChange={setObjective}
                placeholder="¿Qué debe lograr esta pieza?"
                rows={3}
              />

              <EditTextarea
                label="Brief para producción"
                value={brief}
                onChange={setBrief}
                placeholder="Instrucciones para diseño, video o CM"
                rows={6}
              />

              <EditTextarea
                label="Copy base"
                value={copyBase}
                onChange={setCopyBase}
                placeholder="Texto sugerido para la publicación"
                rows={5}
              />

              <div className="grid gap-5 md:grid-cols-2">
                <EditTextarea
                  label="CTA"
                  value={cta}
                  onChange={setCta}
                  placeholder="Llamado a la acción"
                  rows={4}
                />

                <EditTextarea
                  label="Dirección visual"
                  value={visualDirection}
                  onChange={setVisualDirection}
                  placeholder="Estilo visual, elementos, composición"
                  rows={4}
                />
              </div>

              <EditTextarea
                label="Notas de referencia"
                value={referenceNotes}
                onChange={setReferenceNotes}
                placeholder="Referencias, ideas o restricciones"
                rows={4}
              />

              <div className="grid gap-5 md:grid-cols-2">
                <EditTextarea
                  label="Notas internas Cometa"
                  value={privateNotes}
                  onChange={setPrivateNotes}
                  placeholder="Notas privadas para el equipo"
                  rows={4}
                />

                <EditTextarea
                  label="Notas para cliente"
                  value={clientNotes}
                  onChange={setClientNotes}
                  placeholder="Notas visibles o pensadas para cliente"
                  rows={4}
                />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Comentarios de la pieza
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Observaciones y seguimiento interno de esta pieza.
                    </p>
                  </div>

                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                    {pieceComments.length}
                  </span>
                </div>

                <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
                  <textarea
                    value={newCommentText}
                    onChange={(event) => setNewCommentText(event.target.value)}
                    placeholder="Escribe un comentario interno para esta pieza..."
                    rows={3}
                    className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-950 outline-none transition focus:border-cyan-300 focus:bg-white"
                  />

                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={savePieceComment}
                      disabled={savingComment}
                      className="rounded-xl bg-slate-950 px-4 py-3 text-xs font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingComment ? "Guardando..." : "Agregar comentario"}
                    </button>
                  </div>
                </div>

                {commentsLoading ? (
                  <div className="rounded-xl bg-white p-4 text-sm text-slate-500">
                    Cargando comentarios...
                  </div>
                ) : commentsError ? (
                  <div className="rounded-xl bg-red-50 p-4 text-sm text-red-600">
                    {commentsError}
                  </div>
                ) : pieceComments.length === 0 ? (
                  <div className="rounded-xl bg-white p-4 text-sm text-slate-500">
                    Esta pieza todavía no tiene comentarios.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pieceComments.map((comment) => {
                      const commentText =
                        comment.comment_text ||
                        comment.comment ||
                        comment.text ||
                        comment.message ||
                        "Comentario sin texto";

                      return (
                        <div
                          key={comment.id}
                          className="rounded-xl border border-slate-200 bg-white p-4"
                        >
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <p className="text-xs font-semibold text-slate-700">
                              {comment.author_name ||
                                comment.author_role ||
                                comment.source ||
                                "Comentario interno"}
                            </p>

                            {comment.created_at ? (
                              <p className="text-[11px] text-slate-400">
                                {new Date(comment.created_at).toLocaleString(
                                  "es-MX",
                                  {
                                    day: "2-digit",
                                    month: "short",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  }
                                )}
                              </p>
                            ) : null}
                          </div>

                          <p className="text-sm leading-relaxed text-slate-700">
                            {commentText}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <aside className="space-y-5">
              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_70px_rgba(15,23,42,0.05)]">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-700">
                  Producción
                </p>

                <div className="mt-5 grid gap-3">
                  <InfoRow label="Tipo" value={getTypeLabel(item.content_type)} />
                  <InfoRow
                    label="Plataforma"
                    value={item.platform || "Instagram"}
                  />
                  <InfoRow label="Rol" value={item.assigned_role || "Sin rol"} />
                  <InfoRow label="Prioridad" value={item.priority || "normal"} />
                  <InfoRow label="Estatus" value={getStatusLabel(item.status)} />
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_70px_rgba(15,23,42,0.05)]">
                <p className="text-sm font-black text-slate-950">Fechas</p>

                <div className="mt-4 grid gap-3">
                  <EditInput
                    label="Entrega"
                    value={dueDate}
                    onChange={setDueDate}
                    placeholder="YYYY-MM-DD"
                    type="date"
                  />

                  <EditInput
                    label="Publicación"
                    value={publishDate}
                    onChange={setPublishDate}
                    placeholder="YYYY-MM-DD"
                    type="date"
                  />
                </div>
              </div>

              <AssetLinksPanel
                assets={assets}
                loading={loadingAssets}
                saving={savingAsset}
                error={assetError}
                assetName={assetName}
                assetType={assetType}
                assetUrl={assetUrl}
                assetNotes={assetNotes}
                setAssetName={setAssetName}
                setAssetType={setAssetType}
                setAssetUrl={setAssetUrl}
                setAssetNotes={setAssetNotes}
                onSave={saveAssetLink}
                onReload={loadAssets}
              />

              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_70px_rgba(15,23,42,0.05)]">
                <p className="text-sm font-black text-slate-950">
                  Acciones rápidas
                </p>

                <div className="mt-4 grid gap-2">
                  {quickActions.length === 0 ? (
                    <EmptyMini message="No hay acciones disponibles para este estado." />
                  ) : (
                    quickActions.map((action) => (
                      <button
                        key={action.status}
                        disabled={updating || saving}
                        onClick={() =>
                          onStatusChange({
                            itemId: item.id,
                            status: action.status,
                            comment: action.comment,
                          })
                        }
                        className={`rounded-2xl px-4 py-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-60 ${action.className}`}
                      >
                        {updating ? "Actualizando..." : action.label}
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-[28px] border border-cyan-100 bg-cyan-50 p-5">
                <p className="text-sm font-black text-slate-950">
                  Mercury recomienda
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  Revisa que la pieza tenga beneficio claro, CTA visible,
                  dirección visual suficiente y link del diseño antes de
                  marcarla como aprobada.
                </p>
              </div>
            </aside>
          </div>
        </div>

        <footer className="border-t border-slate-200 bg-white p-5 md:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              onClick={onClose}
              className="h-14 rounded-2xl border border-slate-200 bg-white px-6 text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              Cerrar
            </button>

            <button
              disabled={saving}
              onClick={() =>
                onSave({
                  itemId: item.id,
                  title,
                  objective,
                  brief,
                  copyBase,
                  cta,
                  visualDirection,
                  referenceNotes,
                  privateNotes,
                  clientNotes,
                  dueDate,
                  publishDate,
                  comment: "Se guardaron cambios desde el detalle de pieza.",
                })
              }
              className="h-14 rounded-2xl bg-slate-950 px-6 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function AssetLinksPanel({
  assets,
  loading,
  saving,
  error,
  assetName,
  assetType,
  assetUrl,
  assetNotes,
  setAssetName,
  setAssetType,
  setAssetUrl,
  setAssetNotes,
  onSave,
  onReload,
}: {
  assets: MercuryAsset[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  assetName: string;
  assetType: string;
  assetUrl: string;
  assetNotes: string;
  setAssetName: (value: string) => void;
  setAssetType: (value: string) => void;
  setAssetUrl: (value: string) => void;
  setAssetNotes: (value: string) => void;
  onSave: () => Promise<void>;
  onReload: () => Promise<void>;
}) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_70px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-950">Links y assets</p>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
            Guarda links de Drive, Canva, CapCut, Figma o evidencia publicada.
          </p>
        </div>

        <button
          onClick={onReload}
          disabled={loading}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black text-slate-500 transition hover:bg-slate-50 disabled:opacity-60"
        >
          ↻
        </button>
      </div>

      <div className="mt-4 grid gap-3">
        <input
          value={assetName}
          onChange={(event) => setAssetName(event.target.value)}
          placeholder="Nombre del asset"
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold outline-none transition focus:border-cyan-300 focus:bg-white"
        />

        <select
          value={assetType}
          onChange={(event) => setAssetType(event.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black outline-none transition focus:border-cyan-300 focus:bg-white"
        >
          <option value="design_preview">Preview diseño</option>
          <option value="final_design">Diseño final</option>
          <option value="video">Video / Reel</option>
          <option value="editable_file">Editable</option>
          <option value="reference">Referencia</option>
          <option value="published_evidence">Evidencia publicada</option>
          <option value="external_link">Link externo</option>
        </select>

        <input
          value={assetUrl}
          onChange={(event) => setAssetUrl(event.target.value)}
          placeholder="Pega aquí el link"
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold outline-none transition focus:border-cyan-300 focus:bg-white"
        />

        <textarea
          value={assetNotes}
          onChange={(event) => setAssetNotes(event.target.value)}
          placeholder="Notas del link"
          rows={3}
          className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold leading-5 outline-none transition focus:border-cyan-300 focus:bg-white"
        />

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-black text-red-700">
            {error}
          </div>
        ) : null}

        <button
          onClick={onSave}
          disabled={saving}
          className="h-12 rounded-2xl bg-slate-950 px-4 text-xs font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Guardando link..." : "Guardar link"}
        </button>
      </div>

      <div className="mt-5 border-t border-slate-200 pt-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
            Links guardados
          </p>
          <span className="rounded-full bg-cyan-50 px-2 py-1 text-[10px] font-black text-cyan-700">
            {assets.length}
          </span>
        </div>

        {loading ? (
          <EmptyMini message="Cargando links..." />
        ) : assets.length === 0 ? (
          <EmptyMini message="Todavía no hay links guardados." />
        ) : (
          <div className="grid gap-3">
            {assets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AssetCard({ asset }: { asset: MercuryAsset }) {
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

      <p className="mt-3 text-[10px] font-bold text-slate-400">
        {asset.created_at
          ? new Date(asset.created_at).toLocaleString("es-MX")
          : "Sin fecha"}
      </p>
    </article>
  );
}

/* ----------------------------- SECONDARY PANELS ----------------------------- */

function TeamLoadPanel({ items }: { items: any[] }) {
  const totalTasks = items.length;

  return (
    <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_18px_70px_rgba(15,23,42,0.05)]">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-lg font-black text-slate-950">Carga del equipo</p>
          <p className="mt-1 text-xs font-bold text-slate-500">
            Distribución de producción y capacidad
          </p>
        </div>

        <button className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-600">
          Semana
        </button>
      </div>

      <div className="grid gap-3">
        {teamMembers.map((member, index) => (
          <div
            key={member.name}
            className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">
                  {member.initials}
                </span>
                <div>
                  <p className="text-sm font-black text-slate-950">
                    {member.name}
                  </p>
                  <p className="text-xs font-bold text-slate-500">
                    {member.role}
                  </p>
                </div>
              </div>

              <p className="text-sm font-black text-slate-700">
                {member.load}%
              </p>
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
              <div
                className={`h-full rounded-full ${
                  index === 0
                    ? "bg-orange-400"
                    : index === 1
                    ? "bg-amber-400"
                    : "bg-emerald-400"
                }`}
                style={{ width: `${member.load}%` }}
              />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <TeamMiniMetric label="Tareas" value={totalTasks ? "—" : "0"} />
              <TeamMiniMetric label="Proceso" value="—" />
              <TeamMiniMetric label="Listas" value="—" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TeamMiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white px-3 py-2">
      <p className="text-[10px] font-black uppercase text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-black text-slate-950">{value}</p>
    </div>
  );
}

function ProductionSummaryPanel({
  total,
  productionSummary,
}: {
  total: number;
  productionSummary: { type: string; count: number; percent: number }[];
}) {
  return (
    <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_18px_70px_rgba(15,23,42,0.05)]">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-lg font-black text-slate-950">
            Producción del mes
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500">
            Mix de contenido generado
          </p>
        </div>

        <button className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-600">
          Reporte
        </button>
      </div>

      <div className="flex flex-col items-center gap-5">
        <div className="relative flex h-44 w-44 items-center justify-center rounded-full bg-[conic-gradient(#38bdf8_0_35%,#8b5cf6_35%_58%,#10b981_58%_78%,#f97316_78%_90%,#facc15_90%_100%)]">
          <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-white">
            <p className="text-4xl font-black tracking-[-0.06em] text-slate-950">
              {total}
            </p>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">
              piezas
            </p>
          </div>
        </div>

        <div className="grid w-full gap-3">
          {productionSummary.length === 0 ? (
            <EmptyMini message="Sin distribución todavía." />
          ) : (
            productionSummary.map((item) => (
              <div
                key={item.type}
                className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`h-3 w-3 rounded-full border ${getTypeColor(
                      item.type
                    )}`}
                  />
                  <p className="text-sm font-black text-slate-700">
                    {getTypeLabel(item.type)}
                  </p>
                </div>

                <p className="text-sm font-black text-slate-500">
                  {item.count} · {item.percent}%
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function MercuryAiPanel({
  data,
  nextPublish,
  pending,
}: {
  data: MercuryDashboardData | null;
  nextPublish: any | null;
  pending: number;
}) {
  return (
    <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_18px_70px_rgba(15,23,42,0.05)]">
      <div className="mb-5">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-700">
          Mercury AI
        </p>
        <h3 className="mt-2 text-2xl font-black tracking-[-0.05em] text-slate-950">
          Insights inteligentes
        </h3>
        <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
          Recomendaciones para mejorar decisiones de contenido y producción.
        </p>
      </div>

      <div className="grid gap-3">
        <InsightCard
          icon="📈"
          title="Mejor ventana"
          text="Martes a las 11:00 am"
          note="Ideal para piezas comerciales y contenido de confianza."
        />
        <InsightCard
          icon="⚖️"
          title="Balance de contenido"
          text={
            data?.summary?.totalItems
              ? "Mix de contenido equilibrado"
              : "Sin calendario activo"
          }
          note="Mercury evalúa variedad entre venta, autoridad y comunidad."
        />
        <InsightCard
          icon="🟠"
          title="Piezas pendientes"
          text={`${pending} piezas por producir`}
          note="Prioriza briefs con fecha de publicación más cercana."
        />
        <InsightCard
          icon="📅"
          title="Próxima publicación"
          text={nextPublish ? nextPublish.title : "Sin pieza programada"}
          note={
            nextPublish
              ? `Publicación: ${formatFullDate(nextPublish.publish_date)}`
              : "Genera o carga un calendario para activar el flujo."
          }
        />
      </div>
    </section>
  );
}

function InsightCard({
  icon,
  title,
  text,
  note,
}: {
  icon: string;
  title: string;
  text: string;
  note: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-xl shadow-sm">
          {icon}
        </span>

        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">
            {title}
          </p>
          <p className="mt-1 text-sm font-black leading-5 text-slate-950">
            {text}
          </p>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
            {note}
          </p>
        </div>
      </div>
    </article>
  );
}

function CycleConfigPanel({
  data,
  brandSlug,
  setBrandSlug,
  onLoad,
}: {
  data: MercuryDashboardData | null;
  brandSlug: string;
  setBrandSlug: (value: string) => void;
  onLoad: () => void;
}) {
  return (
    <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_18px_70px_rgba(15,23,42,0.05)]">
      <div className="mb-5 flex items-center justify-between">
        <p className="text-lg font-black text-slate-950">
          Configuración del ciclo
        </p>
        <span className="text-slate-400">⚙️</span>
      </div>

      <div className="grid gap-3">
        <ConfigRow
          label="Día de ciclo"
          value={String(data?.settings?.content_cycle_day ?? "-")}
        />
        <ConfigRow
          label="Generar días antes"
          value={String(data?.settings?.generate_days_before ?? "-")}
        />
        <ConfigRow
          label="Posts por mes"
          value={String(data?.settings?.posts_per_month ?? "-")}
        />
        <ConfigRow
          label="Reels por mes"
          value={String(data?.settings?.reels_per_month ?? "-")}
        />
        <ConfigRow
          label="Historias / semana"
          value={String(data?.settings?.stories_per_week ?? "-")}
        />
      </div>

      <div className="mt-5 rounded-2xl bg-slate-50 p-4">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
          Buscar marca
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={brandSlug}
            onChange={(event) => setBrandSlug(event.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold outline-none"
          />
          <button
            onClick={onLoad}
            className="rounded-xl bg-slate-950 px-4 text-sm font-black text-white"
          >
            Cargar
          </button>
        </div>
      </div>
    </section>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <p className="text-sm font-black text-slate-950">{value}</p>
    </div>
  );
}

function RecentRunsPanel({ runs }: { runs: any[] }) {
  return (
    <section className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_18px_70px_rgba(15,23,42,0.05)] md:col-span-2 2xl:col-span-1">
      <p className="text-lg font-black text-slate-950">Ejecuciones recientes</p>

      <div className="mt-5 grid gap-3">
        {runs.length === 0 ? (
          <EmptyMini message="Sin ejecuciones todavía." />
        ) : (
          runs.map((run) => (
            <div key={run.id} className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase text-slate-500">
                  {run.run_type}
                </p>
                <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase text-slate-600">
                  {run.status}
                </span>
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-500">
                {new Date(run.created_at).toLocaleString("es-MX")}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/* ----------------------------- FORM HELPERS ----------------------------- */

function EditInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,0.04)]">
      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-cyan-300 focus:bg-white"
      />
    </label>
  );
}

function EditTextarea({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="block rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,0.04)]">
      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="mt-3 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-950 outline-none transition focus:border-cyan-300 focus:bg-white"
      />
    </label>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <p className="text-sm font-black text-slate-950">{value}</p>
    </div>
  );
}

function EmptyMini({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
      <p className="text-sm font-black text-slate-400">{message}</p>
    </div>
  );
}