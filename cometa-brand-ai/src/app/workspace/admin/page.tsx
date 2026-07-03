"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

type AdminAccessResponse = {
  ok: boolean;
  error?: string;
  admin?: {
    id: string;
    email: string;
  };
  totals?: {
    users: number;
    brands: number;
    accessRules: number;
    mercuryAssignments?: number;
  };
  users?: any[];
  brands?: any[];
  access?: any[];
  mercuryAssignments?: any[];
};

const mercuryRoleLabels: Record<string, string> = {
  none: "Sin acceso operativo",
  designer: "Diseñador",
  cm: "Community Manager",
  copywriter: "Copywriter",
  video: "Video / Reels",
  manager: "Manager",
  admin: "Admin",
};

function getMercuryRoleLabel(role?: string | null) {
  return mercuryRoleLabels[role || ""] || role || "Sin rol";
}

export default function WorkspaceAdminPage() {
  const [data, setData] = useState<AdminAccessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [clientEmail, setClientEmail] = useState("");
  const [clientFullName, setClientFullName] = useState("");
  const [clientBrandSlug, setClientBrandSlug] = useState("");
  const [clientAccessRole, setClientAccessRole] = useState("owner");

  const [teamEmail, setTeamEmail] = useState("");
  const [teamFullName, setTeamFullName] = useState("");
  const [teamBrandSlug, setTeamBrandSlug] = useState("");
  const [teamMercuryRole, setTeamMercuryRole] = useState("designer");

  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const brands = data?.brands || [];
  const users = data?.users || [];

  const selectedClientBrand = useMemo(() => {
    return brands.find((brand: any) => brand.slug === clientBrandSlug);
  }, [brands, clientBrandSlug]);

  const selectedTeamBrand = useMemo(() => {
    return brands.find((brand: any) => brand.slug === teamBrandSlug);
  }, [brands, teamBrandSlug]);

  useEffect(() => {
    loadAccessCenter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAccessCenter() {
    try {
      setLoading(true);
      setErrorMessage("");

      const res = await fetch("/api/admin/access", {
        method: "GET",
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || json.ok === false) {
        throw new Error(json.error || "No se pudo cargar el centro de accesos.");
      }

      setData(json);

      const firstBrandSlug = json.brands?.[0]?.slug || "";

      if (!clientBrandSlug && firstBrandSlug) {
        setClientBrandSlug(firstBrandSlug);
      }

      if (!teamBrandSlug && firstBrandSlug) {
        setTeamBrandSlug(firstBrandSlug);
      }
    } catch (error: any) {
      setErrorMessage(error?.message || "Error cargando accesos.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAssignClientAccess(e: FormEvent) {
    e.preventDefault();

    try {
      setSaving(true);
      setMessage("");
      setErrorMessage("");

      const res = await fetch("/api/admin/access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accessType: "client_owner",
          email: clientEmail,
          fullName: clientFullName,
          role: "client",
          brandSlug: clientBrandSlug,
          accessRole: clientAccessRole,
          mercuryRole: "none",
          status: "active",
        }),
      });

      const json = await res.json();

      if (!res.ok || json.ok === false) {
        throw new Error(json.error || "No se pudo asignar el acceso del cliente.");
      }

      setMessage(
        json.message ||
          "Dueño de negocio conectado correctamente. No tendrá acceso operativo a Designer Hub."
      );

      setClientEmail("");
      setClientFullName("");
      setClientAccessRole("owner");

      await loadAccessCenter();
    } catch (error: any) {
      setErrorMessage(error?.message || "Error asignando acceso del cliente.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAssignTeamAccess(e: FormEvent) {
    e.preventDefault();

    try {
      setSaving(true);
      setMessage("");
      setErrorMessage("");

      const res = await fetch("/api/admin/access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accessType: "team_member",
          email: teamEmail,
          fullName: teamFullName,
          role: "client",
          brandSlug: teamBrandSlug,
          accessRole: "editor",
          mercuryRole: teamMercuryRole,
          status: "active",
        }),
      });

      const json = await res.json();

      if (!res.ok || json.ok === false) {
        throw new Error(json.error || "No se pudo asignar el acceso operativo.");
      }

      setMessage(
        json.message ||
          "Equipo Cometa conectado correctamente. Ahora puede entrar a Designer Hub."
      );

      setTeamEmail("");
      setTeamFullName("");
      setTeamMercuryRole("designer");

      await loadAccessCenter();
    } catch (error: any) {
      setErrorMessage(error?.message || "Error asignando acceso operativo.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleAccess({
    userId,
    brandSlug,
    nextStatus,
  }: {
    userId: string;
    brandSlug: string;
    nextStatus: "active" | "inactive";
  }) {
    try {
      setSaving(true);
      setMessage("");
      setErrorMessage("");

      const res = await fetch("/api/admin/access", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          brandSlug,
          status: nextStatus,
        }),
      });

      const json = await res.json();

      if (!res.ok || json.ok === false) {
        throw new Error(json.error || "No se pudo actualizar el acceso.");
      }

      setMessage(json.message || "Acceso actualizado correctamente.");

      await loadAccessCenter();
    } catch (error: any) {
      setErrorMessage(error?.message || "Error actualizando acceso.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f2f7fb] p-4 text-slate-950 lg:p-6">
      <section className="mx-auto grid w-full max-w-[1800px] gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <AdminDock />

        <section className="min-w-0 space-y-5">
          <Hero
            loading={loading}
            totals={data?.totals}
            adminEmail={data?.admin?.email}
          />

          {message ? (
            <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-700">
              {message}
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm font-black text-red-700">
              {errorMessage}
            </div>
          ) : null}

          <div className="grid gap-5 2xl:grid-cols-[minmax(0,700px)_minmax(0,1fr)]">
            <section className="grid gap-5">
              <AccessFormCard
                tone="client"
                eyebrow="Dueño de negocio"
                title="Acceso para cliente"
                description="Conecta al dueño del negocio con su marca. Este acceso será para revisar calendario, aprobaciones y cambios cuando tengamos Approval Hub. No entra a Designer Hub."
              >
                <form
                  onSubmit={handleAssignClientAccess}
                  className="mt-7 space-y-4"
                >
                  <Field label="Correo del dueño / cliente">
                    <input
                      type="email"
                      placeholder="cliente@empresa.com"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                      className="input"
                      required
                    />
                  </Field>

                  <Field label="Nombre visible">
                    <input
                      type="text"
                      placeholder="Dueño / Empresa"
                      value={clientFullName}
                      onChange={(e) => setClientFullName(e.target.value)}
                      className="input"
                    />
                  </Field>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Permiso del cliente">
                      <select
                        value={clientAccessRole}
                        onChange={(e) => setClientAccessRole(e.target.value)}
                        className="input"
                      >
                        <option value="owner">Owner / Dueño</option>
                        <option value="viewer">Viewer / Solo revisión</option>
                      </select>
                    </Field>

                    <Field label="Acceso operativo">
                      <input
                        value="Sin acceso a Designer Hub"
                        className="input cursor-not-allowed text-slate-500"
                        disabled
                      />
                    </Field>
                  </div>

                  <Field label="Marca">
                    <select
                      value={clientBrandSlug}
                      onChange={(e) => setClientBrandSlug(e.target.value)}
                      className="input"
                      required
                    >
                      {brands.length === 0 ? (
                        <option value="">No hay marcas disponibles</option>
                      ) : (
                        brands.map((brand: any) => (
                          <option key={brand.slug} value={brand.slug}>
                            {brand.name} · {brand.slug}
                          </option>
                        ))
                      )}
                    </select>
                  </Field>

                  <BrandPreview
                    brand={selectedClientBrand}
                    footer={`Acceso cliente: ${clientAccessRole}`}
                  />

                  <button
                    type="submit"
                    disabled={saving || loading}
                    className="flex h-14 w-full items-center justify-center rounded-2xl bg-slate-950 px-6 text-sm font-black text-white shadow-xl shadow-slate-950/10 transition hover:bg-cyan-700 disabled:opacity-50"
                  >
                    {saving ? "Guardando..." : "Conectar dueño de negocio →"}
                  </button>
                </form>
              </AccessFormCard>

              <AccessFormCard
                tone="team"
                eyebrow="Equipo Cometa"
                title="Acceso operativo"
                description="Asigna diseñadores, CM, copywriters, video o managers a una marca. Estos usuarios sí entran a Designer Hub / Production Hub."
              >
                <form
                  onSubmit={handleAssignTeamAccess}
                  className="mt-7 space-y-4"
                >
                  <Field label="Correo del equipo">
                    <input
                      type="email"
                      placeholder="diseñador@cometa.com"
                      value={teamEmail}
                      onChange={(e) => setTeamEmail(e.target.value)}
                      className="input"
                      required
                    />
                  </Field>

                  <Field label="Nombre visible">
                    <input
                      type="text"
                      placeholder="Nombre del diseñador / CM"
                      value={teamFullName}
                      onChange={(e) => setTeamFullName(e.target.value)}
                      className="input"
                    />
                  </Field>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Permiso general">
                      <input
                        value="Editor"
                        className="input cursor-not-allowed text-slate-500"
                        disabled
                      />
                    </Field>

                    <Field label="Rol operativo">
                      <select
                        value={teamMercuryRole}
                        onChange={(e) => setTeamMercuryRole(e.target.value)}
                        className="input"
                      >
                        <option value="designer">Diseñador</option>
                        <option value="cm">Community Manager</option>
                        <option value="copywriter">Copywriter</option>
                        <option value="video">Video / Reels</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin operativo</option>
                      </select>
                    </Field>
                  </div>

                  <Field label="Marca">
                    <select
                      value={teamBrandSlug}
                      onChange={(e) => setTeamBrandSlug(e.target.value)}
                      className="input"
                      required
                    >
                      {brands.length === 0 ? (
                        <option value="">No hay marcas disponibles</option>
                      ) : (
                        brands.map((brand: any) => (
                          <option key={brand.slug} value={brand.slug}>
                            {brand.name} · {brand.slug}
                          </option>
                        ))
                      )}
                    </select>
                  </Field>

                  <BrandPreview
                    brand={selectedTeamBrand}
                    footer={`Rol operativo: ${getMercuryRoleLabel(
                      teamMercuryRole
                    )}`}
                  />

                  <button
                    type="submit"
                    disabled={saving || loading}
                    className="flex h-14 w-full items-center justify-center rounded-2xl bg-cyan-300 px-6 text-sm font-black text-slate-950 shadow-xl shadow-cyan-400/20 transition hover:bg-cyan-200 disabled:opacity-50"
                  >
                    {saving ? "Guardando..." : "Conectar equipo Cometa →"}
                  </button>
                </form>
              </AccessFormCard>
            </section>

            <section className="rounded-[34px] border border-white bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
              <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
                    Usuarios registrados
                  </p>
                  <h2 className="mt-2 text-3xl font-black tracking-[-0.06em]">
                    Control de accesos
                  </h2>
                </div>

                <button
                  onClick={loadAccessCenter}
                  disabled={loading}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-white disabled:opacity-50"
                >
                  Actualizar
                </button>
              </div>

              {loading ? (
                <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 p-8 text-center text-sm font-black text-slate-500">
                  Cargando usuarios...
                </div>
              ) : users.length === 0 ? (
                <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 p-8 text-center">
                  <p className="text-lg font-black text-slate-950">
                    No hay usuarios todavía
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-500">
                    Primero crea usuarios en Supabase Authentication.
                  </p>
                </div>
              ) : (
                <div className="mt-6 grid gap-4">
                  {users.map((user: any) => (
                    <UserCard
                      key={user.id}
                      user={user}
                      saving={saving}
                      onToggleAccess={toggleAccess}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="rounded-[34px] border border-white bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
                  Marcas disponibles
                </p>
                <h2 className="mt-2 text-3xl font-black tracking-[-0.06em]">
                  Brand OS conectables
                </h2>
              </div>

              <Link
                href="/new-analysis"
                className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-cyan-700"
              >
                + Nueva marca ORION
              </Link>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {brands.map((brand: any) => (
                <Link
                  key={brand.slug}
                  href={`/brand/${brand.slug}`}
                  className="group rounded-[28px] border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-1 hover:border-cyan-200 hover:bg-slate-950 hover:text-white"
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-700 group-hover:text-cyan-300">
                    {brand.slug}
                  </p>
                  <h3 className="mt-3 text-2xl font-black tracking-[-0.055em]">
                    {brand.name}
                  </h3>
                  <p className="mt-2 text-sm font-semibold text-slate-500 group-hover:text-slate-300">
                    {brand.industry || "Sistema comercial"}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        </section>
      </section>

      <style jsx>{`
        .input {
          width: 100%;
          border-radius: 1rem;
          border: 1px solid rgb(226 232 240);
          background: rgb(248 250 252);
          padding: 1rem;
          color: rgb(15 23 42);
          outline: none;
          font-weight: 700;
          transition: all 0.2s ease;
        }

        .input:focus {
          border-color: rgb(103 232 249);
          box-shadow: 0 0 0 4px rgb(207 250 254);
          background: white;
        }
      `}</style>
    </main>
  );
}

function AccessFormCard({
  eyebrow,
  title,
  description,
  tone,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  tone: "client" | "team";
  children: ReactNode;
}) {
  return (
    <section className="rounded-[34px] border border-white bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
      <div
        className={`mb-5 rounded-[26px] border p-5 ${
          tone === "client"
            ? "border-blue-100 bg-blue-50"
            : "border-cyan-100 bg-cyan-50"
        }`}
      >
        <p
          className={`text-[10px] font-black uppercase tracking-[0.24em] ${
            tone === "client" ? "text-blue-700" : "text-cyan-700"
          }`}
        >
          {eyebrow}
        </p>

        <h2 className="mt-3 text-3xl font-black tracking-[-0.06em]">
          {title}
        </h2>

        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
          {description}
        </p>
      </div>

      {children}
    </section>
  );
}

function BrandPreview({ brand, footer }: { brand: any; footer: string }) {
  if (!brand) return null;

  return (
    <div className="rounded-[24px] border border-cyan-100 bg-cyan-50 p-4">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700">
        Marca seleccionada
      </p>
      <p className="mt-2 text-xl font-black tracking-[-0.04em]">
        {brand.name}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-600">
        {brand.industry || "Sistema comercial"}
      </p>
      <p className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
        {footer}
      </p>
    </div>
  );
}

function AdminDock() {
  const items = [
    { label: "Workspace", href: "/workspace", code: "WS" },
    { label: "Accesos", href: "/mercury/admin", code: "AD", active: true },
    { label: "Nueva marca", href: "/new-analysis", code: "OR" },
    { label: "Mercury Hub", href: "/mercury-hub", code: "MH" },
    { label: "Designer Hub", href: "/designer-hub", code: "DH" },
    { label: "Sales AI", href: "/sales-ai/inbox", code: "SA" },
  ];

  return (
    <aside className="hidden rounded-[34px] border border-white bg-white/90 p-3 shadow-[0_24px_80px_rgba(15,23,42,0.08)] xl:flex xl:flex-col">
      <div className="flex items-center gap-3 rounded-[26px] bg-slate-50 px-3 py-3">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-slate-950">
          <div className="absolute h-7 w-7 rounded-full bg-cyan-400 blur-[6px]" />
          <div className="relative h-7 w-7 rounded-full bg-gradient-to-br from-cyan-300 via-emerald-400 to-slate-950" />
        </div>

        <div>
          <p className="text-lg font-black leading-none tracking-[-0.06em]">
            cometa
          </p>
          <p className="text-lg font-black leading-none tracking-[-0.06em]">
            OS
          </p>
        </div>
      </div>

      <nav className="mt-7 grid gap-2">
        {items.map((item) => (
          <Link
            key={item.code}
            href={item.href}
            className={`flex h-12 items-center gap-3 rounded-2xl px-3 transition ${
              item.active
                ? "border border-cyan-200 bg-cyan-50 text-slate-950"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-950"
            }`}
          >
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-xl text-[10px] font-black ${
                item.active ? "bg-white text-cyan-700" : "bg-slate-50"
              }`}
            >
              {item.code}
            </span>
            <span className="text-sm font-black">{item.label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}

function Hero({
  loading,
  totals,
  adminEmail,
}: {
  loading: boolean;
  totals?: any;
  adminEmail?: string;
}) {
  return (
    <section className="relative overflow-hidden rounded-[38px] bg-slate-950 p-7 text-white shadow-[0_30px_100px_rgba(15,23,42,0.2)] md:p-9">
      <div className="absolute right-[-120px] top-[-120px] h-80 w-80 rounded-full bg-cyan-400/25 blur-[90px]" />

      <div className="relative z-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
            Admin Access Center
          </p>

          <h1 className="mt-4 text-5xl font-black leading-[0.94] tracking-[-0.08em] md:text-6xl">
            Control de usuarios y marcas.
          </h1>

          <p className="mt-5 max-w-3xl text-sm font-semibold leading-7 text-slate-300">
            Separa dueños de negocio y equipo operativo. Los clientes tendrán
            portal de aprobación; el equipo Cometa entra a Designer Hub.
          </p>

          {adminEmail ? (
            <p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-cyan-300">
              Admin activo: {adminEmail}
            </p>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-1">
          <HeroMetric value={loading ? "..." : totals?.users || 0} label="Usuarios" />
          <HeroMetric value={loading ? "..." : totals?.brands || 0} label="Marcas" />
          <HeroMetric value={loading ? "..." : totals?.accessRules || 0} label="Accesos" />
          <HeroMetric
            value={loading ? "..." : totals?.mercuryAssignments || 0}
            label="Mercury"
          />
        </div>
      </div>
    </section>
  );
}

function HeroMetric({ value, label }: { value: any; label: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
      <p className="text-4xl font-black tracking-[-0.07em] text-white">
        {value}
      </p>
      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function UserCard({
  user,
  saving,
  onToggleAccess,
}: {
  user: any;
  saving: boolean;
  onToggleAccess: (args: {
    userId: string;
    brandSlug: string;
    nextStatus: "active" | "inactive";
  }) => void;
}) {
  const isAdmin = user.profile?.role === "admin";
const brandAccess = user.brandAccess || [];
const mercuryAssignments = user.mercuryAssignments || [];

const hasActiveMercuryAccess = mercuryAssignments.some(
  (assignment: any) => assignment.active
);

const hasOwnerAccess = brandAccess.some(
  (access: any) => access.status === "active" && access.accessRole === "owner"
);

const userTypeLabel = isAdmin
  ? "Admin Cometa"
  : hasActiveMercuryAccess
    ? "Equipo Cometa"
    : hasOwnerAccess
      ? "Dueño / Cliente"
      : "Cliente";

const userTypeClass = isAdmin
  ? "bg-cyan-100 text-cyan-700"
  : hasActiveMercuryAccess
    ? "bg-violet-100 text-violet-700"
    : hasOwnerAccess
      ? "bg-blue-100 text-blue-700"
      : "bg-slate-200 text-slate-600";

  return (
    <article className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-xl font-black tracking-[-0.04em]">
              {user.email}
            </p>

            <span
  className={`rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${userTypeClass}`}
>
  {userTypeLabel}
</span>

            <span
              className={`rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${
                user.profile?.status === "active"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-rose-100 text-rose-700"
              }`}
            >
              {user.profile?.status || "inactive"}
            </span>
          </div>

          <p className="mt-2 text-xs font-semibold text-slate-500">
            ID: {user.id}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
            Accesos generales
          </p>

          {brandAccess.length ? (
            <div className="mt-3 grid gap-3">
              {brandAccess.map((access: any) => {
                const isActive = access.status === "active";

                return (
                  <div
                    key={access.id}
                    className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="font-black text-slate-950">
                        {access.brandName}
                      </p>
                      <p className="text-xs font-semibold text-slate-500">
                        {access.brandSlug} · {access.accessRole}
                      </p>
                    </div>

                    <button
                      disabled={saving}
                      onClick={() =>
                        onToggleAccess({
                          userId: user.id,
                          brandSlug: access.brandSlug,
                          nextStatus: isActive ? "inactive" : "active",
                        })
                      }
                      className={`rounded-2xl px-4 py-2 text-xs font-black transition disabled:opacity-50 ${
                        isActive
                          ? "bg-rose-50 text-rose-700 hover:bg-rose-100"
                          : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      }`}
                    >
                      {isActive ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-bold text-slate-500">
              Este usuario no tiene accesos generales.
            </div>
          )}
        </div>

        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-700">
            Mercury / Designer Hub
          </p>

          {mercuryAssignments.length ? (
            <div className="mt-3 grid gap-3">
              {mercuryAssignments.map((assignment: any) => (
                <div
                  key={assignment.id}
                  className={`rounded-2xl border p-4 ${
                    assignment.active
                      ? "border-cyan-100 bg-cyan-50"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-black text-slate-950">
                        {assignment.brandName}
                      </p>
                      <p className="text-xs font-semibold text-slate-600">
                        {assignment.brandSlug} ·{" "}
                        {getMercuryRoleLabel(assignment.role)}
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${
                        assignment.active
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {assignment.active ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-bold text-slate-500">
              Este usuario todavía no tiene acceso a Mercury / Designer Hub.
            </div>
          )}
        </div>
      </div>
    </article>
  );
}