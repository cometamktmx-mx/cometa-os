"use client";

import { useEffect, useMemo, useState } from "react";

type TabKey = "base" | "offers" | "conversation" | "autonomy";

type ProductOffer = {
  id: string;
  name: string;
  ideal_for: string;
  when_to_offer: string;
  sales_angle: string;
  requires_human_confirmation: boolean;
};

type FaqItem = {
  id: string;
  question: string;
  answer: string;
};

type FollowupRules = {
  max_followups: number;
  if_no_response_after_info: {
    delay_minutes: number;
    message: string;
  };
  if_says_lo_checo: {
    delay_minutes: number;
    message: string;
  };
};

type AutonomyRules = {
  main_rule: string;
  can_do_alone: string[];
  should_not_do: string[];
};

type EscalationRules = {
  before_escalating: string;
  escalate_only_when: string[];
};

type ClosingRules = {
  goal: string;
  do_not_force_close: boolean;
  soft_close_questions: string[];
};

type PlaybookForm = {
  brandName: string;
  business_model: string;
  ideal_customer: string;
  sales_objective: string;
  offer_summary: string;
  minimum_order: string;
  average_ticket: string;
  catalog_url: string;
  shipping_policy: string;
  business_hours: string;
  tone: string;

  payment_methods: string[];
  product_offers: ProductOffer[];
  faq: FaqItem[];
  qualification_questions: string[];
  objections: string[];
  approved_replies: string[];
  forbidden_promises: string[];

  autonomy_rules: AutonomyRules;
  escalation_rules: EscalationRules;
  followup_rules: FollowupRules;
  closing_rules: ClosingRules;
};

const emptyForm: PlaybookForm = {
  brandName: "Mar Cosmetic",
  business_model: "",
  ideal_customer: "",
  sales_objective: "",
  offer_summary: "",
  minimum_order: "",
  average_ticket: "",
  catalog_url: "",
  shipping_policy: "",
  business_hours: "",
  tone: "friendly_professional",

  payment_methods: [],
  product_offers: [],
  faq: [],
  qualification_questions: [],
  objections: [],
  approved_replies: [],
  forbidden_promises: [],

  autonomy_rules: {
    main_rule:
      "Resolver la mayor parte de la conversación de forma autónoma usando preguntas de calificación, respuestas seguras y seguimiento.",
    can_do_alone: [],
    should_not_do: [],
  },

  escalation_rules: {
    before_escalating:
      "Antes de escalar, el agente debe intentar avanzar la conversación pidiendo ciudad, presupuesto, intención de compra o tipo de lote deseado.",
    escalate_only_when: [],
  },

  followup_rules: {
    max_followups: 3,
    if_no_response_after_info: {
      delay_minutes: 180,
      message: "",
    },
    if_says_lo_checo: {
      delay_minutes: 240,
      message: "",
    },
  },

  closing_rules: {
    goal:
      "Llevar al prospecto a compartir presupuesto, ciudad e intención antes de intentar cierre.",
    do_not_force_close: true,
    soft_close_questions: [],
  },
};

export default function SalesAIPlaybookPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("base");
  const [form, setForm] = useState<PlaybookForm>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const readiness = useMemo(() => {
    const checks = [
      Boolean(form.business_model),
      Boolean(form.ideal_customer),
      Boolean(form.sales_objective),
      Boolean(form.offer_summary),
      Boolean(form.minimum_order || form.average_ticket),
      form.product_offers.length > 0,
      form.qualification_questions.length > 0,
      form.objections.length > 0,
      form.autonomy_rules.can_do_alone.length > 0,
      form.autonomy_rules.should_not_do.length > 0,
      form.escalation_rules.escalate_only_when.length > 0,
      Boolean(form.followup_rules.if_no_response_after_info.message),
    ];

    const completed = checks.filter(Boolean).length;
    return Math.round((completed / checks.length) * 100);
  }, [form]);

  useEffect(() => {
    loadPlaybook();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPlaybook() {
    setLoading(true);
    setErrorMsg("");
    setMessage("");

    try {
      const res = await fetch(
        `/api/sales-ai/playbook?brandName=${encodeURIComponent(form.brandName)}`
      );

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "No se pudo cargar el playbook");
      }

      const playbook = data.playbook;

      if (!playbook) {
        setMessage("No hay playbook activo para esta marca.");
        return;
      }

      setForm({
        brandName: playbook.brand_name || form.brandName,
        business_model: playbook.business_model || "",
        ideal_customer: playbook.ideal_customer || "",
        sales_objective: playbook.sales_objective || "",
        offer_summary: playbook.offer_summary || "",
        minimum_order: playbook.minimum_order || "",
        average_ticket: playbook.average_ticket || "",
        catalog_url: playbook.catalog_url || "",
        shipping_policy: playbook.shipping_policy || "",
        business_hours: playbook.business_hours || "",
        tone: playbook.tone || "friendly_professional",

        payment_methods: asStringArray(playbook.payment_methods),
        product_offers: asProductOffers(playbook.product_offers),
        faq: asFaq(playbook.faq),
        qualification_questions: asStringArray(playbook.qualification_questions),
        objections: asStringArray(playbook.objections),
        approved_replies: asStringArray(playbook.approved_replies),
        forbidden_promises: asStringArray(playbook.forbidden_promises),

        autonomy_rules: asAutonomyRules(playbook.autonomy_rules),
        escalation_rules: asEscalationRules(playbook.escalation_rules),
        followup_rules: asFollowupRules(playbook.followup_rules),
        closing_rules: asClosingRules(playbook.closing_rules),
      });
    } catch (error: any) {
      setErrorMsg(error.message || "Error cargando playbook");
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
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          brandName: form.brandName,
          business_model: form.business_model,
          ideal_customer: form.ideal_customer,
          sales_objective: form.sales_objective,
          offer_summary: form.offer_summary,
          minimum_order: form.minimum_order,
          average_ticket: form.average_ticket,
          catalog_url: form.catalog_url,
          shipping_policy: form.shipping_policy,
          business_hours: form.business_hours,
          tone: form.tone,

          payment_methods: JSON.stringify(form.payment_methods),
          product_offers: JSON.stringify(
            form.product_offers.map(({ id, ...offer }) => offer)
          ),
          faq: JSON.stringify(form.faq.map(({ id, ...item }) => item)),
          qualification_questions: JSON.stringify(
            form.qualification_questions
          ),
          objections: JSON.stringify(form.objections),
          approved_replies: JSON.stringify(form.approved_replies),
          forbidden_promises: JSON.stringify(form.forbidden_promises),

          autonomy_rules: JSON.stringify(form.autonomy_rules),
          escalation_rules: JSON.stringify(form.escalation_rules),
          followup_rules: JSON.stringify(form.followup_rules),
          closing_rules: JSON.stringify(form.closing_rules),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "No se pudo guardar el playbook");
      }

      setMessage(
        "Playbook guardado correctamente. SALES AI ya puede leer esta configuración."
      );
    } catch (error: any) {
      setErrorMsg(error.message || "Error guardando playbook");
    } finally {
      setSaving(false);
    }
  }

  function updateField<K extends keyof PlaybookForm>(
    key: K,
    value: PlaybookForm[K]
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateArrayField(
    key:
      | "payment_methods"
      | "qualification_questions"
      | "objections"
      | "approved_replies"
      | "forbidden_promises",
    index: number,
    value: string
  ) {
    setForm((current) => {
      const next = [...current[key]];
      next[index] = value;

      return {
        ...current,
        [key]: next,
      };
    });
  }

  function addArrayItem(
    key:
      | "payment_methods"
      | "qualification_questions"
      | "objections"
      | "approved_replies"
      | "forbidden_promises",
    value = ""
  ) {
    setForm((current) => ({
      ...current,
      [key]: [...current[key], value],
    }));
  }

  function removeArrayItem(
    key:
      | "payment_methods"
      | "qualification_questions"
      | "objections"
      | "approved_replies"
      | "forbidden_promises",
    index: number
  ) {
    setForm((current) => ({
      ...current,
      [key]: current[key].filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function updateOffer(id: string, key: keyof ProductOffer, value: any) {
    setForm((current) => ({
      ...current,
      product_offers: current.product_offers.map((offer) =>
        offer.id === id ? { ...offer, [key]: value } : offer
      ),
    }));
  }

  function addOffer() {
    setForm((current) => ({
      ...current,
      product_offers: [
        ...current.product_offers,
        {
          id: createId(),
          name: "",
          ideal_for: "",
          when_to_offer: "",
          sales_angle: "",
          requires_human_confirmation: false,
        },
      ],
    }));
  }

  function removeOffer(id: string) {
    setForm((current) => ({
      ...current,
      product_offers: current.product_offers.filter((offer) => offer.id !== id),
    }));
  }

  function updateFaq(id: string, key: keyof FaqItem, value: string) {
    setForm((current) => ({
      ...current,
      faq: current.faq.map((item) =>
        item.id === id ? { ...item, [key]: value } : item
      ),
    }));
  }

  function addFaq() {
    setForm((current) => ({
      ...current,
      faq: [
        ...current.faq,
        {
          id: createId(),
          question: "",
          answer: "",
        },
      ],
    }));
  }

  function removeFaq(id: string) {
    setForm((current) => ({
      ...current,
      faq: current.faq.filter((item) => item.id !== id),
    }));
  }

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-160px] left-[12%] h-[360px] w-[360px] rounded-full bg-cyan-400/20 blur-[120px]" />
        <div className="absolute top-[260px] right-[5%] h-[420px] w-[420px] rounded-full bg-fuchsia-500/10 blur-[150px]" />
        <div className="absolute bottom-[-180px] left-[40%] h-[380px] w-[380px] rounded-full bg-blue-500/10 blur-[140px]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 py-8 space-y-8">
        <header className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6 items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-xs text-cyan-100">
              <span className="h-2 w-2 rounded-full bg-emerald-300 animate-pulse" />
              SALES AI · CONFIGURACIÓN DEL AGENTE
            </div>

            <h1 className="mt-5 text-5xl md:text-6xl font-black tracking-tight">
              Playbook <span className="text-cyan-300">Comercial</span>
            </h1>

            <p className="mt-4 max-w-3xl text-slate-300 text-lg leading-relaxed">
              Configura lo que SALES AI necesita para vender de forma autónoma:
              oferta, reglas, objeciones, respuestas, seguimiento y límites.
            </p>
          </div>

          <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-xl">
            <p className="text-xs text-slate-400">Marca activa</p>
            <input
              value={form.brandName}
              onChange={(e) => updateField("brandName", e.target.value)}
              className="mt-1 w-full bg-transparent text-2xl font-black outline-none"
            />

            <div className="mt-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-400">Preparación del agente</p>
                <p className="text-sm font-black text-cyan-300">{readiness}%</p>
              </div>

              <div className="h-3 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-cyan-300 transition-all"
                  style={{ width: `${readiness}%` }}
                />
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                onClick={loadPlaybook}
                disabled={loading}
                className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-bold hover:bg-white/15 disabled:opacity-50"
              >
                {loading ? "Cargando..." : "Cargar"}
              </button>

              <button
                onClick={savePlaybook}
                disabled={saving}
                className="rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 hover:bg-cyan-200 disabled:opacity-50"
              >
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </header>

        {message && (
          <div className="rounded-3xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-emerald-200">
            {message}
          </div>
        )}

        {errorMsg && (
          <div className="rounded-3xl border border-red-400/30 bg-red-400/10 p-4 text-red-200">
            {errorMsg}
          </div>
        )}

        <section className="grid grid-cols-1 xl:grid-cols-[280px_1fr_360px] gap-6">
          <aside className="space-y-3 xl:sticky xl:top-6 h-fit">
            <NavButton
              title="1. Base"
              description="Negocio, cliente ideal y objetivo"
              active={activeTab === "base"}
              onClick={() => setActiveTab("base")}
            />

            <NavButton
              title="2. Oferta"
              description="Productos, lotes y condiciones"
              active={activeTab === "offers"}
              onClick={() => setActiveTab("offers")}
            />

            <NavButton
              title="3. Conversación"
              description="Preguntas, objeciones y FAQ"
              active={activeTab === "conversation"}
              onClick={() => setActiveTab("conversation")}
            />

            <NavButton
              title="4. Autonomía"
              description="Reglas para operar 24/7"
              active={activeTab === "autonomy"}
              onClick={() => setActiveTab("autonomy")}
            />
          </aside>

          <section className="space-y-6">
            {activeTab === "base" && (
              <Panel
                eyebrow="Base comercial"
                title="Información esencial"
                description="Esto le dice al agente qué vende, a quién le vende y qué objetivo debe perseguir."
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <TextArea
                    label="Modelo de negocio"
                    value={form.business_model}
                    onChange={(value) => updateField("business_model", value)}
                    placeholder="Ej. Venta de lotes de maquillaje al mayoreo. No se enfoca en venta individual."
                  />

                  <TextArea
                    label="Cliente ideal"
                    value={form.ideal_customer}
                    onChange={(value) => updateField("ideal_customer", value)}
                    placeholder="Ej. Revendedoras, emprendedoras, bazares, tiendas..."
                  />

                  <TextArea
                    label="Objetivo de SALES AI"
                    value={form.sales_objective}
                    onChange={(value) => updateField("sales_objective", value)}
                    placeholder="Ej. Calificar prospectos mayoristas y avanzar la conversación hacia compra."
                    className="md:col-span-2"
                  />

                  <TextArea
                    label="Resumen de la oferta"
                    value={form.offer_summary}
                    onChange={(value) => updateField("offer_summary", value)}
                    placeholder="Ej. Mar Cosmetic vende lotes de maquillaje para revendedoras..."
                    className="md:col-span-2"
                  />
                </div>
              </Panel>
            )}

            {activeTab === "offers" && (
              <div className="space-y-6">
                <Panel
                  eyebrow="Condiciones de venta"
                  title="Compra, envíos y pagos"
                  description="Información que evita que SALES AI invente o prometa cosas no autorizadas."
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="Pedido mínimo"
                      value={form.minimum_order}
                      onChange={(value) => updateField("minimum_order", value)}
                      placeholder="Ej. Venta por lote / mínimo $1,500"
                    />

                    <Input
                      label="Ticket promedio"
                      value={form.average_ticket}
                      onChange={(value) => updateField("average_ticket", value)}
                      placeholder="Ej. $1,500 a $5,000"
                    />

                    <Input
                      label="URL de catálogo"
                      value={form.catalog_url}
                      onChange={(value) => updateField("catalog_url", value)}
                      placeholder="https://..."
                    />

                    <Input
                      label="Horario comercial"
                      value={form.business_hours}
                      onChange={(value) => updateField("business_hours", value)}
                      placeholder="Ej. SALES AI opera 24/7..."
                    />

                    <TextArea
                      label="Política de envío"
                      value={form.shipping_policy}
                      onChange={(value) => updateField("shipping_policy", value)}
                      placeholder="Ej. Los envíos se confirman según ciudad..."
                      className="md:col-span-2"
                    />

                    <ListEditor
                      title="Métodos de pago"
                      helper="El agente usará esto para orientar, no para confirmar pagos."
                      items={form.payment_methods}
                      placeholder="Ej. Transferencia bancaria"
                      onAdd={() => addArrayItem("payment_methods")}
                      onChange={(index, value) =>
                        updateArrayField("payment_methods", index, value)
                      }
                      onRemove={(index) =>
                        removeArrayItem("payment_methods", index)
                      }
                      className="md:col-span-2"
                    />
                  </div>
                </Panel>

                <Panel
                  eyebrow="Ofertas principales"
                  title="Lotes o productos que puede recomendar"
                  description="Cada tarjeta es una opción que SALES AI puede usar para guiar al prospecto."
                >
                  <div className="space-y-4">
                    {form.product_offers.map((offer, index) => (
                      <OfferCard
                        key={offer.id}
                        offer={offer}
                        index={index}
                        onChange={updateOffer}
                        onRemove={removeOffer}
                      />
                    ))}

                    <button
                      onClick={addOffer}
                      className="w-full rounded-3xl border border-dashed border-cyan-300/30 bg-cyan-300/[0.06] p-5 text-cyan-200 font-black hover:bg-cyan-300/[0.1]"
                    >
                      + Agregar lote u oferta
                    </button>
                  </div>
                </Panel>
              </div>
            )}

            {activeTab === "conversation" && (
              <div className="space-y-6">
                <Panel
                  eyebrow="Calificación"
                  title="Preguntas que debe hacer SALES AI"
                  description="Estas preguntas ayudan a evitar que el agente solo mande información y pierda la venta."
                >
                  <ListEditor
                    title="Preguntas de calificación"
                    helper="Ej. ¿Buscas para revender o para uso personal?"
                    items={form.qualification_questions}
                    placeholder="Escribe una pregunta..."
                    onAdd={() => addArrayItem("qualification_questions")}
                    onChange={(index, value) =>
                      updateArrayField("qualification_questions", index, value)
                    }
                    onRemove={(index) =>
                      removeArrayItem("qualification_questions", index)
                    }
                  />
                </Panel>

                <Panel
                  eyebrow="Objeciones"
                  title="Lo que frena la venta"
                  description="SALES AI usará estas señales para responder mejor y dar seguimiento."
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ListEditor
                      title="Objeciones frecuentes"
                      helper="Ej. Está caro, lo checo, envío, presupuesto..."
                      items={form.objections}
                      placeholder="Escribe una objeción..."
                      onAdd={() => addArrayItem("objections")}
                      onChange={(index, value) =>
                        updateArrayField("objections", index, value)
                      }
                      onRemove={(index) => removeArrayItem("objections", index)}
                    />

                    <ListEditor
                      title="Respuestas aprobadas"
                      helper="Frases seguras que el agente puede usar."
                      items={form.approved_replies}
                      placeholder="Escribe una respuesta aprobada..."
                      onAdd={() => addArrayItem("approved_replies")}
                      onChange={(index, value) =>
                        updateArrayField("approved_replies", index, value)
                      }
                      onRemove={(index) =>
                        removeArrayItem("approved_replies", index)
                      }
                    />
                  </div>
                </Panel>

                <Panel
                  eyebrow="FAQ"
                  title="Preguntas frecuentes"
                  description="Convierte dudas repetidas en respuestas claras para SALES AI."
                >
                  <div className="space-y-4">
                    {form.faq.map((item, index) => (
                      <FaqCard
                        key={item.id}
                        item={item}
                        index={index}
                        onChange={updateFaq}
                        onRemove={removeFaq}
                      />
                    ))}

                    <button
                      onClick={addFaq}
                      className="w-full rounded-3xl border border-dashed border-cyan-300/30 bg-cyan-300/[0.06] p-5 text-cyan-200 font-black hover:bg-cyan-300/[0.1]"
                    >
                      + Agregar pregunta frecuente
                    </button>
                  </div>
                </Panel>
              </div>
            )}

            {activeTab === "autonomy" && (
              <div className="space-y-6">
                <Panel
                  eyebrow="Autonomía"
                  title="Qué puede hacer SALES AI solo"
                  description="Mientras más claro esté esto, menos dependerá del humano."
                >
                  <TextArea
                    label="Regla principal del agente"
                    value={form.autonomy_rules.main_rule}
                    onChange={(value) =>
                      updateField("autonomy_rules", {
                        ...form.autonomy_rules,
                        main_rule: value,
                      })
                    }
                    placeholder="Ej. Resolver la mayor parte de la conversación..."
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <SmartList
                      title="Puede hacer solo"
                      helper="Acciones que SALES AI puede ejecutar sin pedir permiso."
                      items={form.autonomy_rules.can_do_alone}
                      placeholder="Ej. Preguntar presupuesto"
                      onAdd={() =>
                        updateField("autonomy_rules", {
                          ...form.autonomy_rules,
                          can_do_alone: [
                            ...form.autonomy_rules.can_do_alone,
                            "",
                          ],
                        })
                      }
                      onChange={(index, value) => {
                        const next = [...form.autonomy_rules.can_do_alone];
                        next[index] = value;
                        updateField("autonomy_rules", {
                          ...form.autonomy_rules,
                          can_do_alone: next,
                        });
                      }}
                      onRemove={(index) =>
                        updateField("autonomy_rules", {
                          ...form.autonomy_rules,
                          can_do_alone:
                            form.autonomy_rules.can_do_alone.filter(
                              (_, itemIndex) => itemIndex !== index
                            ),
                        })
                      }
                    />

                    <SmartList
                      title="No debe hacer"
                      helper="Límites para evitar errores o promesas falsas."
                      items={form.autonomy_rules.should_not_do}
                      placeholder="Ej. Inventar precios"
                      onAdd={() =>
                        updateField("autonomy_rules", {
                          ...form.autonomy_rules,
                          should_not_do: [
                            ...form.autonomy_rules.should_not_do,
                            "",
                          ],
                        })
                      }
                      onChange={(index, value) => {
                        const next = [...form.autonomy_rules.should_not_do];
                        next[index] = value;
                        updateField("autonomy_rules", {
                          ...form.autonomy_rules,
                          should_not_do: next,
                        });
                      }}
                      onRemove={(index) =>
                        updateField("autonomy_rules", {
                          ...form.autonomy_rules,
                          should_not_do:
                            form.autonomy_rules.should_not_do.filter(
                              (_, itemIndex) => itemIndex !== index
                            ),
                        })
                      }
                    />
                  </div>
                </Panel>

                <Panel
                  eyebrow="Escalamiento"
                  title="Cuándo sí se ocupa humano"
                  description="El agente no debe escalar por defecto. Solo cuando exista un bloqueo real."
                >
                  <TextArea
                    label="Qué debe intentar antes de escalar"
                    value={form.escalation_rules.before_escalating}
                    onChange={(value) =>
                      updateField("escalation_rules", {
                        ...form.escalation_rules,
                        before_escalating: value,
                      })
                    }
                  />

                  <div className="mt-4">
                    <SmartList
                      title="Escalar solo cuando..."
                      helper="Ej. Cliente quiere pagar, pide descuento especial o confirma stock exacto."
                      items={form.escalation_rules.escalate_only_when}
                      placeholder="Escribe una situación de escalamiento..."
                      onAdd={() =>
                        updateField("escalation_rules", {
                          ...form.escalation_rules,
                          escalate_only_when: [
                            ...form.escalation_rules.escalate_only_when,
                            "",
                          ],
                        })
                      }
                      onChange={(index, value) => {
                        const next = [
                          ...form.escalation_rules.escalate_only_when,
                        ];
                        next[index] = value;
                        updateField("escalation_rules", {
                          ...form.escalation_rules,
                          escalate_only_when: next,
                        });
                      }}
                      onRemove={(index) =>
                        updateField("escalation_rules", {
                          ...form.escalation_rules,
                          escalate_only_when:
                            form.escalation_rules.escalate_only_when.filter(
                              (_, itemIndex) => itemIndex !== index
                            ),
                        })
                      }
                    />
                  </div>
                </Panel>

                <Panel
                  eyebrow="Seguimiento"
                  title="Reglas para volver a escribir"
                  description="Aquí se configura cómo SALES AI recupera prospectos que se enfrían."
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="Máximo de seguimientos"
                      type="number"
                      value={String(form.followup_rules.max_followups)}
                      onChange={(value) =>
                        updateField("followup_rules", {
                          ...form.followup_rules,
                          max_followups: Number(value || 0),
                        })
                      }
                    />

                    <Input
                      label="Minutos si no responde"
                      type="number"
                      value={String(
                        form.followup_rules.if_no_response_after_info
                          .delay_minutes
                      )}
                      onChange={(value) =>
                        updateField("followup_rules", {
                          ...form.followup_rules,
                          if_no_response_after_info: {
                            ...form.followup_rules.if_no_response_after_info,
                            delay_minutes: Number(value || 0),
                          },
                        })
                      }
                    />

                    <TextArea
                      label="Mensaje si no responde"
                      value={
                        form.followup_rules.if_no_response_after_info.message
                      }
                      onChange={(value) =>
                        updateField("followup_rules", {
                          ...form.followup_rules,
                          if_no_response_after_info: {
                            ...form.followup_rules.if_no_response_after_info,
                            message: value,
                          },
                        })
                      }
                      className="md:col-span-2"
                    />

                    <Input
                      label="Minutos si dice “lo checo”"
                      type="number"
                      value={String(
                        form.followup_rules.if_says_lo_checo.delay_minutes
                      )}
                      onChange={(value) =>
                        updateField("followup_rules", {
                          ...form.followup_rules,
                          if_says_lo_checo: {
                            ...form.followup_rules.if_says_lo_checo,
                            delay_minutes: Number(value || 0),
                          },
                        })
                      }
                    />

                    <TextArea
                      label="Mensaje si dice “lo checo”"
                      value={form.followup_rules.if_says_lo_checo.message}
                      onChange={(value) =>
                        updateField("followup_rules", {
                          ...form.followup_rules,
                          if_says_lo_checo: {
                            ...form.followup_rules.if_says_lo_checo,
                            message: value,
                          },
                        })
                      }
                      className="md:col-span-2"
                    />
                  </div>
                </Panel>
              </div>
            )}
          </section>

          <aside className="space-y-6 xl:sticky xl:top-6 h-fit">
            <div className="rounded-[34px] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl">
              <p className="text-xs text-cyan-300 font-bold">
                AUTONOMÍA ESTIMADA
              </p>
              <h2 className="text-4xl font-black mt-2">{readiness}%</h2>

              <p className="mt-3 text-sm text-slate-400">
                Entre más información tenga el playbook, menos veces SALES AI
                necesitará intervención humana.
              </p>

              <div className="mt-6 space-y-3">
                <ReadinessItem
                  label="Oferta clara"
                  active={Boolean(form.offer_summary)}
                />
                <ReadinessItem
                  label="Cliente ideal"
                  active={Boolean(form.ideal_customer)}
                />
                <ReadinessItem
                  label="Ofertas cargadas"
                  active={form.product_offers.length > 0}
                />
                <ReadinessItem
                  label="Preguntas de venta"
                  active={form.qualification_questions.length > 0}
                />
                <ReadinessItem
                  label="Objeciones"
                  active={form.objections.length > 0}
                />
                <ReadinessItem
                  label="Reglas 24/7"
                  active={form.autonomy_rules.can_do_alone.length > 0}
                />
              </div>
            </div>

            <div className="rounded-[34px] border border-cyan-300/20 bg-cyan-300/[0.06] p-6 backdrop-blur-xl">
              <p className="text-sm text-cyan-300 font-black mb-2">
                Principio operativo
              </p>
              <p className="text-sm text-slate-200 leading-relaxed">
                SALES AI no debe comportarse como chatbot. Debe calificar,
                preguntar, recomendar, manejar objeciones y dar seguimiento. El
                humano solo entra cuando hay bloqueo real.
              </p>
            </div>

            <button
              onClick={savePlaybook}
              disabled={saving}
              className="w-full rounded-3xl bg-cyan-300 p-5 text-slate-950 font-black hover:bg-cyan-200 disabled:opacity-50"
            >
              {saving ? "Guardando configuración..." : "Guardar playbook"}
            </button>
          </aside>
        </section>
      </div>
    </main>
  );
}

function NavButton({
  title,
  description,
  active,
  onClick,
}: {
  title: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-3xl border p-5 transition ${
        active
          ? "border-cyan-300/50 bg-cyan-300/[0.08]"
          : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"
      }`}
    >
      <p className="font-black">{title}</p>
      <p className="text-xs text-slate-500 mt-1">{description}</p>
    </button>
  );
}

function Panel({
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
    <section className="rounded-[34px] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl">
      <p className="text-xs text-cyan-300 font-bold tracking-wide">{eyebrow}</p>
      <h2 className="text-3xl font-black mt-1">{title}</h2>
      <p className="text-sm text-slate-400 mt-2 mb-6">{description}</p>
      {children}
    </section>
  );
}

function Input({
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
    <div>
      <label className="text-sm text-slate-300 font-semibold">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-2xl border border-white/10 bg-[#080d1f] px-4 py-3 outline-none focus:border-cyan-400/70 text-sm text-slate-100"
      />
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-sm text-slate-300 font-semibold">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full min-h-[130px] rounded-2xl border border-white/10 bg-[#080d1f] px-4 py-3 outline-none focus:border-cyan-400/70 text-sm text-slate-100"
      />
    </div>
  );
}

function ListEditor({
  title,
  helper,
  items,
  placeholder,
  onAdd,
  onChange,
  onRemove,
  className,
}: {
  title: string;
  helper: string;
  items: string[];
  placeholder: string;
  onAdd: () => void;
  onChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <SmartList
        title={title}
        helper={helper}
        items={items}
        placeholder={placeholder}
        onAdd={onAdd}
        onChange={onChange}
        onRemove={onRemove}
      />
    </div>
  );
}

function SmartList({
  title,
  helper,
  items,
  placeholder,
  onAdd,
  onChange,
  onRemove,
}: {
  title: string;
  helper: string;
  items: string[];
  placeholder: string;
  onAdd: () => void;
  onChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-[#080d1f] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-black">{title}</h3>
          <p className="text-xs text-slate-500 mt-1">{helper}</p>
        </div>

        <button
          onClick={onAdd}
          className="rounded-2xl border border-cyan-300/30 bg-cyan-300/[0.08] px-3 py-2 text-xs font-black text-cyan-200 hover:bg-cyan-300/[0.12]"
        >
          + Agregar
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {!items.length && (
          <div className="rounded-2xl border border-dashed border-white/10 p-4 text-center text-sm text-slate-500">
            Aún no hay elementos.
          </div>
        )}

        {items.map((item, index) => (
          <div key={index} className="flex gap-2">
            <input
              value={item}
              onChange={(e) => onChange(index, e.target.value)}
              placeholder={placeholder}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 outline-none focus:border-cyan-400/70 text-sm text-slate-100"
            />

            <button
              onClick={() => onRemove(index)}
              className="rounded-2xl border border-red-400/20 bg-red-400/[0.06] px-4 text-red-200 hover:bg-red-400/[0.1]"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function OfferCard({
  offer,
  index,
  onChange,
  onRemove,
}: {
  offer: ProductOffer;
  index: number;
  onChange: (id: string, key: keyof ProductOffer, value: any) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-[#080d1f] p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-xs text-cyan-300 font-bold">OFERTA {index + 1}</p>
          <h3 className="text-xl font-black mt-1">
            {offer.name || "Nueva oferta"}
          </h3>
        </div>

        <button
          onClick={() => onRemove(offer.id)}
          className="rounded-2xl border border-red-400/20 bg-red-400/[0.06] px-4 py-2 text-sm text-red-200 hover:bg-red-400/[0.1]"
        >
          Eliminar
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Nombre del lote u oferta"
          value={offer.name}
          onChange={(value) => onChange(offer.id, "name", value)}
          placeholder="Ej. Lote económico"
        />

        <Input
          label="Ideal para"
          value={offer.ideal_for}
          onChange={(value) => onChange(offer.id, "ideal_for", value)}
          placeholder="Ej. Revendedoras que inician"
        />

        <TextArea
          label="Cuándo recomendarlo"
          value={offer.when_to_offer}
          onChange={(value) => onChange(offer.id, "when_to_offer", value)}
          placeholder="Ej. Cuando tiene presupuesto bajo..."
        />

        <TextArea
          label="Argumento de venta"
          value={offer.sales_angle}
          onChange={(value) => onChange(offer.id, "sales_angle", value)}
          placeholder="Ej. Ideal para probar rotación..."
        />
      </div>

      <div className="mt-4">
        <Toggle
          label="Requiere confirmación humana antes de ofrecer detalles exactos"
          active={offer.requires_human_confirmation}
          onChange={(value) =>
            onChange(offer.id, "requires_human_confirmation", value)
          }
        />
      </div>
    </div>
  );
}

function FaqCard({
  item,
  index,
  onChange,
  onRemove,
}: {
  item: FaqItem;
  index: number;
  onChange: (id: string, key: keyof FaqItem, value: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-[#080d1f] p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <p className="text-xs text-cyan-300 font-bold">
          PREGUNTA FRECUENTE {index + 1}
        </p>

        <button
          onClick={() => onRemove(item.id)}
          className="rounded-2xl border border-red-400/20 bg-red-400/[0.06] px-4 py-2 text-sm text-red-200 hover:bg-red-400/[0.1]"
        >
          Eliminar
        </button>
      </div>

      <div className="space-y-4">
        <Input
          label="Pregunta del cliente"
          value={item.question}
          onChange={(value) => onChange(item.id, "question", value)}
          placeholder="Ej. ¿Venden por pieza?"
        />

        <TextArea
          label="Respuesta que puede dar SALES AI"
          value={item.answer}
          onChange={(value) => onChange(item.id, "answer", value)}
          placeholder="Ej. Manejamos principalmente venta por lote al mayoreo..."
        />
      </div>
    </div>
  );
}

function Toggle({
  label,
  active,
  onChange,
}: {
  label: string;
  active: boolean;
  onChange: (active: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!active)}
      className="flex items-center justify-between gap-4 w-full rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left"
    >
      <span className="text-sm font-bold">{label}</span>

      <span
        className={`h-7 w-12 rounded-full p-1 transition ${
          active ? "bg-cyan-300" : "bg-slate-700"
        }`}
      >
        <span
          className={`block h-5 w-5 rounded-full bg-white transition ${
            active ? "translate-x-5" : ""
          }`}
        />
      </span>
    </button>
  );
}

function ReadinessItem({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#080d1f] p-4">
      <p className="text-sm font-bold">{label}</p>
      <span
        className={`h-3 w-3 rounded-full ${
          active ? "bg-emerald-300" : "bg-slate-700"
        }`}
      />
    </div>
  );
}

function asStringArray(value: any) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  return [];
}

function asProductOffers(value: any): ProductOffer[] {
  if (!Array.isArray(value)) return [];

  return value.map((offer) => ({
    id: createId(),
    name: offer?.name || "",
    ideal_for: offer?.ideal_for || "",
    when_to_offer: offer?.when_to_offer || "",
    sales_angle: offer?.sales_angle || "",
    requires_human_confirmation: Boolean(offer?.requires_human_confirmation),
  }));
}

function asFaq(value: any): FaqItem[] {
  if (!Array.isArray(value)) return [];

  return value.map((item) => ({
    id: createId(),
    question: item?.question || "",
    answer: item?.answer || "",
  }));
}

function asAutonomyRules(value: any): AutonomyRules {
  return {
    main_rule:
      value?.main_rule ||
      "Resolver la mayor parte de la conversación de forma autónoma usando preguntas de calificación, respuestas seguras y seguimiento.",
    can_do_alone: asStringArray(value?.can_do_alone),
    should_not_do: asStringArray(value?.should_not_do),
  };
}

function asEscalationRules(value: any): EscalationRules {
  return {
    before_escalating:
      value?.before_escalating ||
      "Antes de escalar, el agente debe intentar avanzar la conversación pidiendo ciudad, presupuesto, intención de compra o tipo de lote deseado.",
    escalate_only_when: asStringArray(value?.escalate_only_when),
  };
}

function asFollowupRules(value: any): FollowupRules {
  return {
    max_followups: Number(value?.max_followups || 3),
    if_no_response_after_info: {
      delay_minutes: Number(
        value?.if_no_response_after_info?.delay_minutes || 180
      ),
      message: value?.if_no_response_after_info?.message || "",
    },
    if_says_lo_checo: {
      delay_minutes: Number(value?.if_says_lo_checo?.delay_minutes || 240),
      message: value?.if_says_lo_checo?.message || "",
    },
  };
}

function asClosingRules(value: any): ClosingRules {
  return {
    goal:
      value?.goal ||
      "Llevar al prospecto a compartir presupuesto, ciudad e intención antes de intentar cierre.",
    do_not_force_close: Boolean(value?.do_not_force_close ?? true),
    soft_close_questions: asStringArray(value?.soft_close_questions),
  };
}

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}