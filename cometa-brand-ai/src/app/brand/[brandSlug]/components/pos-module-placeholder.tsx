"use client";

import Link from "next/link";
import { usePosContext } from "./pos-shell";
import { buildPosHref } from "./pos-sidebar";
import { PosIcon } from "./pos-icons";

type ModuleAction = {
  label: string;
  route: string;
};

export function PosModulePlaceholder({
  eyebrow,
  title,
  description,
  status = "Preparando módulo",
  features,
  primaryAction,
  secondaryAction,
}: {
  eyebrow: string;
  title: string;
  description: string;
  status?: string;
  features: {
    code: string;
    title: string;
    description: string;
  }[];
  primaryAction?: ModuleAction;
  secondaryAction?: ModuleAction;
}) {
  const { brand } = usePosContext();

  return (
    <section className="grid gap-5">
      <header className="relative overflow-hidden rounded-[30px] border border-white/[0.08] bg-[#081524] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.2)] md:p-8">
        <div className="absolute right-[-100px] top-[-120px] h-80 w-80 rounded-full bg-cyan-400/12 blur-[100px]" />

        <div className="relative z-10 grid gap-7 xl:grid-cols-[minmax(0,1fr)_330px] xl:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.07] px-4 py-2 text-[9px] font-black uppercase tracking-[0.22em] text-cyan-200">
                {eyebrow}
              </span>

              <span className="rounded-full border border-amber-300/15 bg-amber-300/[0.07] px-4 py-2 text-[9px] font-black uppercase tracking-[0.18em] text-amber-200">
                {status}
              </span>
            </div>

            <h2 className="mt-6 max-w-4xl text-4xl font-black leading-[0.95] tracking-[-0.07em] text-white md:text-6xl">
              {title}
            </h2>

            <p className="mt-5 max-w-3xl text-sm font-semibold leading-7 text-slate-500 md:text-base">
              {description}
            </p>

            {primaryAction || secondaryAction ? (
              <div className="mt-7 flex flex-wrap gap-3">
                {primaryAction ? (
                  <Link
                    href={resolveActionHref(
                      brand.slug,
                      primaryAction.route
                    )}
                    className="flex h-12 items-center justify-center gap-2 rounded-[15px] bg-cyan-300 px-5 text-sm font-black text-slate-950 transition hover:bg-cyan-200"
                  >
                    {primaryAction.label}
                    <PosIcon name="arrow" className="h-4 w-4" />
                  </Link>
                ) : null}

                {secondaryAction ? (
                  <Link
                    href={resolveActionHref(
                      brand.slug,
                      secondaryAction.route
                    )}
                    className="flex h-12 items-center justify-center rounded-[15px] border border-white/[0.08] bg-white/[0.035] px-5 text-sm font-black text-white transition hover:bg-white/[0.06]"
                  >
                    {secondaryAction.label}
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-[26px] border border-white/[0.08] bg-white/[0.035] p-5">
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-600">
                Preparación
              </p>

              <span className="rounded-full bg-cyan-300/[0.08] px-3 py-1 text-[9px] font-black text-cyan-300">
                COMETA POS
              </span>
            </div>

            <div className="mt-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-5xl font-black tracking-[-0.08em] text-white">
                  0%
                </p>
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  Configuración completada
                </p>
              </div>

              <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-cyan-300/[0.08] text-cyan-300">
                <PosIcon name="sparkles" className="h-6 w-6" />
              </div>
            </div>

            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full w-0 rounded-full bg-cyan-300" />
            </div>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {features.map((feature) => (
          <article
            key={feature.code}
            className="group rounded-[26px] border border-white/[0.08] bg-white/[0.035] p-5 transition hover:-translate-y-1 hover:border-cyan-300/15 hover:bg-white/[0.05]"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-cyan-300/[0.08] text-[10px] font-black text-cyan-300 transition group-hover:bg-cyan-300 group-hover:text-slate-950">
              {feature.code}
            </div>

            <h3 className="mt-5 text-xl font-black tracking-[-0.045em] text-white">
              {feature.title}
            </h3>

            <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
              {feature.description}
            </p>
          </article>
        ))}
      </section>
    </section>
  );
}

function resolveActionHref(brandSlug: string, route: string) {
  if (route.startsWith("/brand/")) {
    return route;
  }

  return buildPosHref(brandSlug, route);
}
