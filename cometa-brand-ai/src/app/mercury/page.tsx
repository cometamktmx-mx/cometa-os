"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Sidebar from "../Sidebar";
import MercuryCard from "../MercuryCard";

function MercuryPageContent() {
  const searchParams = useSearchParams();

  const brandName = searchParams.get("brandName") || "";
  const brandAnalysisId = searchParams.get("brandAnalysisId") || "";

  useEffect(() => {
    if (!brandName && !brandAnalysisId) return;

    localStorage.setItem(
      "cometa_selected_brand_analysis",
      JSON.stringify({
        brandName,
        brandAnalysisId: brandAnalysisId || null,
      })
    );
  }, [brandName, brandAnalysisId]);

  return (
    <main className="min-h-screen bg-[#f6f7fb] py-8 pl-80 pr-6 text-slate-950 md:pr-10">
      <Sidebar />

      <section className="mx-auto max-w-7xl space-y-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Link
            href={brandName ? `/workspace/${encodeURIComponent(brandName)}` : "/workspace"}
            className="inline-flex text-sm font-black text-purple-600 transition hover:text-purple-700"
          >
            ← Volver al Workspace
          </Link>

          <div className="rounded-full bg-slate-950 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-white">
            MERCURY · Content Engine
          </div>
        </div>

        <section className="overflow-hidden rounded-[42px] bg-slate-950 text-white shadow-[0_30px_100px_rgba(15,23,42,0.18)]">
          <div className="relative p-8 md:p-10">
            <div className="absolute right-[-120px] top-[-140px] h-96 w-96 rounded-full bg-purple-600/25 blur-[90px]" />
            <div className="absolute bottom-[-120px] left-[24%] h-80 w-80 rounded-full bg-cyan-400/10 blur-[90px]" />

            <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1fr)_390px] xl:items-end">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300">
                  MERCURY · Content Strategy + Calendar Engine
                </p>

                <h1 className="mt-5 max-w-5xl text-5xl font-black leading-none tracking-[-0.08em] md:text-7xl">
                  Estrategia de contenido y calendario.
                </h1>

                <p className="mt-6 max-w-4xl text-sm font-semibold leading-8 text-slate-300 md:text-base">
                  MERCURY toma la estrategia de ATLAS, el Business Map de NOVA y
                  las señales de ORION para crear el plan mensual de contenido,
                  calendario, briefs, hooks, CTAs y producción.
                </p>
              </div>

              <div className="grid gap-3">
                <HeroMini label="Marca" value={brandName || "Marca no detectada"} />
                <HeroMini label="Entrada" value="ORION + NOVA + ATLAS" />
                <HeroMini label="Salida" value="Contenido + calendario" />
              </div>
            </div>
          </div>
        </section>

        {!brandName && !brandAnalysisId ? (
          <section className="rounded-[34px] border border-amber-100 bg-amber-50 p-7">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-700">
              Falta marca
            </p>

            <h2 className="mt-3 text-3xl font-black tracking-[-0.06em] text-slate-950">
              Abre MERCURY con una marca seleccionada.
            </h2>

            <p className="mt-3 text-sm font-semibold leading-7 text-slate-700">
              Usa una URL con brandName para que MERCURY pueda buscar la memoria
              en COSMOS.
            </p>

            <pre className="mt-5 overflow-auto rounded-2xl bg-white p-5 text-sm font-bold text-slate-700">
              http://localhost:3000/mercury?brandName=nash-mood
            </pre>
          </section>
        ) : null}

        <MercuryCard />
      </section>
    </main>
  );
}

export default function MercuryPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#f6f7fb] py-10 pl-80 pr-10 text-slate-950">
          <Sidebar />
          <div className="rounded-[34px] border border-slate-200 bg-white p-10 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-purple-600">
              MERCURY · Content Engine
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.06em]">
              Cargando MERCURY...
            </h1>
          </div>
        </main>
      }
    >
      <MercuryPageContent />
    </Suspense>
  );
}

function HeroMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>

      <p className="mt-2 text-xl font-black leading-tight text-white">
        {value || "Sin información"}
      </p>
    </div>
  );
}