"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

const ADMIN_EMAILS = ["cometa.mktmx@gmail.com"];

/**
 * IMPORTANTE:
 * En tu estructura actual sí aparece /cometa-os.
 * Si después creas /client/[brandSlug], solo cambia esta constante a "/client".
 */
const CLIENT_HOME_PATH = "/cometa-os";

type AccessType = "view" | "edit" | "internal" | "soon";

type SidebarItem = {
  name: string;
  subtitle: string;
  icon: string;
  href?: string;
  active: boolean;
  accessLabel?: string;
  accessType?: AccessType;
  disabled?: boolean;
};

type SidebarGroup = {
  title: string;
  items: SidebarItem[];
};

function slugifyBrand(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getBrandSlugFromPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);

  if (parts[0] === "workspace" && parts[1]) return decodeURIComponent(parts[1]);
  if (parts[0] === "mercury" && parts[1]) return decodeURIComponent(parts[1]);
  if (parts[0] === "client" && parts[1]) return decodeURIComponent(parts[1]);
  if (parts[0] === "cometa-os" && parts[1]) return decodeURIComponent(parts[1]);

  return "";
}

function getStoredBrandSlug() {
  if (typeof window === "undefined") return "";

  const directSlug = localStorage.getItem("cometa_current_brand_slug");
  if (directSlug) return directSlug;

  const selectedMemory = localStorage.getItem("cometa_selected_business_memory");
  if (!selectedMemory) return "";

  try {
    const parsed = JSON.parse(selectedMemory);

    if (parsed?.brandSlug) return slugifyBrand(parsed.brandSlug);
    if (parsed?.brandName) return slugifyBrand(parsed.brandName);

    return "";
  } catch {
    return "";
  }
}

function buildQueryHref(path: string, brandSlug: string, hash?: string) {
  const query = brandSlug ? `?brandName=${encodeURIComponent(brandSlug)}` : "";
  return `${path}${query}${hash || ""}`;
}

function getAccessClasses(type?: AccessType) {
  if (type === "edit") {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100";
  }

  if (type === "internal") {
    return "bg-slate-100 text-slate-600 ring-1 ring-slate-200";
  }

  if (type === "soon") {
    return "bg-amber-50 text-amber-700 ring-1 ring-amber-100";
  }

  return "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100";
}

export default function Sidebar() {
  const pathname = usePathname();

  const [brandSlug, setBrandSlug] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingUser, setCheckingUser] = useState(true);
  const [currentHash, setCurrentHash] = useState("");

  useEffect(() => {
    async function checkAdmin() {
      const { data } = await supabase.auth.getSession();
      const email = data.session?.user?.email?.toLowerCase() || "";

      setIsAdmin(ADMIN_EMAILS.includes(email));
      setCheckingUser(false);
    }

    checkAdmin();
  }, []);

  useEffect(() => {
    function syncHash() {
      setCurrentHash(window.location.hash || "");
    }

    syncHash();
    window.addEventListener("hashchange", syncHash);

    return () => {
      window.removeEventListener("hashchange", syncHash);
    };
  }, []);

  useEffect(() => {
    const pathSlug = getBrandSlugFromPath(pathname);

    const params = new URLSearchParams(window.location.search);
    const queryBrandName = params.get("brandName") || "";

    const nextBrandSlug =
      pathSlug || slugifyBrand(queryBrandName) || getStoredBrandSlug();

    setBrandSlug(nextBrandSlug);

    if (nextBrandSlug) {
      localStorage.setItem("cometa_current_brand_slug", nextBrandSlug);
    }
  }, [pathname]);

  const workspaceHref = brandSlug ? `/workspace/${brandSlug}` : "/workspace";
  const clientHomeHref = buildQueryHref(CLIENT_HOME_PATH, brandSlug);
  const newAnalysisHref = "/new-analysis";
  const novaHref = buildQueryHref("/nova", brandSlug);
  const salesHref = buildQueryHref("/sales-ai", brandSlug);
  const mercuryHref = buildQueryHref("/generate-strategy", brandSlug);

  const adminGroups: SidebarGroup[] = [
    {
      title: "Sistema Cometa",
      items: [
        {
          name: "Command Center",
          subtitle: "Control interno",
          icon: "CC",
          href: workspaceHref,
          active: pathname.startsWith("/workspace"),
          accessLabel: "Interno",
          accessType: "internal",
        },
        {
          name: "Nuevo análisis",
          subtitle: "Ejecutar ORION",
          icon: "OR",
          href: newAnalysisHref,
          active: pathname.startsWith("/new-analysis"),
          accessLabel: "Ejecutar",
          accessType: "internal",
        },
        {
          name: "NOVA",
          subtitle: "Business Map",
          icon: "NV",
          href: novaHref,
          active: pathname.startsWith("/nova"),
          accessLabel: "Editar",
          accessType: "internal",
        },
        {
          name: "MERCURY",
          subtitle: "Estrategia mensual",
          icon: "MC",
          href: mercuryHref,
          active: pathname.startsWith("/generate-strategy"),
          accessLabel: "Aprobar",
          accessType: "internal",
        },
        {
          name: "SALES AI",
          subtitle: "Ventas y WhatsApp",
          icon: "SA",
          href: salesHref,
          active: pathname.startsWith("/sales-ai"),
          accessLabel: "Operar",
          accessType: "internal",
        },
      ],
    },
    {
      title: "Vista cliente",
      items: [
        {
          name: "Preview cliente",
          subtitle: "Dashboard externo",
          icon: "CL",
          href: clientHomeHref,
          active: pathname.startsWith(CLIENT_HOME_PATH),
          accessLabel: "Ver",
          accessType: "view",
        },
      ],
    },
  ];

  const clientGroups: SidebarGroup[] = [
    {
      title: "Dashboard",
      items: [
        {
          name: "Resumen",
          subtitle: "Estado general de la cuenta",
          icon: "IN",
          href: clientHomeHref,
          active: pathname.startsWith(CLIENT_HOME_PATH) && currentHash === "",
          accessLabel: "Visual",
          accessType: "view",
        },
        {
          name: "Cuenta Digital",
          subtitle: "Redes, señales y presencia",
          icon: "CD",
          href: `${clientHomeHref}#cuenta-digital`,
          active:
            pathname.startsWith(CLIENT_HOME_PATH) &&
            currentHash === "#cuenta-digital",
          accessLabel: "Visual",
          accessType: "view",
        },
        {
          name: "Trabajo Realizado",
          subtitle: "Cambios y acciones de Cometa",
          icon: "TR",
          href: `${clientHomeHref}#trabajo-realizado`,
          active:
            pathname.startsWith(CLIENT_HOME_PATH) &&
            currentHash === "#trabajo-realizado",
          accessLabel: "Visual",
          accessType: "view",
        },
        {
          name: "Estrategia del Mes",
          subtitle: "MERCURY aprobado por Cometa",
          icon: "MC",
          href: `${clientHomeHref}#estrategia-mes`,
          active:
            pathname.startsWith(CLIENT_HOME_PATH) &&
            currentHash === "#estrategia-mes",
          accessLabel: "Visual",
          accessType: "view",
        },
        {
          name: "Reportes",
          subtitle: "Resultados y aprendizajes",
          icon: "RP",
          href: `${clientHomeHref}#reportes`,
          active:
            pathname.startsWith(CLIENT_HOME_PATH) &&
            currentHash === "#reportes",
          accessLabel: "Visual",
          accessType: "view",
        },
      ],
    },
    {
      title: "Información editable",
      items: [
        {
          name: "Ventas / Leads",
          subtitle: "SALES AI y oportunidades",
          icon: "SA",
          href: salesHref,
          active: pathname.startsWith("/sales-ai"),
          accessLabel: "Datos",
          accessType: "edit",
        },
        {
          name: "Agentes IA",
          subtitle: "Información que usan los agentes",
          icon: "AI",
          href: novaHref,
          active: pathname.startsWith("/nova"),
          accessLabel: "Editable",
          accessType: "edit",
        },
        {
          name: "Conexiones",
          subtitle: "Redes, WhatsApp, Shopify y POS",
          icon: "CX",
          href: `${clientHomeHref}#conexiones`,
          active:
            pathname.startsWith(CLIENT_HOME_PATH) &&
            currentHash === "#conexiones",
          accessLabel: "Editable",
          accessType: "edit",
        },
      ],
    },
    {
      title: "Próxima evolución",
      items: [
        {
          name: "Inventario",
          subtitle: "Shopify, POS y catálogo",
          icon: "IV",
          active: false,
          disabled: true,
          accessLabel: "Pronto",
          accessType: "soon",
        },
        {
          name: "Oportunidades",
          subtitle: "Superagente comercial",
          icon: "OP",
          active: false,
          disabled: true,
          accessLabel: "Pronto",
          accessType: "soon",
        },
      ],
    },
  ];

  const groups = isAdmin ? adminGroups : clientGroups;

  if (checkingUser) {
    return (
      <aside className="fixed left-0 top-0 z-40 h-screen w-72 border-r border-slate-200 bg-white p-6 shadow-sm">
        <div className="h-20 rounded-[28px] bg-slate-50 animate-pulse" />
      </aside>
    );
  }

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-72 overflow-hidden border-r border-slate-200 bg-white/95 shadow-[12px_0_50px_rgba(15,23,42,0.05)] backdrop-blur-xl">
      <div className="flex h-full flex-col p-5">
        <Link
          href={isAdmin ? workspaceHref : clientHomeHref}
          className="mb-6 flex items-center gap-3 rounded-[28px] bg-slate-50 p-4 ring-1 ring-slate-100 transition hover:bg-cyan-50"
        >
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-950 shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-cyan-300 via-emerald-400 to-blue-600 shadow-[0_0_25px_rgba(34,211,238,0.65)]" />
          </div>

          <div>
            <p className="text-lg font-black leading-none tracking-[-0.04em] text-slate-950">
              cometa
            </p>
            <p className="text-lg font-black leading-none tracking-[-0.04em] text-slate-950">
              OS
            </p>
          </div>
        </Link>

        <nav className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.title}>
                <p className="mb-2 px-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                  {group.title}
                </p>

                <div className="space-y-2">
                  {group.items.map((item) => {
                    const content = (
                      <>
                        <span
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-[11px] font-black transition ${
                            item.active
                              ? "bg-white text-cyan-700 shadow-sm"
                              : item.disabled
                                ? "bg-slate-100 text-slate-300"
                                : "bg-slate-50 text-slate-400 group-hover:bg-white group-hover:text-cyan-700"
                          }`}
                        >
                          {item.icon}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-black">
                            {item.name}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] font-bold text-slate-400">
                            {item.subtitle}
                          </span>
                        </span>

                        {item.accessLabel ? (
                          <span
                            className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] ${getAccessClasses(
                              item.accessType,
                            )}`}
                          >
                            {item.accessLabel}
                          </span>
                        ) : null}
                      </>
                    );

                    if (item.disabled || !item.href) {
                      return (
                        <div
                          key={item.name}
                          className="group flex cursor-not-allowed items-center gap-3 rounded-[22px] px-3 py-3.5 text-slate-400 opacity-75"
                        >
                          {content}
                        </div>
                      );
                    }

                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={`group flex items-center gap-3 rounded-[22px] px-3 py-3.5 transition ${
                          item.active
                            ? "bg-cyan-50 text-slate-950 ring-1 ring-cyan-200 shadow-[0_14px_40px_rgba(34,211,238,0.12)]"
                            : "text-slate-500 hover:bg-slate-50 hover:text-slate-950"
                        }`}
                      >
                        {content}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        <div className="mt-5 rounded-[28px] border border-slate-200 bg-slate-50 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-700">
            {isAdmin ? "Admin System" : "Cliente"}
          </p>

          <p className="mt-2 text-sm font-black leading-5 text-slate-950">
            {isAdmin ? "Cometa Internal OS" : "Cuenta digital activa"}
          </p>

          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            {isAdmin
              ? "Control interno de agentes, estrategia, ventas y operación."
              : "Visualiza avances, trabajo realizado, estrategia y oportunidades."}
          </p>

          {brandSlug ? (
            <div className="mt-4 rounded-2xl bg-white px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                Marca activa
              </p>
              <p className="mt-1 truncate text-sm font-black text-slate-950">
                {brandSlug}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}