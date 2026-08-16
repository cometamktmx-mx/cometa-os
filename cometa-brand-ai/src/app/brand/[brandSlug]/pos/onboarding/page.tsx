"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePosContext } from "../../components/pos-shell";

type ProfileCatalogItem = {
  code: string;
  name: string;
  description: string;
  icon_code: string | null;
  launch_status: "live" | "upcoming";
  sort_order: number;
};

type CapabilityCatalogItem = {
  code: string;
  name: string;
  description: string;
  category: string;
  launch_status: "live" | "upcoming";
  sort_order: number;
};

type ProfileResponse = {
  ok: true;
  profile: {
    profile_code: string;
    operation_mode: "single" | "mixed";
    onboarding_status:
      | "not_started"
      | "in_progress"
      | "completed";
    onboarding_step: number;
  };
  selectedCapabilities: Record<string, boolean>;
  profiles: ProfileCatalogItem[];
  capabilities: CapabilityCatalogItem[];
  defaultsByProfile: Record<
    string,
    Record<string, boolean>
  >;
};

type Branding = {
  display_name: string;
  logo_url: string | null;
  cover_image_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  text_color: string;
  loyalty_program_name: string;
  loyalty_message: string;
  whatsapp: string | null;
  website: string | null;
  ticket_footer: string | null;
};

type BrandingResponse = {
  ok: true;
  branding: Branding;
};

type SubscriptionResponse = {
  ok: true;
  subscription: {
    status: string;
    list_price: number;
    contracted_price: number;
    currency: string;
    price_locked: boolean;
    promotion_code: string | null;
    plan: {
      code: string;
      name: string;
      description: string;
      limits: {
        max_locations: number;
        max_registers: number;
        max_users: number;
        includes_loyalty: boolean;
        includes_digital_card: boolean;
        includes_basic_insights: boolean;
      };
    };
  };
};

const PROFILE_INITIALS: Record<string, string> = {
  fashion: "MO",
  retail: "RT",
  services: "SV",
  mixed: "MX",
  coffee_shop: "CF",
  restaurant: "RS",
  pharmacy: "FA",
};

const CAPABILITY_LABELS: Record<string, string> = {
  variants: "Variantes",
  sizes: "Tallas",
  colors: "Colores",
  direct_inventory: "Inventario directo",
  services: "Servicios",
  loyalty: "Fidelización",
  recipes: "Recetas",
  ingredients: "Ingredientes",
  modifiers: "Modificadores",
  combos: "Combos",
  tables: "Mesas",
  kitchen_tickets: "Comandas",
  batches: "Lotes",
  expiration_dates: "Caducidades",
};

export default function PosOnboardingPage() {
  const { brand } = usePosContext();

  const [profiles, setProfiles] = useState<
    ProfileCatalogItem[]
  >([]);
  const [capabilityCatalog, setCapabilityCatalog] =
    useState<CapabilityCatalogItem[]>([]);
  const [defaultsByProfile, setDefaultsByProfile] =
    useState<
      Record<string, Record<string, boolean>>
    >({});
  const [selectedProfile, setSelectedProfile] =
    useState("");
  const [operationMode, setOperationMode] =
    useState<"single" | "mixed">("single");
  const [capabilities, setCapabilities] = useState<
    Record<string, boolean>
  >({});
  const [branding, setBranding] = useState<Branding>({
    display_name: brand.name,
    logo_url: null,
    cover_image_url: null,
    primary_color: "#67E8F9",
    secondary_color: "#06111F",
    accent_color: "#34D399",
    text_color: "#FFFFFF",
    loyalty_program_name: `${brand.name} Rewards`,
    loyalty_message:
      "Cada compra te acerca a tu próxima recompensa.",
    whatsapp: null,
    website: null,
    ticket_footer: "Gracias por tu compra.",
  });
  const [subscription, setSubscription] =
    useState<SubscriptionResponse["subscription"] | null>(
      null
    );
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(
    null
  );
  const [notice, setNotice] = useState<string | null>(
    null
  );

  const loadOnboarding = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [profileData, brandingData, subscriptionData] =
        await Promise.all([
          apiRequest<ProfileResponse>(
            `/api/pos/profile?brandSlug=${encodeURIComponent(
              brand.slug
            )}`
          ),
          apiRequest<BrandingResponse>(
            `/api/pos/branding?brandSlug=${encodeURIComponent(
              brand.slug
            )}`
          ),
          apiRequest<SubscriptionResponse>(
            `/api/pos/subscription?brandSlug=${encodeURIComponent(
              brand.slug
            )}`
          ),
        ]);

      setProfiles(profileData.profiles || []);
      setCapabilityCatalog(
        profileData.capabilities || []
      );
      setDefaultsByProfile(
        profileData.defaultsByProfile || {}
      );

      if (
        profileData.profile.profile_code !==
        "unconfigured"
      ) {
        setSelectedProfile(
          profileData.profile.profile_code
        );
        setOperationMode(
          profileData.profile.operation_mode
        );
        setCapabilities(
          profileData.selectedCapabilities || {}
        );

        const persistedStep = Math.min(
          4,
          Math.max(
            1,
            profileData.profile.onboarding_step || 1
          )
        );

        setStep(persistedStep);
      }

      setBranding(brandingData.branding);
      setSubscription(subscriptionData.subscription);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [brand.slug]);

  useEffect(() => {
    loadOnboarding();
  }, [loadOnboarding]);

  const liveCapabilities = useMemo(
    () =>
      capabilityCatalog.filter(
        (capability) =>
          capability.launch_status === "live"
      ),
    [capabilityCatalog]
  );

  const enabledCapabilityNames = useMemo(
    () =>
      Object.entries(capabilities)
        .filter(([, enabled]) => enabled)
        .map(
          ([code]) =>
            CAPABILITY_LABELS[code] || code
        ),
    [capabilities]
  );

  function chooseProfile(profileCode: string) {
    const profile = profiles.find(
      (item) => item.code === profileCode
    );

    if (!profile || profile.launch_status !== "live") {
      return;
    }

    setSelectedProfile(profileCode);
    setCapabilities({
      ...(defaultsByProfile[profileCode] || {}),
    });
    setOperationMode(
      profileCode === "mixed" ? "mixed" : "single"
    );
    setError(null);
    setNotice(null);
  }

  async function saveProfile() {
    if (!selectedProfile) {
      setError("Selecciona el giro principal del negocio.");
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      setNotice(null);

      await apiRequest("/api/pos/profile", {
        method: "POST",
        body: JSON.stringify({
          brandSlug: brand.slug,
          profileCode: selectedProfile,
          operationMode,
          capabilities,
        }),
      });

      setNotice("Perfil operativo guardado correctamente.");
      setStep(3);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  async function saveBranding() {
    if (!branding.display_name.trim()) {
      setError("El nombre comercial es obligatorio.");
      return;
    }

    if (!branding.loyalty_program_name.trim()) {
      setError(
        "El nombre del programa de fidelización es obligatorio."
      );
      return;
    }

    if (!branding.loyalty_message.trim()) {
      setError(
        "El mensaje de fidelización es obligatorio."
      );
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      setNotice(null);

      await apiRequest("/api/pos/branding", {
        method: "POST",
        body: JSON.stringify({
          brandSlug: brand.slug,
          displayName: branding.display_name,
          logoUrl: branding.logo_url,
          coverImageUrl: branding.cover_image_url,
          primaryColor: branding.primary_color,
          secondaryColor: branding.secondary_color,
          accentColor: branding.accent_color,
          textColor: branding.text_color,
          loyaltyProgramName:
            branding.loyalty_program_name,
          loyaltyMessage: branding.loyalty_message,
          whatsapp: branding.whatsapp,
          website: branding.website,
          ticketFooter: branding.ticket_footer,
        }),
      });

      setNotice(
        "Identidad guardada. Ya puedes configurar la operación."
      );
      setStep(4);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  function updateBranding<K extends keyof Branding>(
    key: K,
    value: Branding[K]
  ) {
    setBranding((current) => ({
      ...current,
      [key]: value,
    }));
  }

  if (isLoading) {
    return (
      <section className="grid gap-5">
        <div className="h-72 animate-pulse rounded-[30px] bg-white/[0.035]" />
        <div className="h-[560px] animate-pulse rounded-[30px] bg-white/[0.035]" />
      </section>
    );
  }

  return (
    <section className="grid gap-5">
      <header className="relative overflow-hidden rounded-[30px] border border-white/[0.08] bg-[#081524] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.2)] md:p-8">
        <div
          className="absolute right-[-100px] top-[-140px] h-96 w-96 rounded-full blur-[120px]"
          style={{
            backgroundColor: `${branding.primary_color}22`,
          }}
        />

        <div className="relative z-10 grid gap-7 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-center">
          <div>
            <span className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.07] px-4 py-2 text-[9px] font-black uppercase tracking-[0.22em] text-cyan-200">
              Activación de Cometa POS
            </span>

            <h2 className="mt-6 max-w-4xl text-4xl font-black leading-[0.95] tracking-[-0.07em] text-white md:text-6xl">
              Configura la forma real en la que vendes.
            </h2>

            <p className="mt-5 max-w-3xl text-sm font-semibold leading-7 text-slate-500 md:text-base">
              El giro propone una configuración inicial. Las
              funciones activadas permiten adaptar el POS sin
              encerrar a {brand.name} en una sola categoría.
            </p>
          </div>

          <PlanCard subscription={subscription} />
        </div>
      </header>

      <FeedbackBanner error={error} notice={notice} />

      <div className="grid grid-cols-4 gap-2 rounded-[22px] border border-white/[0.08] bg-white/[0.025] p-2">
        {[
          ["1", "Giro"],
          ["2", "Funciones"],
          ["3", "Identidad"],
          ["4", "Operación"],
        ].map(([number, label], index) => {
          const itemStep = index + 1;
          const active = itemStep === step;
          const complete = itemStep < step;

          return (
            <button
              key={number}
              type="button"
              onClick={() => {
                if (itemStep <= step) {
                  setStep(itemStep);
                  setError(null);
                  setNotice(null);
                }
              }}
              className={`rounded-[16px] px-2 py-3 text-center transition ${
                active
                  ? "bg-cyan-300 text-slate-950"
                  : complete
                  ? "bg-emerald-300/[0.08] text-emerald-300"
                  : "text-slate-700"
              }`}
            >
              <span className="block text-[9px] font-black uppercase tracking-[0.14em]">
                {number}
              </span>
              <span className="mt-1 block text-[10px] font-black sm:text-xs">
                {label}
              </span>
            </button>
          );
        })}
      </div>

      {step === 1 ? (
        <article className="rounded-[30px] border border-white/[0.08] bg-white/[0.035] p-6 md:p-8">
          <SectionHeading
            eyebrow="Paso 1"
            title="¿Qué tipo de negocio tienes?"
            description="Selecciona la plantilla que más se parece a tu operación. Después podrás ajustar las funciones disponibles."
          />

          <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {profiles.map((profile) => {
              const selected =
                profile.code === selectedProfile;
              const upcoming =
                profile.launch_status === "upcoming";

              return (
                <button
                  key={profile.code}
                  type="button"
                  disabled={upcoming}
                  onClick={() =>
                    chooseProfile(profile.code)
                  }
                  className={`relative min-h-56 rounded-[24px] border p-5 text-left transition ${
                    selected
                      ? "border-cyan-300/40 bg-cyan-300/[0.08]"
                      : upcoming
                      ? "cursor-not-allowed border-white/[0.05] bg-white/[0.015] opacity-55"
                      : "border-white/[0.08] bg-[#06111f]/70 hover:-translate-y-1 hover:border-cyan-300/20"
                  }`}
                >
                  {upcoming ? (
                    <span className="absolute right-4 top-4 rounded-full bg-amber-300/[0.08] px-3 py-1 text-[8px] font-black uppercase tracking-[0.14em] text-amber-200">
                      Próximamente
                    </span>
                  ) : null}

                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-[16px] text-sm font-black ${
                      selected
                        ? "bg-cyan-300 text-slate-950"
                        : "bg-cyan-300/[0.08] text-cyan-300"
                    }`}
                  >
                    {PROFILE_INITIALS[profile.code] ||
                      "POS"}
                  </div>

                  <h3 className="mt-6 text-xl font-black text-white">
                    {profile.name}
                  </h3>

                  <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
                    {profile.description}
                  </p>

                  {!upcoming ? (
                    <p
                      className={`mt-5 text-xs font-black ${
                        selected
                          ? "text-cyan-300"
                          : "text-slate-700"
                      }`}
                    >
                      {selected
                        ? "Perfil seleccionado"
                        : "Seleccionar"}
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="mt-7 flex justify-end">
            <button
              type="button"
              disabled={!selectedProfile}
              onClick={() => {
                setStep(2);
                setError(null);
                setNotice(null);
              }}
              className="flex h-12 items-center justify-center rounded-[15px] bg-cyan-300 px-6 text-sm font-black text-slate-950 disabled:opacity-40"
            >
              Continuar con funciones →
            </button>
          </div>
        </article>
      ) : null}

      {step === 2 ? (
        <article className="rounded-[30px] border border-white/[0.08] bg-white/[0.035] p-6 md:p-8">
          <SectionHeading
            eyebrow="Paso 2"
            title="¿Cómo opera tu negocio?"
            description="Cometa recomienda estas funciones según el giro seleccionado. Puedes activar o desactivar las que ya están disponibles."
          />

          <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {liveCapabilities.map((capability) => {
              const enabled = Boolean(
                capabilities[capability.code]
              );

              return (
                <label
                  key={capability.code}
                  className={`flex cursor-pointer gap-4 rounded-[22px] border p-5 transition ${
                    enabled
                      ? "border-cyan-300/25 bg-cyan-300/[0.065]"
                      : "border-white/[0.08] bg-[#06111f]/70"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) =>
                      setCapabilities((current) => ({
                        ...current,
                        [capability.code]:
                          event.target.checked,
                      }))
                    }
                    className="mt-1 h-5 w-5 accent-cyan-300"
                  />

                  <div>
                    <p className="text-sm font-black text-white">
                      {capability.name}
                    </p>
                    <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">
                      {capability.description}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="mt-6 rounded-[20px] border border-white/[0.07] bg-[#06111f]/70 p-5">
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-700">
              Configuración activa
            </p>
            <p className="mt-2 text-sm font-bold leading-6 text-slate-400">
              {enabledCapabilityNames.length > 0
                ? enabledCapabilityNames.join(" · ")
                : "Ninguna función seleccionada"}
            </p>
          </div>

          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <button
              type="button"
              onClick={() => {
                setStep(1);
                setError(null);
                setNotice(null);
              }}
              className="h-12 rounded-[15px] border border-white/[0.08] px-6 text-sm font-black text-slate-400"
            >
              Volver al giro
            </button>

            <button
              type="button"
              disabled={isSaving}
              onClick={saveProfile}
              className="flex h-12 items-center justify-center rounded-[15px] bg-cyan-300 px-6 text-sm font-black text-slate-950 disabled:opacity-50"
            >
              {isSaving
                ? "Guardando..."
                : "Guardar perfil operativo →"}
            </button>
          </div>
        </article>
      ) : null}

      {step === 3 ? (
        <article className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="rounded-[30px] border border-white/[0.08] bg-white/[0.035] p-6 md:p-8">
            <SectionHeading
              eyebrow="Paso 3"
              title="Identidad de tu negocio"
              description="Esta información alimentará el POS, los tickets y la tarjeta digital personalizada."
            />

            <div className="mt-7 grid gap-4">
              <Field
                label="Nombre comercial"
                value={branding.display_name}
                onChange={(value) =>
                  updateBranding(
                    "display_name",
                    value
                  )
                }
                placeholder={brand.name}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="URL del logotipo"
                  value={branding.logo_url || ""}
                  onChange={(value) =>
                    updateBranding(
                      "logo_url",
                      value || null
                    )
                  }
                  placeholder="https://..."
                />

                <Field
                  label="URL de portada"
                  value={
                    branding.cover_image_url || ""
                  }
                  onChange={(value) =>
                    updateBranding(
                      "cover_image_url",
                      value || null
                    )
                  }
                  placeholder="Opcional"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <ColorField
                  label="Principal"
                  value={branding.primary_color}
                  onChange={(value) =>
                    updateBranding(
                      "primary_color",
                      value
                    )
                  }
                />

                <ColorField
                  label="Secundario"
                  value={branding.secondary_color}
                  onChange={(value) =>
                    updateBranding(
                      "secondary_color",
                      value
                    )
                  }
                />

                <ColorField
                  label="Acento"
                  value={branding.accent_color}
                  onChange={(value) =>
                    updateBranding(
                      "accent_color",
                      value
                    )
                  }
                />

                <ColorField
                  label="Texto"
                  value={branding.text_color}
                  onChange={(value) =>
                    updateBranding(
                      "text_color",
                      value
                    )
                  }
                />
              </div>

              <Field
                label="Nombre del programa"
                value={
                  branding.loyalty_program_name
                }
                onChange={(value) =>
                  updateBranding(
                    "loyalty_program_name",
                    value
                  )
                }
                placeholder="Tivana Rewards"
              />

              <label className="grid gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                  Mensaje de fidelización
                </span>

                <textarea
                  rows={3}
                  value={branding.loyalty_message}
                  onChange={(event) =>
                    updateBranding(
                      "loyalty_message",
                      event.target.value
                    )
                  }
                  className="rounded-[15px] border border-white/[0.08] bg-[#06111f] px-4 py-3 text-sm font-bold text-white outline-none focus:border-cyan-300/30"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="WhatsApp"
                  value={branding.whatsapp || ""}
                  onChange={(value) =>
                    updateBranding(
                      "whatsapp",
                      value || null
                    )
                  }
                  placeholder="4450000000"
                />

                <Field
                  label="Sitio web"
                  value={branding.website || ""}
                  onChange={(value) =>
                    updateBranding(
                      "website",
                      value || null
                    )
                  }
                  placeholder="https://..."
                />
              </div>

              <Field
                label="Mensaje del ticket"
                value={
                  branding.ticket_footer || ""
                }
                onChange={(value) =>
                  updateBranding(
                    "ticket_footer",
                    value || null
                  )
                }
                placeholder="Gracias por tu compra."
              />

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setStep(2);
                    setError(null);
                    setNotice(null);
                  }}
                  className="h-12 rounded-[15px] border border-white/[0.08] px-6 text-sm font-black text-slate-400"
                >
                  Volver a funciones
                </button>

                <button
                  type="button"
                  disabled={isSaving}
                  onClick={saveBranding}
                  className="flex h-12 items-center justify-center rounded-[15px] bg-cyan-300 px-6 text-sm font-black text-slate-950 disabled:opacity-50"
                >
                  {isSaving
                    ? "Guardando..."
                    : "Guardar identidad →"}
                </button>
              </div>
            </div>
          </div>

          <LoyaltyPreview branding={branding} />
        </article>
      ) : null}

      {step === 4 ? (
        <article className="rounded-[30px] border border-emerald-300/15 bg-emerald-300/[0.045] p-7 text-center md:p-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] bg-emerald-300 text-xl font-black text-slate-950">
            ✓
          </div>

          <p className="mt-6 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-300">
            Primera configuración completada
          </p>

          <h3 className="mt-3 text-3xl font-black tracking-[-0.06em] text-white md:text-5xl">
            {branding.display_name} ya tiene perfil e identidad.
          </h3>

          <p className="mx-auto mt-4 max-w-2xl text-sm font-semibold leading-7 text-slate-500">
            Tu sucursal Principal y Caja 1 ya están listas. Agrega
            tu primer producto para comenzar a operar.
          </p>

          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href={`/brand/${brand.slug}/pos/products`}
              className="flex h-12 items-center justify-center rounded-[15px] bg-cyan-300 px-6 text-sm font-black text-slate-950"
            >
              Crear mi primer producto
            </Link>

            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex h-12 items-center justify-center rounded-[15px] border border-white/[0.08] px-6 text-sm font-black text-slate-400"
            >
              Revisar onboarding
            </button>
          </div>
        </article>
      ) : null}
    </section>
  );
}

function PlanCard({
  subscription,
}: {
  subscription:
    | SubscriptionResponse["subscription"]
    | null;
}) {
  if (!subscription) return null;

  const hasDiscount =
    Number(subscription.contracted_price) !==
    Number(subscription.list_price);

  return (
    <div className="rounded-[26px] border border-white/[0.08] bg-white/[0.035] p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-600">
            Plan asignado
          </p>
          <p className="mt-2 text-lg font-black text-white">
            {subscription.plan.name}
          </p>
        </div>

        <span className="rounded-full bg-cyan-300/[0.08] px-3 py-2 text-[8px] font-black uppercase tracking-[0.14em] text-cyan-300">
          {subscription.status}
        </span>
      </div>

      <p className="mt-5 text-4xl font-black tracking-[-0.07em] text-white">
        {formatMoney(
          subscription.contracted_price,
          subscription.currency
        )}
        <span className="ml-1 text-xs tracking-normal text-slate-600">
          /mes
        </span>
      </p>

      {hasDiscount ? (
        <p className="mt-2 text-xs font-semibold text-emerald-300">
          Precio regular{" "}
          <span className="line-through">
            {formatMoney(
              subscription.list_price,
              subscription.currency
            )}
          </span>
        </p>
      ) : (
        <p className="mt-2 text-xs font-semibold text-slate-600">
          Precio regular del plan
        </p>
      )}

      <div className="mt-5 grid grid-cols-3 gap-2">
        <PlanLimit
          value={
            subscription.plan.limits.max_locations
          }
          label="Sucursal"
        />
        <PlanLimit
          value={
            subscription.plan.limits.max_registers
          }
          label="Caja"
        />
        <PlanLimit
          value={
            subscription.plan.limits.max_users
          }
          label="Usuarios"
        />
      </div>
    </div>
  );
}

function PlanLimit({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  return (
    <div className="rounded-[14px] bg-[#06111f]/80 p-3 text-center">
      <p className="text-lg font-black text-white">
        {value}
      </p>
      <p className="mt-1 text-[7px] font-black uppercase tracking-[0.12em] text-slate-700">
        {label}
      </p>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="border-b border-white/[0.08] pb-5">
      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-300">
        {eyebrow}
      </p>
      <h3 className="mt-2 text-3xl font-black tracking-[-0.06em] text-white">
        {title}
      </h3>
      <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
        {description}
      </p>
    </div>
  );
}

function LoyaltyPreview({
  branding,
}: {
  branding: Branding;
}) {
  return (
    <div className="rounded-[30px] border border-white/[0.08] bg-white/[0.035] p-6">
      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-600">
        Vista previa
      </p>
      <h3 className="mt-2 text-xl font-black text-white">
        Tarjeta de fidelización
      </h3>

      <div
        className="relative mt-6 min-h-[440px] overflow-hidden rounded-[28px] border border-white/10 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.32)]"
        style={{
          background: `linear-gradient(145deg, ${branding.secondary_color}, ${branding.primary_color}66)`,
          color: branding.text_color,
        }}
      >
        <div
          className="absolute right-[-80px] top-[-80px] h-64 w-64 rounded-full blur-[80px]"
          style={{
            backgroundColor: `${branding.accent_color}66`,
          }}
        />

        <div className="relative z-10 flex min-h-[390px] flex-col">
          <div className="flex items-center justify-between gap-4">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-[15px] border border-white/15 bg-white/10">
              {branding.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={branding.logo_url}
                  alt={branding.display_name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-sm font-black">
                  {branding.display_name
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
              )}
            </div>

            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-2 text-[8px] font-black uppercase tracking-[0.14em]">
              Miembro
            </span>
          </div>

          <p className="mt-8 text-[10px] font-black uppercase tracking-[0.18em] opacity-70">
            {branding.loyalty_program_name}
          </p>

          <h4 className="mt-2 text-3xl font-black tracking-[-0.06em]">
            Camila Hernández
          </h4>

          <div className="mt-8 grid grid-cols-2 gap-3">
            <div className="rounded-[18px] border border-white/10 bg-white/10 p-4">
              <p className="text-[8px] font-black uppercase tracking-[0.14em] opacity-65">
                Puntos
              </p>
              <p className="mt-2 text-3xl font-black">
                480
              </p>
            </div>

            <div className="rounded-[18px] border border-white/10 bg-white/10 p-4">
              <p className="text-[8px] font-black uppercase tracking-[0.14em] opacity-65">
                Nivel
              </p>
              <p className="mt-2 text-xl font-black">
                Plata
              </p>
            </div>
          </div>

          <div className="mt-auto flex items-end justify-between gap-4 pt-8">
            <p className="max-w-[210px] text-xs font-bold leading-5 opacity-75">
              {branding.loyalty_message}
            </p>

            <div className="grid h-20 w-20 grid-cols-5 gap-1 rounded-[14px] bg-white p-3">
              {Array.from({ length: 25 }).map(
                (_, index) => (
                  <span
                    key={index}
                    className={`rounded-[1px] ${
                      [
                        0, 1, 2, 5, 7, 10, 11, 12,
                        14, 16, 18, 20, 21, 22, 24,
                      ].includes(index)
                        ? "bg-slate-950"
                        : "bg-transparent"
                    }`}
                  />
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
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
    <label className="grid gap-2">
      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </span>

      <input
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        placeholder={placeholder}
        className="h-12 rounded-[15px] border border-white/[0.08] bg-[#06111f] px-4 text-sm font-bold text-white outline-none placeholder:text-slate-700 focus:border-cyan-300/30"
      />
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-600">
        {label}
      </span>

      <div className="flex h-12 items-center gap-3 rounded-[15px] border border-white/[0.08] bg-[#06111f] px-3">
        <input
          type="color"
          value={value}
          onChange={(event) =>
            onChange(
              event.target.value.toUpperCase()
            )
          }
          className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
        />

        <input
          value={value}
          onChange={(event) =>
            onChange(
              event.target.value.toUpperCase()
            )
          }
          maxLength={7}
          className="min-w-0 flex-1 bg-transparent text-xs font-black text-white outline-none"
        />
      </div>
    </label>
  );
}

function FeedbackBanner({
  error,
  notice,
}: {
  error: string | null;
  notice: string | null;
}) {
  if (!error && !notice) return null;

  return (
    <div
      className={`rounded-[20px] border px-5 py-4 text-sm font-bold ${
        error
          ? "border-rose-300/20 bg-rose-300/[0.08] text-rose-200"
          : "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-200"
      }`}
    >
      {error || notice}
    </div>
  );
}

function formatMoney(
  value: number,
  currency = "MXN"
) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

async function apiRequest<T = unknown>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const data = await response.json();

  if (!response.ok || !data?.ok) {
    throw new Error(
      data?.error ||
        data?.message ||
        "No se pudo completar la operación."
    );
  }

  return data as T;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado.";
}
