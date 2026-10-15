import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceShell } from "@/app/workspace/components/workspace-shell";
import { getAccessPerson } from "@/lib/workspace/access";
import { formatLastSignIn } from "@/lib/workspace/access-formatters";
import { PersonActions } from "./person-actions";

export const dynamic = "force-dynamic";
export default async function PersonPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params; const { person, brands } = await getAccessPerson(userId); if (!person) notFound();
  const team = person.profile?.role === "admin" || person.profile?.role === "team" || person.assignments.length > 0;
  return <WorkspaceShell><Link href="/workspace/access" className="text-sm text-cyan-300">← Volver a accesos</Link><div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
    <div className="space-y-5"><section className="rounded-2xl border border-white/[.08] bg-white/[.03] p-6"><p className="text-xs uppercase tracking-wider text-slate-500">Identidad</p><h1 className="mt-2 text-2xl font-semibold">{person.profile?.fullName || "Nombre pendiente"}</h1><p className="mt-1 text-sm text-slate-400">{person.email}</p><dl className="mt-5 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-slate-500">Tipo</dt><dd>{team ? "Equipo Cometa" : "Cliente"}</dd></div><div><dt className="text-slate-500">Estado global</dt><dd>{!person.profile ? "Sin perfil" : person.profile.status === "active" ? "Activo" : "Revocado"}</dd></div><div className="col-span-2"><dt className="text-slate-500">Último inicio de sesión</dt><dd>{formatLastSignIn(person.lastSignInAt)}</dd></div></dl></section>
    <section className="rounded-2xl border border-white/[.08] bg-white/[.03] p-6"><h2 className="font-semibold">Operación Mercury</h2><div className="mt-3 space-y-2">{person.assignments.map((item) => <p key={`${item.brandSlug}:${item.role}`} className="text-sm text-slate-400">{item.brandName} · {item.role} · {item.active ? "Activa" : "Inactiva"}</p>)}{!person.assignments.length && <p className="text-sm text-slate-500">Sin asignaciones operativas.</p>}</div></section></div>
    <section className="rounded-2xl border border-white/[.08] bg-white/[.03] p-6"><h2 className="text-xl font-semibold">Accesos y seguridad</h2><p className="mt-2 text-sm text-slate-400">Las revocaciones son soft-delete y preservan el historial.</p><div className="mt-5"><PersonActions person={person} brands={brands} /></div></section>
  </div></WorkspaceShell>;
}
