"use client";

import { useEffect, useMemo, useState } from "react";

type StringArrayField =
  | "paymentMethods"
  | "qualificationQuestions"
  | "forbiddenPromises"
  | "canDoAlone"
  | "shouldNotDo"
  | "escalationRules"
  | "softCloseQuestions";

type ObjectionHandler = {
  objection: string;
  answer: string;
};

type Offer = {
  name: string;
  ideal_for?: string;
  sales_angle?: string;
  when_to_offer?: string;
  requires_human_confirmation?: boolean;
};

type Playbook = {
  id?: string | null;
  brandName: string;

  businessModel: string;
  idealCustomer: string;
  salesObjective: string;
  offerSummary: string;
  minimumOrder: string;
  averageTicket: string;
  catalogUrl: string;
  shippingPolicy: string;
  businessHours: string;

  paymentMethods: string[];
  qualificationQuestions: string[];
  forbiddenPromises: string[];

  objectionHandlers: ObjectionHandler[];
  priorityOffers: Offer[];

  canDoAlone: string[];
  shouldNotDo: string[];
  escalationRules: string[];

  followupMax: number;
  followupDelayMinutes: number;
  noResponseDelayMinutes: number;
  softCloseQuestions: string[];

  isActive: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
};

const emptyPlaybook: Playbook = {
  id: null,
  brandName: "Mar Cosmetic",

  businessModel: "",
  idealCustomer: "",
  salesObjective: "",
  offerSummary: "",
  minimumOrder: "",
  averageTicket: "",
  catalogUrl: "",
  shippingPolicy: "",
  businessHours: "",

  paymentMethods: [],
  qualificationQuestions: [],
  forbiddenPromises: [],

  objectionHandlers: [],
  priorityOffers: [],

  canDoAlone: [],
  shouldNotDo: [],
  escalationRules: [],

  followupMax: 3,
  followupDelayMinutes: 240,
  noResponseDelayMinutes: 180,
  softCloseQuestions: [],

  isActive: true,
};

export default function SalesAISettingsPage() {
  const [playbook, setPlaybook] = useState<Playbook>(emptyPlaybook);
  const [brandNameInput, setBrandNameInput] = useState("Mar Cosmetic");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exists, setExists] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const readiness = useMemo(() => {
    const checks = [
      Boolean(playbook.businessModel?.trim()),
      Boolean(playbook.idealCustomer?.trim()),
      Boolean(playbook.salesObjective?.trim()),
      Boolean(playbook.offerSummary?.trim()),
      playbook.qualificationQuestions.length > 0,
      playbook.objectionHandlers.length > 0,
      playbook.canDoAlone.length > 0,
      playbook.shouldNotDo.length > 0,
      playbook.escalationRules.length > 0,
      playbook.priorityOffers.length > 0,
    ];

    const complete = checks.filter(Boolean).length;
    const total = checks.length;
    const score = Math.round((complete / total) * 100);

    return { score, complete, total };
  }, [playbook]);

  useEffect(() => {
    loadPlaybook("Mar Cosmetic");
  }, []);

  async function loadPlaybook(brandName = brandNameInput) {
    setLoading(true);
    setErrorMsg("");
    setMessage("");

    try {
      const res = await fetch(
        `/api/sales-ai/playbook?brandName=${encodeURIComponent(brandName)}`
      );

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "No se pudo cargar la configuración");
      }

      setPlaybook({
        ...emptyPlaybook,
        ...data.playbook,
        brandName: data.playbook?.brandName || brandName,
      });

      setBrandNameInput(data.playbook?.brandName || brandName);
      setExists(Boolean(data.exists));
    } catch (error: any) {
      setErrorMsg(error.message || "Error cargando configuración");
    } finally {
      setLoading(false);
    }
  }

  async function savePlaybook() {
    setSaving(true);
    setErrorMsg("");
    setMessage("");

    try {
      const res = await fetch("/api/sales-ai/playbook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(playbook),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "No se pudo guardar la configuración");
      }

      setPlaybook({
        ...emptyPlaybook,
        ...data.playbook,
      });

      setExists(true);
      setMessage("Configuración guardada correctamente. SALES AI ya puede usar este playbook.");
    } catch (error: any) {
      setErrorMsg(error.message || "Error guardando configuración");
    } finally {
      setSaving(false);
    }
  }

  function updateField<K extends keyof Playbook>(field: K, value: Playbook[K]) {
    setPlaybook((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function updateStringList(field: StringArrayField, index: number, value: string) {
    setPlaybook((prev) => {
      const next = [...prev[field]];
      next[index] = value;

      return {
        ...prev,
        [field]: next,
      };
    });
  }

  function addStringItem(field: StringArrayField, value = "") {
    setPlaybook((prev) => ({
      ...prev,
      [field]: [...prev[field], value],
    }));
  }

  function removeStringItem(field: StringArrayField, index: number) {
    setPlaybook((prev) => ({
      ...prev,
      [field]: prev[field].filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function updateObjection(index: number, key: keyof ObjectionHandler, value: string) {
    setPlaybook((prev) => {
      const next = [...prev.objectionHandlers];
      next[index] = {
        ...next[index],
        [key]: value,
      };

      return {
        ...prev,
        objectionHandlers: next,
      };
    });
  }

  function addObjection() {
    setPlaybook((prev) => ({
      ...prev,
      objectionHandlers: [
        ...prev.objectionHandlers,
        {
          objection: "",
          answer: "",
        },
      ],
    }));
  }

  function removeObjection(index: number) {
    setPlaybook((prev) => ({
      ...prev,
      objectionHandlers: prev.objectionHandlers.filter(
        (_, itemIndex) => itemIndex !== index
      ),
    }));
  }

  function updateOffer(index: number, key: keyof Offer, value: string | boolean) {
    setPlaybook((prev) => {
      const next = [...prev.priorityOffers];
      next[index] = {
        ...next[index],
        [key]: value,
      };

      return {
        ...prev,
        priorityOffers: next,
      };
    });
  }

  function addOffer() {
    setPlaybook((prev) => ({
      ...prev,
      priorityOffers: [
        ...prev.priorityOffers,
        {
          name: "",
          ideal_for: "",
          sales_angle: "",
          when_to_offer: "",
          requires_human_confirmation: false,
        },
      ],
    }));
  }

  function removeOffer(index: number) {
    setPlaybook((prev) => ({
      ...prev,
      priorityOffers: prev.priorityOffers.filter(
        (_, itemIndex) => itemIndex !== index
      ),
    }));
  }

  return (
    <main className="min-h-screen bg-[#f3f7fb] text-slate-950">
      <style jsx global>{`
        .premium-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: rgba(100, 116, 139, 0.24) transparent;
        }

        .premium-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        .premium-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }

        .premium-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(100, 116, 139, 0.2);
          border-radius: 999px;
        }

        .premium-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(100, 116, 139, 0.35);
        }
      `}</style>

      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-44 left-16 h-[420px] w-[420px] rounded-full bg-cyan-200/55 blur-[130px]" />
        <div className="absolute right-0 top-32 h-[520px] w-[520px] rounded-full bg-blue-200/45 blur-[160px]" />
        <div className="absolute bottom-0 left-1/2 h-[440px] w-[440px] rounded-full bg-indigo-100/80 blur-[150px]" />
      </div>

      <div className="relative mx-auto max-w-[1760px] px-5 py-5 space-y-5">
        <TopBar
          playbook={playbook}
          brandNameInput={brandNameInput}
          setBrandNameInput={setBrandNameInput}
          loading={loading}
          saving={saving}
          exists={exists}
          readiness={readiness}
          onLoad={() => loadPlaybook()}
          onSave={savePlaybook}
          onBrandChange={(value) => {
            setBrandNameInput(value);
            updateField("brandName", value);
          }}
        />

        {errorMsg && (
          <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-red-700 shadow-sm">
            {errorMsg}
          </div>
        )}

        {message && (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-700 shadow-sm">
            {message}
          </div>
        )}

        <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-5 items-start">
          <div className="space-y-5">
            <SectionCard
              eyebrow="BASE COMERCIAL"
              title="Información del negocio"
              description="Define qué vende la cuenta, a quién le vende y cuál es el objetivo comercial de SALES AI."
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <TextAreaField
                  label="Modelo de negocio"
                  value={playbook.businessModel}
                  onChange={(value) => updateField("businessModel", value)}
                  placeholder="Ej. Venta de lotes de maquillaje al mayoreo para revendedoras, bazares y negocios de belleza."
                />

                <TextAreaField
                  label="Cliente ideal"
                  value={playbook.idealCustomer}
                  onChange={(value) => updateField("idealCustomer", value)}
                  placeholder="Ej. Revendedoras, emprendedoras, bazares, tiendas de maquillaje y personas que quieren iniciar negocio."
                />

                <TextAreaField
                  label="Objetivo de SALES AI"
                  value={playbook.salesObjective}
                  onChange={(value) => updateField("salesObjective", value)}
                  placeholder="Ej. Calificar prospectos, detectar intención, presupuesto y ciudad para avanzar la venta."
                />

                <TextAreaField
                  label="Resumen de oferta"
                  value={playbook.offerSummary}
                  onChange={(value) => updateField("offerSummary", value)}
                  placeholder="Ej. Lotes de maquillaje al mayoreo con opciones económicas, variadas y surtidas para reventa."
                />
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <TextInputField
                  label="Pedido mínimo"
                  value={playbook.minimumOrder}
                  onChange={(value) => updateField("minimumOrder", value)}
                  placeholder="Ej. Por definir / desde $1,500"
                />

                <TextInputField
                  label="Ticket promedio"
                  value={playbook.averageTicket}
                  onChange={(value) => updateField("averageTicket", value)}
                  placeholder="Ej. $1,500 - $3,000"
                />

                <TextInputField
                  label="URL de catálogo"
                  value={playbook.catalogUrl}
                  onChange={(value) => updateField("catalogUrl", value)}
                  placeholder="https://..."
                />

                <TextInputField
                  label="Horario de atención"
                  value={playbook.businessHours}
                  onChange={(value) => updateField("businessHours", value)}
                  placeholder="Ej. WhatsApp 24/7 con SALES AI"
                />
              </div>

              <div className="mt-4">
                <TextAreaField
                  label="Política de envío"
                  value={playbook.shippingPolicy}
                  onChange={(value) => updateField("shippingPolicy", value)}
                  placeholder="Ej. Los envíos se confirman según ciudad. El agente puede pedir ciudad, pero no debe prometer costo ni tiempo exacto sin validación."
                  compact
                />
              </div>
            </SectionCard>

            <SectionCard
              eyebrow="CALIFICACIÓN"
              title="Preguntas, pagos y filtros de venta"
              description="Estas reglas ayudan al agente a entender si el prospecto tiene intención real antes de recomendar."
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <StringListEditor
                  title="Preguntas de calificación"
                  description="Lo que SALES AI debe preguntar para entender intención, presupuesto y contexto."
                  items={playbook.qualificationQuestions}
                  placeholder="Ej. ¿Buscas para revender o para uso personal?"
                  onAdd={() => addStringItem("qualificationQuestions")}
                  onUpdate={(index, value) =>
                    updateStringList("qualificationQuestions", index, value)
                  }
                  onRemove={(index) =>
                    removeStringItem("qualificationQuestions", index)
                  }
                />

                <StringListEditor
                  title="Métodos de pago"
                  description="Información segura que puede mencionar o restricciones de validación."
                  items={playbook.paymentMethods}
                  placeholder="Ej. No confirmar pago recibido sin validación humana."
                  onAdd={() => addStringItem("paymentMethods")}
                  onUpdate={(index, value) =>
                    updateStringList("paymentMethods", index, value)
                  }
                  onRemove={(index) => removeStringItem("paymentMethods", index)}
                />
              </div>
            </SectionCard>

            <SectionCard
              eyebrow="OFERTA"
              title="Productos, lotes o servicios recomendables"
              description="Define qué puede ofrecer SALES AI, cuándo debe recomendarlo y si requiere confirmación humana."
            >
              <OfferEditor
                offers={playbook.priorityOffers}
                onAdd={addOffer}
                onUpdate={updateOffer}
                onRemove={removeOffer}
              />
            </SectionCard>

            <SectionCard
              eyebrow="OBJECIONES"
              title="Manejo de objeciones comerciales"
              description="Configura cómo debe responder el agente cuando el cliente diga que está caro, que lo va a checar o que necesita más información."
            >
              <ObjectionEditor
                objections={playbook.objectionHandlers}
                onAdd={addObjection}
                onUpdate={updateObjection}
                onRemove={removeObjection}
              />
            </SectionCard>

            <SectionCard
              eyebrow="AUTONOMÍA"
              title="Reglas del agente"
              description="Define lo que puede resolver solo, lo que nunca debe hacer y cuándo debe escalar a humano."
            >
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <StringListEditor
                  title="Puede hacer solo"
                  description="Acciones seguras para resolver sin humano."
                  items={playbook.canDoAlone}
                  placeholder="Ej. Responder mensajes iniciales."
                  onAdd={() => addStringItem("canDoAlone")}
                  onUpdate={(index, value) =>
                    updateStringList("canDoAlone", index, value)
                  }
                  onRemove={(index) => removeStringItem("canDoAlone", index)}
                />

                <StringListEditor
                  title="No debe hacer"
                  description="Límites para evitar promesas o errores."
                  items={playbook.shouldNotDo}
                  placeholder="Ej. No inventar precios."
                  onAdd={() => addStringItem("shouldNotDo")}
                  onUpdate={(index, value) =>
                    updateStringList("shouldNotDo", index, value)
                  }
                  onRemove={(index) => removeStringItem("shouldNotDo", index)}
                />

                <StringListEditor
                  title="Escalar a humano"
                  description="Casos donde el agente debe pedir apoyo."
                  items={playbook.escalationRules}
                  placeholder="Ej. Si el cliente quiere pagar."
                  onAdd={() => addStringItem("escalationRules")}
                  onUpdate={(index, value) =>
                    updateStringList("escalationRules", index, value)
                  }
                  onRemove={(index) => removeStringItem("escalationRules", index)}
                />
              </div>

              <div className="mt-4">
                <StringListEditor
                  title="Promesas prohibidas"
                  description="Frases o promesas que SALES AI no debe decir."
                  items={playbook.forbiddenPromises}
                  placeholder="Ej. No prometer envío gratis si no está confirmado."
                  onAdd={() => addStringItem("forbiddenPromises")}
                  onUpdate={(index, value) =>
                    updateStringList("forbiddenPromises", index, value)
                  }
                  onRemove={(index) => removeStringItem("forbiddenPromises", index)}
                />
              </div>
            </SectionCard>

            <SectionCard
              eyebrow="SEGUIMIENTO"
              title="Reglas de seguimiento y cierre suave"
              description="Define cuántas veces puede dar seguimiento y qué preguntas puede usar para avanzar sin presionar demasiado."
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <NumberInputField
                  label="Máximo de seguimientos"
                  value={playbook.followupMax}
                  onChange={(value) => updateField("followupMax", value)}
                />

                <NumberInputField
                  label="Minutos si dice 'lo checo'"
                  value={playbook.followupDelayMinutes}
                  onChange={(value) => updateField("followupDelayMinutes", value)}
                />

                <NumberInputField
                  label="Minutos sin respuesta"
                  value={playbook.noResponseDelayMinutes}
                  onChange={(value) => updateField("noResponseDelayMinutes", value)}
                />
              </div>

              <div className="mt-4">
                <StringListEditor
                  title="Preguntas de cierre suave"
                  description="Preguntas para llevar al prospecto a una decisión sin forzar la venta."
                  items={playbook.softCloseQuestions}
                  placeholder="Ej. ¿Quieres que te recomiende una opción según tu presupuesto?"
                  onAdd={() => addStringItem("softCloseQuestions")}
                  onUpdate={(index, value) =>
                    updateStringList("softCloseQuestions", index, value)
                  }
                  onRemove={(index) =>
                    removeStringItem("softCloseQuestions", index)
                  }
                />
              </div>
            </SectionCard>
          </div>

          <aside className="xl:sticky xl:top-5 space-y-5">
            <ControlPanel
              playbook={playbook}
              readiness={readiness}
              exists={exists}
              loading={loading}
              saving={saving}
              onSave={savePlaybook}
              onToggleActive={(value) => updateField("isActive", value)}
            />
          </aside>
        </section>
      </div>
    </main>
  );
}

function TopBar({
  playbook,
  brandNameInput,
  setBrandNameInput,
  loading,
  saving,
  exists,
  readiness,
  onLoad,
  onSave,
  onBrandChange,
}: {
  playbook: Playbook;
  brandNameInput: string;
  setBrandNameInput: (value: string) => void;
  loading: boolean;
  saving: boolean;
  exists: boolean;
  readiness: { score: number; complete: number; total: number };
  onLoad: () => void;
  onSave: () => void;
  onBrandChange: (value: string) => void;
}) {
  return (
    <header className="rounded-[34px] border border-white bg-white/90 shadow-[0_24px_90px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
      <div className="flex flex-col gap-5 px-6 py-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-[24px] bg-slate-950 text-white shadow-[0_22px_60px_rgba(15,23,42,0.25)]">
            <span className="text-xl font-black">AI</span>
            <span className="absolute -right-1 -top-1 h-4 w-4 rounded-full border-2 border-white bg-emerald-400" />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-black tracking-[0.24em] text-cyan-600">
                COMETA OS · SALES AI
              </p>
              <StatusChip label="Configuración del agente" tone="cyan" />
              <StatusChip
                label={exists ? "Playbook activo" : "Playbook nuevo"}
                tone={exists ? "green" : "amber"}
              />
            </div>

            <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">
              Configuración de SALES AI
            </h1>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 min-w-[290px]">
            <p className="text-[10px] font-black uppercase text-slate-400">
              Marca activa
            </p>
            <input
              value={brandNameInput}
              onChange={(e) => {
                setBrandNameInput(e.target.value);
                onBrandChange(e.target.value);
              }}
              className="mt-1 w-full bg-transparent text-lg font-black text-slate-950 outline-none"
            />
          </div>

          <button
            onClick={onLoad}
            disabled={loading}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
          >
            {loading ? "Cargando..." : "Cargar"}
          </button>

          <button
            onClick={onSave}
            disabled={saving || !playbook.brandName}
            className="rounded-2xl bg-slate-950 px-6 py-4 text-sm font-black text-white shadow-[0_18px_50px_rgba(15,23,42,0.22)] transition hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? "Guardando..." : "Guardar configuración"}
          </button>
        </div>
      </div>

      <div className="border-t border-slate-100 px-6 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-black text-slate-700">
              Preparación del agente: {readiness.score}%
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {readiness.complete} de {readiness.total} bloques principales configurados.
            </p>
          </div>

          <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-cyan-600 transition-all"
              style={{ width: `${readiness.score}%` }}
            />
          </div>
        </div>
      </div>
    </header>
  );
}

function ControlPanel({
  playbook,
  readiness,
  exists,
  loading,
  saving,
  onSave,
  onToggleActive,
}: {
  playbook: Playbook;
  readiness: { score: number; complete: number; total: number };
  exists: boolean;
  loading: boolean;
  saving: boolean;
  onSave: () => void;
  onToggleActive: (value: boolean) => void;
}) {
  return (
    <div className="rounded-[34px] border border-white bg-white/92 shadow-[0_24px_90px_rgba(15,23,42,0.08)] backdrop-blur-2xl overflow-hidden">
      <div className="border-b border-slate-100 p-5">
        <p className="text-[11px] font-black tracking-[0.2em] text-cyan-600">
          CONTROL DEL AGENTE
        </p>
        <h2 className="mt-1 text-2xl font-black text-slate-950">
          Autonomía comercial
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Aquí validas si SALES AI tiene suficiente información para operar.
        </p>
      </div>

      <div className="p-5 space-y-4">
        <div className="rounded-[28px] border border-cyan-100 bg-cyan-50 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase text-cyan-700/70">
                Preparación
              </p>
              <p className="mt-2 text-5xl font-black text-slate-950">
                {readiness.score}%
              </p>
            </div>

            <div className="flex h-24 w-24 items-center justify-center rounded-full border border-cyan-200 bg-white shadow-sm">
              <span className="text-lg font-black text-cyan-700">
                {readiness.score >= 80
                  ? "Alta"
                  : readiness.score >= 50
                  ? "Media"
                  : "Baja"}
              </span>
            </div>
          </div>

          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white">
            <div
              className="h-full rounded-full bg-cyan-600"
              style={{ width: `${readiness.score}%` }}
            />
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase text-slate-400">
                Estado del playbook
              </p>
              <p className="mt-1 text-lg font-black text-slate-950">
                {exists ? "Guardado en sistema" : "Nuevo / pendiente"}
              </p>
            </div>

            <span
              className={`rounded-full border px-3 py-1 text-[11px] font-black ${
                playbook.isActive
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-white text-slate-500"
              }`}
            >
              {playbook.isActive ? "Activo" : "Inactivo"}
            </span>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div>
              <p className="text-sm font-black text-slate-800">
                Playbook activo
              </p>
              <p className="text-xs text-slate-500">
                SALES AI usará esta configuración para la marca.
              </p>
            </div>

            <button
              onClick={() => onToggleActive(!playbook.isActive)}
              className={`h-8 w-14 rounded-full p-1 transition ${
                playbook.isActive ? "bg-cyan-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`block h-6 w-6 rounded-full bg-white transition ${
                  playbook.isActive ? "translate-x-6" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <InfoTile label="Preguntas" value={`${playbook.qualificationQuestions.length}`} />
          <InfoTile label="Objeciones" value={`${playbook.objectionHandlers.length}`} />
          <InfoTile label="Ofertas" value={`${playbook.priorityOffers.length}`} />
          <InfoTile label="Escalaciones" value={`${playbook.escalationRules.length}`} />
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-5">
          <p className="text-[10px] font-black uppercase text-slate-400">
            Principio operativo
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">
            SALES AI debe resolver la mayor parte de la conversación de forma autónoma,
            pero sin inventar información, prometer condiciones no autorizadas o confirmar
            pagos, stock y descuentos sin validación.
          </p>
        </div>

        <button
          onClick={onSave}
          disabled={saving || loading}
          className="w-full rounded-2xl bg-slate-950 px-6 py-4 text-sm font-black text-white shadow-[0_18px_50px_rgba(15,23,42,0.22)] transition hover:bg-slate-800 disabled:opacity-60"
        >
          {saving ? "Guardando configuración..." : "Guardar playbook"}
        </button>
      </div>
    </div>
  );
}

function SectionCard({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[34px] border border-white bg-white/92 shadow-[0_24px_90px_rgba(15,23,42,0.08)] backdrop-blur-2xl overflow-hidden">
      <div className="border-b border-slate-100 p-5">
        <p className="text-[11px] font-black tracking-[0.2em] text-cyan-600">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-2xl font-black text-slate-950">
          {title}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">
          {description}
        </p>
      </div>

      <div className="p-5">{children}</div>
    </section>
  );
}

function TextInputField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <span className="text-[10px] font-black uppercase text-slate-400">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400"
      />
    </label>
  );
}

function NumberInputField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <span className="text-[10px] font-black uppercase text-slate-400">
        {label}
      </span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value || 0))}
        className="mt-2 w-full bg-transparent text-sm font-black text-slate-800 outline-none"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  compact,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  compact?: boolean;
}) {
  return (
    <label className="block rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <span className="text-[10px] font-black uppercase text-slate-400">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`mt-2 w-full resize-none bg-transparent text-sm font-semibold leading-relaxed text-slate-800 outline-none placeholder:text-slate-400 ${
          compact ? "min-h-[90px]" : "min-h-[150px]"
        }`}
      />
    </label>
  );
}

function StringListEditor({
  title,
  description,
  items,
  placeholder,
  onAdd,
  onUpdate,
  onRemove,
}: {
  title: string;
  description: string;
  items: string[];
  placeholder: string;
  onAdd: () => void;
  onUpdate: (index: number, value: string) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-black text-slate-950">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            {description}
          </p>
        </div>

        <button
          onClick={onAdd}
          className="shrink-0 rounded-2xl bg-slate-950 px-4 py-2 text-xs font-black text-white hover:bg-slate-800"
        >
          Agregar
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {!items.length && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            Sin elementos todavía.
          </div>
        )}

        {items.map((item, index) => (
          <div key={index} className="flex gap-2">
            <input
              value={item}
              onChange={(e) => onUpdate(index, e.target.value)}
              placeholder={placeholder}
              className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400"
            />

            <button
              onClick={() => onRemove(index)}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-500 hover:bg-red-50 hover:text-red-600"
            >
              Quitar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ObjectionEditor({
  objections,
  onAdd,
  onUpdate,
  onRemove,
}: {
  objections: ObjectionHandler[];
  onAdd: () => void;
  onUpdate: (index: number, key: keyof ObjectionHandler, value: string) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={onAdd}
          className="rounded-2xl bg-slate-950 px-4 py-2 text-xs font-black text-white hover:bg-slate-800"
        >
          Agregar objeción
        </button>
      </div>

      {!objections.length && (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
          Sin objeciones configuradas todavía.
        </div>
      )}

      {objections.map((item, index) => (
        <div
          key={index}
          className="rounded-[28px] border border-slate-200 bg-white p-4"
        >
          <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_auto] gap-3">
            <TextInputField
              label="Objeción"
              value={item.objection}
              onChange={(value) => onUpdate(index, "objection", value)}
              placeholder="Ej. precio"
            />

            <TextAreaField
              label="Respuesta sugerida"
              value={item.answer}
              onChange={(value) => onUpdate(index, "answer", value)}
              placeholder="Ej. Entiendo. Para recomendarte mejor, ¿con qué presupuesto te gustaría iniciar?"
              compact
            />

            <button
              onClick={() => onRemove(index)}
              className="h-fit rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-500 hover:bg-red-50 hover:text-red-600"
            >
              Quitar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function OfferEditor({
  offers,
  onAdd,
  onUpdate,
  onRemove,
}: {
  offers: Offer[];
  onAdd: () => void;
  onUpdate: (index: number, key: keyof Offer, value: string | boolean) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={onAdd}
          className="rounded-2xl bg-slate-950 px-4 py-2 text-xs font-black text-white hover:bg-slate-800"
        >
          Agregar oferta
        </button>
      </div>

      {!offers.length && (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
          Sin ofertas configuradas todavía.
        </div>
      )}

      {offers.map((item, index) => (
        <div
          key={index}
          className="rounded-[28px] border border-slate-200 bg-white p-4 space-y-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase text-cyan-600">
                Oferta #{index + 1}
              </p>
              <h3 className="mt-1 text-lg font-black text-slate-950">
                {item.name || "Nueva oferta"}
              </h3>
            </div>

            <button
              onClick={() => onRemove(index)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-500 hover:bg-red-50 hover:text-red-600"
            >
              Quitar
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TextInputField
              label="Nombre de la oferta"
              value={item.name || ""}
              onChange={(value) => onUpdate(index, "name", value)}
              placeholder="Ej. Lote económico"
            />

            <TextInputField
              label="Ideal para"
              value={item.ideal_for || ""}
              onChange={(value) => onUpdate(index, "ideal_for", value)}
              placeholder="Ej. Personas que quieren iniciar con menor inversión"
            />

            <TextAreaField
              label="Ángulo de venta"
              value={item.sales_angle || ""}
              onChange={(value) => onUpdate(index, "sales_angle", value)}
              placeholder="Ej. Ideal para probar rotación y empezar a vender sin una inversión alta."
              compact
            />

            <TextAreaField
              label="Cuándo ofrecer"
              value={item.when_to_offer || ""}
              onChange={(value) => onUpdate(index, "when_to_offer", value)}
              placeholder="Ej. Cuando el prospecto tiene presupuesto bajo o apenas quiere iniciar."
              compact
            />
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-sm font-black text-slate-800">
                Requiere confirmación humana
              </p>
              <p className="text-xs text-slate-500">
                Úsalo si el agente no debe prometer esta oferta sin validación.
              </p>
            </div>

            <button
              onClick={() =>
                onUpdate(
                  index,
                  "requires_human_confirmation",
                  !item.requires_human_confirmation
                )
              }
              className={`h-8 w-14 rounded-full p-1 transition ${
                item.requires_human_confirmation ? "bg-cyan-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`block h-6 w-6 rounded-full bg-white transition ${
                  item.requires_human_confirmation ? "translate-x-6" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function InfoTile({
  label,
  value,
  alert,
}: {
  label: string;
  value?: string | null;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        alert
          ? "border-amber-200 bg-amber-50"
          : "border-slate-200 bg-slate-50"
      }`}
    >
      <p className="text-[10px] font-black uppercase text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-slate-800">
        {value || "N/A"}
      </p>
    </div>
  );
}

function StatusChip({
  label,
  tone,
}: {
  label: string;
  tone: "green" | "amber" | "cyan";
}) {
  const styles = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-700",
  };

  return (
    <span className={`rounded-full border px-3 py-1 text-[10px] font-black ${styles[tone]}`}>
      {label}
    </span>
  );
}