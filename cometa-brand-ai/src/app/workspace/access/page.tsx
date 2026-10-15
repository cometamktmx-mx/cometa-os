import { WorkspaceShell } from "@/app/workspace/components/workspace-shell";
import { getAccessCenterPeople } from "@/lib/workspace/access";
import { AccessCenterClient } from "./access-center-client";
export const dynamic = "force-dynamic";
export default async function AccessCenterPage() { const { people, brands } = await getAccessCenterPeople(); return <WorkspaceShell><section><p className="text-xs uppercase tracking-[.2em] text-cyan-300">COMETA ACCESS CENTER</p><h1 className="mt-2 text-3xl font-semibold text-white">Personas y accesos</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Administra membresías sin borrar identidad ni historial.</p></section><AccessCenterClient people={people} brands={brands} /></WorkspaceShell>; }
