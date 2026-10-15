import Link from "next/link";
import { requireStudioAccess } from "@/lib/studio/server";
import { getStudioOperationState } from "@/lib/studio/operation";
import { OperationClient } from "./operation-client";

export const dynamic = "force-dynamic";

export default async function StudioOperationPage() {
  const studio = await requireStudioAccess();
  const state = await getStudioOperationState(studio.userId);
  return <main className="min-h-screen bg-[#07111f] px-5 py-7 text-white sm:px-10 sm:py-10">
    <div className="mx-auto max-w-6xl">
      <Link href="/studio" className="text-sm text-cyan-300">← Volver a Studio</Link>
      <div className="mt-7"><p className="text-[10px] uppercase tracking-[.3em] text-cyan-300">COMETA STUDIO</p><h1 className="mt-2 text-3xl font-semibold">Operación de hoy</h1><p className="mt-2 max-w-2xl text-sm text-slate-400">Tu estado operativo ayuda a planear capacidad y prioridades. No es asistencia ni control disciplinario.</p></div>
      <OperationClient initialState={state} />
    </div>
  </main>;
}
