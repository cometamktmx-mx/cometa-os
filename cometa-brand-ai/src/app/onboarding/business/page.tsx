"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PosIcon, type PosIconName } from "@/app/brand/[brandSlug]/components/pos-icons";

type ProfileCode = "fashion" | "retail";

const PROFILE_CHOICES: Array<{
  code: ProfileCode;
  title: string;
  description: string;
  icon: PosIconName;
}> = [
  {
    code: "fashion",
    title: "Moda / Ropa",
    description: "Tallas, colores, variantes e inventario.",
    icon: "product",
  },
  {
    code: "retail",
    title: "Tienda / Retail",
    description: "Productos, inventario, caja y clientes.",
    icon: "store",
  },
];

const PREPARATION_STEPS: Array<{ label: string; icon: PosIconName }> = [
  { label: "Creando negocio", icon: "store" },
  { label: "Preparando Principal", icon: "branch" },
  { label: "Configurando Caja 1", icon: "cash" },
  { label: "Activando prueba", icon: "activity" },
];

export default function BusinessOnboardingPage() {
  const router = useRouter();
  const creationKeyRef = useRef<string | null>(null);
  const [brandName, setBrandName] = useState("");
  const [profileCode, setProfileCode] = useState<ProfileCode>("fashion");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function checkExistingMembership() {
      try {
        const response = await fetch("/api/workspace-brands", {
          cache: "no-store",
        });
        const data = await response.json();
        if (!active) return;

        if (response.status === 401) {
          router.replace("/login?next=/onboarding/business");
          return;
        }

        if (Array.isArray(data.brands) && data.brands[0]?.href) {
          router.replace(data.brands[0].href);
        }
      } catch {
        // La API de creacion conserva la frontera autenticada autoritativa.
      } finally {
        if (active) setChecking(false);
      }
    }

    void checkExistingMembership();
    return () => {
      active = false;
    };
  }, [router]);

  function getCreationKey() {
    if (!creationKeyRef.current) {
      creationKeyRef.current = crypto.randomUUID();
    }
    return creationKeyRef.current;
  }

  async function createBusiness(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;

    const normalizedName = brandName.trim();
    if (!normalizedName) {
      setError("Escribe el nombre de tu negocio para continuar.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/onboarding/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName: normalizedName,
          profileCode,
          idempotencyKey: getCreationKey(),
        }),
      });
      const data = await response.json();

      if (response.status === 401) {
        router.replace("/login?next=/onboarding/business");
        return;
      }

      if (!response.ok || !data?.destination) {
        throw new Error(humanCreationError(response.status, data?.error));
      }

      creationKeyRef.current = null;
      window.location.href = data.destination;
    } catch (creationError) {
      setError(
        creationError instanceof Error
          ? creationError.message
          : "No pudimos terminar de crear tu negocio. Puedes intentarlo otra vez de forma segura."
      );
      setLoading(false);
    }
  }

  if (checking) return <PreparingEntry />;

  return (
    <main className="min-h-screen overflow-hidden bg-[#06101f] px-4 py-6 text-white sm:px-6 sm:py-10">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.10),transparent_62%)]" />

      <section className="relative mx-auto max-w-[980px] overflow-hidden rounded-[32px] border border-white/[0.09] bg-[#0a1726] shadow-[0_32px_90px_rgba(0,0,0,0.32)]">
        <header className="border-b border-white/[0.07] px-5 pb-6 pt-6 sm:px-9 sm:pb-7 sm:pt-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-2xl">
              <span className="inline-flex rounded-full border border-cyan-300/15 bg-cyan-300/[0.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200">
                Cometa POS &middot; Configuraci&oacute;n inicial
              </span>
              <h1 className="mt-4 text-4xl font-bold tracking-[-0.055em] text-white sm:text-5xl">
                Crea tu negocio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400 sm:text-base">
                Configura lo esencial. Nosotros preparamos tu prueba, tu sucursal Principal y Caja 1 autom&aacute;ticamente.
              </p>
            </div>
            <SetupStepper />
          </div>
        </header>

        {loading ? (
          <PreparationState brandName={brandName.trim()} />
        ) : (
          <form onSubmit={createBusiness} className="px-5 py-6 sm:px-9 sm:py-8">
            <label className="block">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.05] text-cyan-200">
                  <PosIcon name="store" className="h-3.5 w-3.5" />
                </span>
                &iquest;C&oacute;mo se llama tu negocio?
              </span>
              <input
                required
                autoFocus
                maxLength={120}
                value={brandName}
                onChange={(event) => {
                  setBrandName(event.target.value);
                  if (error) setError("");
                }}
                placeholder="Ej. Tienda Morotiendas"
                className="mt-3 h-14 w-full rounded-[15px] border border-white/[0.09] bg-[#07121f] px-5 text-base font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/55 focus:ring-4 focus:ring-cyan-300/[0.06]"
              />
            </label>

            <fieldset className="mt-7">
              <legend className="text-sm font-semibold text-slate-200">
                &iquest;Qu&eacute; tipo de negocio tienes?
              </legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {PROFILE_CHOICES.map((choice) => (
                  <ProfileChoice
                    key={choice.code}
                    {...choice}
                    selected={profileCode === choice.code}
                    onSelect={setProfileCode}
                  />
                ))}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <DisabledChoice title={"Restaurante / Caf\u00e9"} icon="receipt" />
                <DisabledChoice title="Servicios / Belleza" icon="customers" />
              </div>
            </fieldset>

            <ValueSummary />

            {error ? (
              <div role="alert" className="mt-5 rounded-[14px] border border-rose-300/15 bg-rose-300/[0.07] px-4 py-3 text-sm font-semibold leading-6 text-rose-100">
                {error}
              </div>
            ) : null}

            <button
              disabled={loading}
              className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-[15px] bg-cyan-300 px-6 text-sm font-bold text-slate-950 shadow-[0_14px_35px_rgba(34,211,238,0.12)] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Crear mi negocio
              <PosIcon name="arrow" className="h-4 w-4" />
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

function SetupStepper() {
  return (
    <ol aria-label="Progreso de activacion" className="flex w-full max-w-[230px] items-center sm:mt-1">
      <li className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-300 text-xs font-bold text-slate-950">1</span>
        <span className="text-xs font-semibold text-white">Negocio</span>
      </li>
      <li aria-hidden="true" className="mx-3 h-px flex-1 bg-white/10" />
      <li className="flex items-center gap-2 text-slate-500">
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-xs font-bold">2</span>
        <span className="text-xs font-semibold">Listo</span>
      </li>
    </ol>
  );
}

function ProfileChoice({
  code,
  title,
  description,
  icon,
  selected,
  onSelect,
}: {
  code: ProfileCode;
  title: string;
  description: string;
  icon: PosIconName;
  selected: boolean;
  onSelect: (code: ProfileCode) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(code)}
      className={`group relative min-h-28 rounded-[16px] border p-4 text-left transition ${
        selected
          ? "border-cyan-300/45 bg-cyan-300/[0.07]"
          : "border-white/[0.08] bg-[#07121f] hover:border-white/[0.16] hover:bg-white/[0.025]"
      }`}
    >
      <span className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-cyan-300 text-slate-950" : "bg-white/[0.05] text-slate-400"}`}>
          <PosIcon name={icon} className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold text-white">{title}</span>
          <span className="mt-1 block text-xs leading-5 text-slate-400">{description}</span>
        </span>
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? "border-cyan-300 bg-cyan-300 text-slate-950" : "border-white/15 text-transparent"}`}>
          <PosIcon name="check" className="h-3 w-3" />
        </span>
      </span>
    </button>
  );
}

function DisabledChoice({ title, icon }: { title: string; icon: PosIconName }) {
  return (
    <div aria-disabled="true" className="flex min-h-16 items-center gap-3 rounded-[14px] border border-white/[0.05] bg-white/[0.018] px-4 py-3 text-slate-500">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.035]">
        <PosIcon name={icon} className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 text-sm font-semibold">{title}</span>
      <span className="rounded-full bg-white/[0.045] px-2 py-1 text-[8px] font-bold uppercase tracking-[0.13em] text-slate-500">
        {"Pr\u00f3ximamente"}
      </span>
    </div>
  );
}

function ValueSummary() {
  const values = [
    "Prueba de 15 d\u00edas",
    "Sucursal Principal",
    "Caja 1",
    "Funciones seg\u00fan tu giro",
  ];

  return (
    <div className="mt-6 rounded-[14px] border border-white/[0.06] bg-white/[0.025] px-4 py-3.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Al crear tu negocio activaremos</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {values.map((value) => (
          <li key={value} className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300">
              <PosIcon name="check" className="h-2.5 w-2.5" />
            </span>
            {value}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PreparationState({ brandName }: { brandName: string }) {
  return (
    <div className="px-5 py-9 sm:px-9 sm:py-12" aria-live="polite" aria-busy="true">
      <div className="mx-auto max-w-2xl text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-300 text-slate-950">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-950/25 border-t-slate-950" />
        </span>
        <h2 className="mt-5 text-2xl font-bold tracking-[-0.035em] text-white sm:text-3xl">Estamos preparando Cometa POS…</h2>
        <p className="mt-2 text-sm text-slate-400">{brandName || "Tu negocio"} estar&aacute; listo en un momento.</p>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          {PREPARATION_STEPS.map((step) => (
            <div key={step.label} className="flex items-center gap-3 rounded-[14px] border border-white/[0.06] bg-white/[0.025] px-4 py-3 text-left">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-300/[0.08] text-cyan-200">
                <PosIcon name={step.icon} className="h-4 w-4" />
              </span>
              <span className="flex-1 text-sm font-semibold text-slate-300">{step.label}</span>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
            </div>
          ))}
        </div>
        <p className="mt-6 text-xs text-slate-500">Mant&eacute;n esta ventana abierta. Si la conexi&oacute;n se interrumpe, podr&aacute;s reintentar de forma segura.</p>
      </div>
    </div>
  );
}

function PreparingEntry() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#06101f] px-5 text-white" aria-busy="true">
      <div className="w-full max-w-xl rounded-[28px] border border-white/[0.08] bg-[#0a1726] p-8 shadow-2xl">
        <div className="h-3 w-44 animate-pulse rounded bg-cyan-300/15" />
        <div className="mt-5 h-10 w-64 max-w-full animate-pulse rounded bg-white/[0.08]" />
        <div className="mt-4 h-4 w-full animate-pulse rounded bg-white/[0.045]" />
        <p className="mt-6 text-sm font-semibold text-slate-400">Preparando tu espacio…</p>
      </div>
    </main>
  );
}

function humanCreationError(status: number, value: unknown) {
  const message = typeof value === "string" ? value : "";

  if (status === 409) {
    return "Ya existe un negocio con una configuraci\u00f3n equivalente. Puedes reintentar esta operaci\u00f3n de forma segura.";
  }

  if (status >= 500) {
    return "No pudimos terminar de crear tu negocio. Puedes intentarlo otra vez de forma segura.";
  }

  return message || "Revisa la informaci\u00f3n e intenta nuevamente.";
}
