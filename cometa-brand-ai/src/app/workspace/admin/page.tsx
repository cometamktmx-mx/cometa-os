"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
  };
  users?: any[];
  brands?: any[];
  access?: any[];
};

export default function WorkspaceAdminPage() {
  const [data, setData] = useState<AdminAccessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("client");
  const [brandSlug, setBrandSlug] = useState("");
  const [accessRole, setAccessRole] = useState("owner");

  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const brands = data?.brands || [];
  const users = data?.users || [];

  const selectedBrand = useMemo(() => {
    return brands.find((brand: any) => brand.slug === brandSlug);
  }, [brands, brandSlug]);

  useEffect(() => {
    loadAccessCenter();
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

      if (!brandSlug && json.brands?.[0]?.slug) {
        setBrandSlug(json.brands[0].slug);
      }
    } catch (error: any) {
      setErrorMessage(error?.message || "Error cargando accesos.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAssignAccess(e: React.FormEvent) {
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
          email,
          fullName,
          role,
          brandSlug,
          accessRole,
          status: "active",
        }),
      });

      const json = await res.json();

      if (!res.ok || json.ok === false) {
        throw new Error(json.error || "No se pudo asignar el acceso.");
      }

      setMessage(json.message || "Acceso guardado correctamente.");
      setEmail("");
      setFullName("");
      setRole("client");
      setAccessRole("owner");

      await loadAccessCenter();
    } catch (error: any) {
      setErrorMessage(error?.message || "Error asignando acceso.");
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

          <div className="grid gap-5 xl:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
            <section className="rounded-[34px] border border-white bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-700">
                Conectar usuario
              </p>

              <h2 className="mt-3 text-3xl font-black tracking-[-0.06em]">
                Usuario ↔ Marca
              </h2>

              <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
                Asigna una marca a un usuario existente de Supabase Auth. El
                cliente solo verá las marcas conectadas aquí.
              </p>

              <form onSubmit={handleAssignAccess} className="mt-7 space-y-4">
                <Field label="Correo del usuario">
                  <input
                    type="email"
                    placeholder="cliente@empresa.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input"
                    required
                  />
                </Field>

                <Field label="Nombre visible">
                  <input
                    type="text"
                    placeholder="Cliente / Empresa"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="input"
                  />
                </Field>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Tipo de usuario">
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="input"
                    >
                      <option value="client">Cliente</option>
                      <option value="admin">Admin Cometa</option>
                    </select>
                  </Field>

                  <Field label="Permiso de marca">
                    <select
                      value={accessRole}
                      onChange={(e) => setAccessRole(e.target.value)}
                      className="input"
                    >
                      <option value="owner">Owner</option>
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </Field>
                </div>

                <Field label="Marca">
                  <select
                    value={brandSlug}
                    onChange={(e) => setBrandSlug(e.target.value)}
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

                {selectedBrand ? (
                  <div className="rounded-[24px] border border-cyan-100 bg-cyan-50 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700">
                      Marca seleccionada
                    </p>
                    <p className="mt-2 text-xl font-black tracking-[-0.04em]">
                      {selectedBrand.name}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-600">
                      {selectedBrand.industry || "Sistema comercial"}
                    </p>
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={saving || loading}
                  className="flex h-14 w-full items-center justify-center rounded-2xl bg-slate-950 px-6 text-sm font-black text-white shadow-xl shadow-slate-950/10 transition hover:bg-cyan-700 disabled:opacity-50"
                >
                  {saving ? "Guardando..." : "Conectar usuario con marca →"}
                </button>
              </form>
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

function AdminDock() {
  const items = [
    { label: "Workspace", href: "/workspace", code: "WS" },
    { label: "Accesos", href: "/workspace/admin", code: "AD", active: true },
    { label: "Nueva marca", href: "/new-analysis", code: "OR" },
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
            Conecta usuarios con sus marcas para evitar contaminación de datos.
            El admin de Cometa puede ver todo; cada cliente solo ve lo que tiene
            asignado.
          </p>

          {adminEmail ? (
            <p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-cyan-300">
              Admin activo: {adminEmail}
            </p>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          <HeroMetric
            value={loading ? "..." : totals?.users || 0}
            label="Usuarios"
          />
          <HeroMetric
            value={loading ? "..." : totals?.brands || 0}
            label="Marcas"
          />
          <HeroMetric
            value={loading ? "..." : totals?.accessRules || 0}
            label="Accesos"
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
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

  return (
    <article className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-xl font-black tracking-[-0.04em]">
              {user.email}
            </p>

            <span
              className={`rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${
                isAdmin
                  ? "bg-cyan-100 text-cyan-700"
                  : "bg-slate-200 text-slate-600"
              }`}
            >
              {user.profile?.role || "client"}
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

      <div className="mt-5">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
          Marcas asignadas
        </p>

        {user.brandAccess?.length ? (
          <div className="mt-3 grid gap-3">
            {user.brandAccess.map((access: any) => {
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
            Este usuario no tiene marcas asignadas.
          </div>
        )}
      </div>
    </article>
  );
}