"use client";

import Link from "next/link";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePosContext } from "../../components/pos-shell";
import { buildPosHref } from "../../components/pos-sidebar";
import { PosIcon } from "../../components/pos-icons";

type Location = {
  id: string;
  name: string;
  code: string;
  phone: string | null;
  email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string;
  timezone: string;
  currency: string;
  tax_name: string;
  tax_rate: number;
  prices_include_tax: boolean;
  active: boolean;
};

type Register = {
  id: string;
  location_id: string;
  name: string;
  code: string;
  printer_name: string | null;
  status: "available" | "disabled";
  location?: {
    id: string;
    name: string;
    code: string;
  } | null;
};

type BootstrapResponse = {
  ok: true;
  profile: {
    profile_code: string;
    onboarding_status: string;
    profile: {
      code: string;
      name: string;
      description: string;
    };
  };
  capabilities: Record<string, boolean>;
  branding: {
    display_name: string;
    primary_color: string;
    secondary_color: string;
    accent_color: string;
    loyalty_program_name: string;
  };
  subscription: {
    status: string;
    list_price: number;
    contracted_price: number;
    currency: string;
    price_locked: boolean;
    promotion_code: string | null;
    plan: {
      name: string;
      limits: {
        max_locations: number;
        max_registers: number;
        max_users: number;
      };
    };
  };
  locations: Location[];
  registers: Register[];
  setup: {
    completedSteps: number;
    totalSteps: number;
    percentage: number;
  };
};

const CAPABILITY_LABELS: Record<string, string> = {
  variants: "Variantes",
  sizes: "Tallas",
  colors: "Colores",
  direct_inventory: "Inventario",
  services: "Servicios",
  loyalty: "Fidelización",
};

const EMPTY_LOCATION_FORM = {
  name: "",
  code: "",
  phone: "",
  email: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "MX",
  timezone: "America/Mexico_City",
  currency: "MXN",
  taxName: "IVA",
  taxRate: "16",
  pricesIncludeTax: true,
};

const EMPTY_REGISTER_FORM = {
  locationId: "",
  name: "",
  code: "",
  printerName: "",
};

export default function PosSettingsPage() {
  const { brand } = usePosContext();

  const [bootstrap, setBootstrap] =
    useState<BootstrapResponse | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [registers, setRegisters] = useState<Register[]>([]);
  const [locationForm, setLocationForm] =
    useState(EMPTY_LOCATION_FORM);
  const [registerForm, setRegisterForm] =
    useState(EMPTY_REGISTER_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingLocation, setIsSavingLocation] =
    useState(false);
  const [isSavingRegister, setIsSavingRegister] =
    useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadConfiguration = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const data = await apiRequest<BootstrapResponse>(
        `/api/pos/bootstrap?brandSlug=${encodeURIComponent(
          brand.slug
        )}`
      );

      setBootstrap(data);
      setLocations(data.locations || []);
      setRegisters(data.registers || []);

      setRegisterForm((current) => ({
        ...current,
        locationId:
          current.locationId ||
          data.locations?.[0]?.id ||
          "",
      }));
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [brand.slug]);

  useEffect(() => {
    loadConfiguration();
  }, [loadConfiguration]);

  const activeLocations = useMemo(
    () =>
      locations.filter(
        (location) => location.active
      ),
    [locations]
  );

  const enabledCapabilities = useMemo(() => {
    if (!bootstrap) return [];

    return Object.entries(bootstrap.capabilities)
      .filter(([, enabled]) => enabled)
      .map(
        ([code]) =>
          CAPABILITY_LABELS[code] || code
      );
  }, [bootstrap]);

  const locationLimit =
    bootstrap?.subscription.plan.limits
      .max_locations || 1;

  const registerLimit =
    bootstrap?.subscription.plan.limits
      .max_registers || 1;

  const canCreateLocation =
    Boolean(bootstrap) &&
    bootstrap!.profile.profile_code !==
      "unconfigured" &&
    locations.length < locationLimit;

  const canCreateRegister =
    activeLocations.length > 0 &&
    registers.length < registerLimit;

  async function handleCreateLocation(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    try {
      setIsSavingLocation(true);
      setError(null);
      setNotice(null);

      const response = await apiRequest<{
        ok: true;
        location: Location;
      }>("/api/pos/locations", {
        method: "POST",
        body: JSON.stringify({
          brandSlug: brand.slug,
          ...locationForm,
          taxRate: Number(
            locationForm.taxRate || 0
          ),
        }),
      });

      setNotice(
        `Sucursal “${response.location.name}” creada correctamente.`
      );

      setLocationForm(EMPTY_LOCATION_FORM);

      setRegisterForm((current) => ({
        ...current,
        locationId: response.location.id,
      }));

      await loadConfiguration();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSavingLocation(false);
    }
  }

  async function handleCreateRegister(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    try {
      setIsSavingRegister(true);
      setError(null);
      setNotice(null);

      const response = await apiRequest<{
        ok: true;
        register: Register;
      }>("/api/pos/registers", {
        method: "POST",
        body: JSON.stringify({
          brandSlug: brand.slug,
          ...registerForm,
        }),
      });

      setNotice(
        `Caja “${response.register.name}” creada correctamente.`
      );

      setRegisterForm((current) => ({
        ...EMPTY_REGISTER_FORM,
        locationId: current.locationId,
      }));

      await loadConfiguration();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSavingRegister(false);
    }
  }

  if (isLoading || !bootstrap) {
    return (
      <section className="grid gap-5">
        <div className="h-72 animate-pulse rounded-[30px] bg-white/[0.035]" />
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="h-[620px] animate-pulse rounded-[30px] bg-white/[0.035]" />
          <div className="h-[620px] animate-pulse rounded-[30px] bg-white/[0.035]" />
        </div>
      </section>
    );
  }

  const profileConfigured =
    bootstrap.profile.profile_code !==
    "unconfigured";

  return (
    <section className="grid gap-5">
      <header className="relative overflow-hidden rounded-[30px] border border-white/[0.08] bg-[#081524] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.2)] md:p-8">
        <div
          className="absolute right-[-100px] top-[-120px] h-80 w-80 rounded-full blur-[100px]"
          style={{
            backgroundColor: `${bootstrap.branding.primary_color}22`,
          }}
        />

        <div className="relative z-10 grid gap-7 xl:grid-cols-[minmax(0,1fr)_330px] xl:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.07] px-4 py-2 text-[9px] font-black uppercase tracking-[0.22em] text-cyan-200">
                Configuración operativa
              </span>

              <span className="rounded-full border border-amber-300/15 bg-amber-300/[0.07] px-4 py-2 text-[9px] font-black uppercase tracking-[0.18em] text-amber-200">
                Plan controlado
              </span>
            </div>

            <h2 className="mt-6 max-w-4xl text-4xl font-black leading-[0.95] tracking-[-0.07em] text-white md:text-6xl">
              Perfil, sucursal y caja bajo control.
            </h2>

            <p className="mt-5 max-w-3xl text-sm font-semibold leading-7 text-slate-500 md:text-base">
              La identidad define cómo se verá Cometa POS.
              La sucursal y Caja 01 definen dónde comienza la
              operación real de {brand.name}.
            </p>
          </div>

          <div className="rounded-[26px] border border-white/[0.08] bg-white/[0.035] p-5">
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-600">
                Preparación
              </p>

              <span className="rounded-full bg-cyan-300/[0.08] px-3 py-1 text-[9px] font-black text-cyan-300">
                {bootstrap.setup.completedSteps}/
                {bootstrap.setup.totalSteps}
              </span>
            </div>

            <p className="mt-5 text-5xl font-black tracking-[-0.08em] text-white">
              {bootstrap.setup.percentage}%
            </p>

            <p className="mt-2 text-xs font-semibold text-slate-500">
              Configuración completada
            </p>

            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-cyan-300 transition-all"
                style={{
                  width: `${bootstrap.setup.percentage}%`,
                }}
              />
            </div>
          </div>
        </div>
      </header>

      <FeedbackBanner
        error={error}
        notice={notice}
      />

      <section className="grid gap-4 xl:grid-cols-3">
        <SummaryCard
          eyebrow="Perfil"
          title={
            bootstrap.profile.profile?.name ||
            "Sin configurar"
          }
          description={
            profileConfigured
              ? enabledCapabilities.join(" · ")
              : "Selecciona el giro y las funciones del negocio."
          }
          actionLabel={
            profileConfigured
              ? "Editar perfil"
              : "Configurar perfil"
          }
          href={`/brand/${brand.slug}/pos/onboarding`}
          accent={
            bootstrap.branding.primary_color
          }
        />

        <SummaryCard
          eyebrow="Identidad"
          title={
            bootstrap.branding
              .loyalty_program_name
          }
          description={`${bootstrap.branding.display_name} · tarjeta digital personalizada`}
          actionLabel="Editar identidad"
          href={`/brand/${brand.slug}/pos/onboarding`}
          accent={
            bootstrap.branding.accent_color
          }
        />

        <PlanSummary
          subscription={bootstrap.subscription}
          locations={locations.length}
          registers={registers.length}
        />
      </section>

      {!profileConfigured ? (
        <div className="rounded-[24px] border border-amber-300/15 bg-amber-300/[0.055] p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-200">
                Configuración requerida
              </p>
              <h3 className="mt-2 text-xl font-black text-white">
                Define primero el tipo de negocio
              </h3>
              <p className="mt-2 text-sm font-semibold text-slate-500">
                No se podrán crear sucursales ni cajas hasta
                completar el onboarding.
              </p>
            </div>

            <Link
              href={`/brand/${brand.slug}/pos/onboarding`}
              className="flex h-11 items-center justify-center rounded-[14px] bg-amber-300 px-5 text-sm font-black text-slate-950"
            >
              Abrir onboarding
            </Link>
          </div>
        </div>
      ) : null}

      <section className="grid gap-5 2xl:grid-cols-2">
        <article className="rounded-[30px] border border-white/[0.08] bg-white/[0.035] p-6">
          <SectionTitle
            icon="store"
            eyebrow="Paso operativo 01"
            title="Sucursal"
            description="Ubicación, moneda, impuestos y datos del punto de operación."
          />

          {locations.length >= locationLimit ? (
            <LimitReached
              title="Sucursal incluida configurada"
              description={`Tu plan incluye ${locationLimit} sucursal. La operación actual ya utiliza ese espacio.`}
            />
          ) : (
            <form
              className="mt-6 grid gap-4"
              onSubmit={handleCreateLocation}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Nombre de la sucursal"
                  required
                  value={locationForm.name}
                  onChange={(value) =>
                    setLocationForm((current) => ({
                      ...current,
                      name: value,
                    }))
                  }
                  placeholder="Sucursal Centro"
                />

                <Field
                  label="Código"
                  value={locationForm.code}
                  onChange={(value) =>
                    setLocationForm((current) => ({
                      ...current,
                      code: value.toUpperCase(),
                    }))
                  }
                  placeholder="CENTRO"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Teléfono"
                  value={locationForm.phone}
                  onChange={(value) =>
                    setLocationForm((current) => ({
                      ...current,
                      phone: value,
                    }))
                  }
                  placeholder="445 000 0000"
                />

                <Field
                  label="Correo"
                  type="email"
                  value={locationForm.email}
                  onChange={(value) =>
                    setLocationForm((current) => ({
                      ...current,
                      email: value,
                    }))
                  }
                  placeholder="sucursal@marca.com"
                />
              </div>

              <Field
                label="Dirección"
                value={locationForm.addressLine1}
                onChange={(value) =>
                  setLocationForm((current) => ({
                    ...current,
                    addressLine1: value,
                  }))
                }
                placeholder="Calle, número y colonia"
              />

              <div className="grid gap-4 md:grid-cols-3">
                <Field
                  label="Ciudad"
                  value={locationForm.city}
                  onChange={(value) =>
                    setLocationForm((current) => ({
                      ...current,
                      city: value,
                    }))
                  }
                  placeholder="Moroleón"
                />

                <Field
                  label="Estado"
                  value={locationForm.state}
                  onChange={(value) =>
                    setLocationForm((current) => ({
                      ...current,
                      state: value,
                    }))
                  }
                  placeholder="Guanajuato"
                />

                <Field
                  label="Código postal"
                  value={locationForm.postalCode}
                  onChange={(value) =>
                    setLocationForm((current) => ({
                      ...current,
                      postalCode: value,
                    }))
                  }
                  placeholder="38800"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <SelectField
                  label="Moneda"
                  value={locationForm.currency}
                  onChange={(value) =>
                    setLocationForm((current) => ({
                      ...current,
                      currency: value,
                    }))
                  }
                  options={[
                    ["MXN", "Peso mexicano"],
                    [
                      "USD",
                      "Dólar estadounidense",
                    ],
                  ]}
                />

                <Field
                  label="Impuesto"
                  value={locationForm.taxName}
                  onChange={(value) =>
                    setLocationForm((current) => ({
                      ...current,
                      taxName: value,
                    }))
                  }
                  placeholder="IVA"
                />

                <Field
                  label="Tasa %"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={locationForm.taxRate}
                  onChange={(value) =>
                    setLocationForm((current) => ({
                      ...current,
                      taxRate: value,
                    }))
                  }
                  placeholder="16"
                />
              </div>

              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-[18px] border border-white/[0.08] bg-[#06111f]/80 p-4">
                <div>
                  <p className="text-sm font-black text-white">
                    Precios con impuesto incluido
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-600">
                    El precio mostrado ya representa el total
                    final.
                  </p>
                </div>

                <input
                  type="checkbox"
                  checked={
                    locationForm.pricesIncludeTax
                  }
                  onChange={(event) =>
                    setLocationForm((current) => ({
                      ...current,
                      pricesIncludeTax:
                        event.target.checked,
                    }))
                  }
                  className="h-5 w-5 accent-cyan-300"
                />
              </label>

              <button
                type="submit"
                disabled={
                  isSavingLocation ||
                  !canCreateLocation
                }
                className="flex h-12 items-center justify-center rounded-[16px] bg-cyan-300 px-6 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isSavingLocation
                  ? "Guardando sucursal..."
                  : "Crear sucursal"}
              </button>
            </form>
          )}

          <div className="mt-7 border-t border-white/[0.08] pt-6">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-600">
              Sucursales configuradas
            </p>

            <div className="mt-4 grid gap-3">
              {locations.length > 0 ? (
                locations.map((location) => (
                  <div
                    key={location.id}
                    className="rounded-[20px] border border-white/[0.07] bg-[#06111f]/80 p-4"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-cyan-300/[0.08] text-cyan-300">
                        <PosIcon
                          name="store"
                          className="h-5 w-5"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-white">
                          {location.name}
                        </p>
                        <p className="mt-1 truncate text-xs font-semibold text-slate-600">
                          {location.city ||
                            "Ciudad pendiente"}{" "}
                          · {location.code}
                        </p>
                      </div>

                      <span className="rounded-full bg-emerald-400/[0.08] px-3 py-2 text-[8px] font-black uppercase tracking-[0.14em] text-emerald-300">
                        Activa
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <MiniMetric
                        label="Moneda"
                        value={location.currency}
                      />
                      <MiniMetric
                        label="Impuesto"
                        value={`${location.tax_rate}%`}
                      />
                      <MiniMetric
                        label="Precios"
                        value={
                          location.prices_include_tax
                            ? "Con IVA"
                            : "Sin IVA"
                        }
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-[18px] border border-dashed border-white/[0.08] p-5 text-center text-sm font-semibold text-slate-600">
                  Aún no hay sucursales registradas.
                </p>
              )}
            </div>
          </div>
        </article>

        <article className="rounded-[30px] border border-white/[0.08] bg-white/[0.035] p-6">
          <SectionTitle
            icon="cash"
            eyebrow="Paso operativo 02"
            title="Caja"
            description="Terminal que abrirá turno y procesará las ventas."
          />

          {registers.length >= registerLimit ? (
            <LimitReached
              title="Caja incluida configurada"
              description={`Tu plan incluye ${registerLimit} caja. Ya está lista para abrir turnos.`}
            />
          ) : activeLocations.length === 0 ? (
            <EmptyState
              title="Primero crea una sucursal"
              description="Cada caja debe pertenecer a una ubicación operativa."
            />
          ) : (
            <form
              className="mt-6 grid gap-4"
              onSubmit={handleCreateRegister}
            >
              <SelectField
                label="Sucursal"
                required
                value={registerForm.locationId}
                onChange={(value) =>
                  setRegisterForm((current) => ({
                    ...current,
                    locationId: value,
                  }))
                }
                options={activeLocations.map(
                  (location) => [
                    location.id,
                    `${location.name} · ${location.code}`,
                  ]
                )}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Nombre de la caja"
                  required
                  value={registerForm.name}
                  onChange={(value) =>
                    setRegisterForm((current) => ({
                      ...current,
                      name: value,
                    }))
                  }
                  placeholder="Caja 01"
                />

                <Field
                  label="Código"
                  value={registerForm.code}
                  onChange={(value) =>
                    setRegisterForm((current) => ({
                      ...current,
                      code: value.toUpperCase(),
                    }))
                  }
                  placeholder="CAJA01"
                />
              </div>

              <Field
                label="Impresora o dispositivo"
                value={registerForm.printerName}
                onChange={(value) =>
                  setRegisterForm((current) => ({
                    ...current,
                    printerName: value,
                  }))
                }
                placeholder="Opcional"
              />

              <button
                type="submit"
                disabled={
                  isSavingRegister ||
                  !canCreateRegister
                }
                className="flex h-12 items-center justify-center rounded-[16px] bg-cyan-300 px-6 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isSavingRegister
                  ? "Guardando caja..."
                  : "Crear Caja 01"}
              </button>
            </form>
          )}

          <div className="mt-7 border-t border-white/[0.08] pt-6">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-600">
              Cajas configuradas
            </p>

            <div className="mt-4 grid gap-3">
              {registers.length > 0 ? (
                registers.map((register) => (
                  <div
                    key={register.id}
                    className="flex items-center gap-4 rounded-[20px] border border-white/[0.07] bg-[#06111f]/80 p-4"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-cyan-300/[0.08] text-cyan-300">
                      <PosIcon
                        name="cash"
                        className="h-5 w-5"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-white">
                        {register.name}
                      </p>
                      <p className="mt-1 truncate text-xs font-semibold text-slate-600">
                        {register.location?.name ||
                          "Sucursal"}{" "}
                        · {register.code}
                      </p>
                    </div>

                    <span className="rounded-full bg-emerald-400/[0.08] px-3 py-2 text-[8px] font-black uppercase tracking-[0.14em] text-emerald-300">
                      Disponible
                    </span>
                  </div>
                ))
              ) : (
                <p className="rounded-[18px] border border-dashed border-white/[0.08] p-5 text-center text-sm font-semibold text-slate-600">
                  Aún no hay cajas registradas.
                </p>
              )}
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <NextModuleCard
          icon="product"
          title="Productos"
          description="El siguiente bloque adaptará el catálogo al giro seleccionado."
          href={buildPosHref(
            brand.slug,
            "products"
          )}
        />

        <NextModuleCard
          icon="cash"
          title="Abrir turno"
          description="Con Caja 01 lista podrás registrar el fondo inicial."
          href={buildPosHref(
            brand.slug,
            "cash"
          )}
        />

        <NextModuleCard
          icon="sale"
          title="Terminal"
          description="El Register final se conectará después del Product Engine."
          href={buildPosHref(
            brand.slug,
            "register"
          )}
        />
      </section>
    </section>
  );
}

function SummaryCard({
  eyebrow,
  title,
  description,
  actionLabel,
  href,
  accent,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel: string;
  href: string;
  accent: string;
}) {
  return (
    <article className="rounded-[24px] border border-white/[0.08] bg-white/[0.035] p-5">
      <div
        className="h-1 w-14 rounded-full"
        style={{ backgroundColor: accent }}
      />

      <p className="mt-5 text-[9px] font-black uppercase tracking-[0.18em] text-slate-600">
        {eyebrow}
      </p>

      <h3 className="mt-2 text-xl font-black text-white">
        {title}
      </h3>

      <p className="mt-2 min-h-12 text-xs font-semibold leading-5 text-slate-600">
        {description}
      </p>

      <Link
        href={href}
        className="mt-5 inline-flex text-xs font-black text-cyan-300"
      >
        {actionLabel} →
      </Link>
    </article>
  );
}

function PlanSummary({
  subscription,
  locations,
  registers,
}: {
  subscription: BootstrapResponse["subscription"];
  locations: number;
  registers: number;
}) {
  const limits = subscription.plan.limits;
  const hasDiscount =
    Number(subscription.contracted_price) !==
    Number(subscription.list_price);

  return (
    <article className="rounded-[24px] border border-white/[0.08] bg-white/[0.035] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-600">
            Suscripción
          </p>

          <h3 className="mt-2 text-xl font-black text-white">
            {subscription.plan.name}
          </h3>
        </div>

        <span className="rounded-full bg-cyan-300/[0.08] px-3 py-2 text-[8px] font-black uppercase text-cyan-300">
          {subscription.status}
        </span>
      </div>

      <p className="mt-4 text-3xl font-black tracking-[-0.06em] text-white">
        {formatMoney(
          subscription.contracted_price,
          subscription.currency
        )}
        <span className="ml-1 text-xs tracking-normal text-slate-600">
          /mes
        </span>
      </p>

      {hasDiscount ? (
        <p className="mt-1 text-xs font-bold text-emerald-300">
          Precio regular{" "}
          <span className="line-through">
            {formatMoney(
              subscription.list_price,
              subscription.currency
            )}
          </span>
        </p>
      ) : (
        <p className="mt-1 text-xs font-semibold text-slate-600">
          Precio regular asignado
        </p>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2">
        <UsageMetric
          label="Sucursales"
          value={`${locations}/${limits.max_locations}`}
        />
        <UsageMetric
          label="Cajas"
          value={`${registers}/${limits.max_registers}`}
        />
        <UsageMetric
          label="Usuarios"
          value={`0/${limits.max_users}`}
        />
      </div>
    </article>
  );
}

function UsageMetric({
  label,
  value,
}: {
  label: string;
  value: string;
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

function MiniMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[12px] bg-white/[0.035] p-3">
      <p className="text-[7px] font-black uppercase tracking-[0.12em] text-slate-700">
        {label}
      </p>
      <p className="mt-1 text-xs font-black text-slate-400">
        {value}
      </p>
    </div>
  );
}

function SectionTitle({
  icon,
  eyebrow,
  title,
  description,
}: {
  icon: "store" | "cash";
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4 border-b border-white/[0.08] pb-5">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-cyan-300/[0.08] text-cyan-300">
        <PosIcon
          name={icon}
          className="h-5 w-5"
        />
      </div>

      <div>
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-300">
          {eyebrow}
        </p>

        <h3 className="mt-2 text-2xl font-black tracking-[-0.05em] text-white">
          {title}
        </h3>

        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
          {description}
        </p>
      </div>
    </div>
  );
}

function LimitReached({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mt-6 rounded-[22px] border border-emerald-300/15 bg-emerald-300/[0.05] p-5">
      <p className="text-lg font-black text-white">
        {title}
      </p>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
        {description}
      </p>
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mt-6 flex min-h-64 items-center justify-center rounded-[24px] border border-dashed border-white/[0.08] bg-[#06111f]/70 p-6 text-center">
      <div className="max-w-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[18px] bg-cyan-300/[0.08] text-cyan-300">
          <PosIcon
            name="store"
            className="h-6 w-6"
          />
        </div>

        <h4 className="mt-4 text-xl font-black text-white">
          {title}
        </h4>

        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
          {description}
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
  min,
  max,
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  min?: string;
  max?: string;
  step?: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
        {required ? " *" : ""}
      </span>

      <input
        type={type}
        required={required}
        min={min}
        max={max}
        step={step}
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

function SelectField({
  label,
  value,
  onChange,
  options,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
  required?: boolean;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
        {required ? " *" : ""}
      </span>

      <select
        required={required}
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="h-12 rounded-[15px] border border-white/[0.08] bg-[#06111f] px-4 text-sm font-bold text-white outline-none focus:border-cyan-300/30"
      >
        <option value="">Seleccionar</option>

        {options.map(
          ([optionValue, optionLabel]) => (
            <option
              key={optionValue}
              value={optionValue}
            >
              {optionLabel}
            </option>
          )
        )}
      </select>
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

function NextModuleCard({
  icon,
  title,
  description,
  href,
}: {
  icon: "product" | "cash" | "sale";
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-[24px] border border-white/[0.08] bg-white/[0.035] p-5 transition hover:-translate-y-1 hover:border-cyan-300/15 hover:bg-white/[0.05]"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-cyan-300/[0.08] text-cyan-300 transition group-hover:bg-cyan-300 group-hover:text-slate-950">
        <PosIcon
          name={icon}
          className="h-5 w-5"
        />
      </div>

      <h3 className="mt-5 text-xl font-black text-white">
        {title}
      </h3>

      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
        {description}
      </p>

      <p className="mt-4 text-sm font-black text-cyan-300">
        Abrir →
      </p>
    </Link>
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

async function apiRequest<T>(
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
