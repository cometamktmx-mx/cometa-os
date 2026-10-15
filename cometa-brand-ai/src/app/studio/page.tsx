import { requireStudioAccess } from "@/lib/studio/server";
import { getStudioDashboard } from "@/lib/studio/dashboard";
import { StudioDashboardClient } from "./studio-dashboard-client";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function StudioPage(){const studio=await requireStudioAccess();const data=await getStudioDashboard(studio);const operation=data.operation;return <><Link href="/studio/operation" className="fixed right-5 top-5 z-30 rounded-2xl border border-white/10 bg-[#0b1b2c]/95 px-4 py-3 shadow-xl backdrop-blur sm:right-8"><p className={`text-[10px] uppercase tracking-[.16em] ${operation.status==="active"?"text-cyan-300":operation.status==="paused"?"text-amber-300":"text-slate-400"}`}>{operation.status==="active"?"● En operación":operation.status==="paused"?"● En pausa":"○ Fuera de operación"}</p><p className="mt-1 text-xs text-slate-300">{operation.status==="active"&&operation.firstOpenedAt?`${formatTime(operation.firstOpenedAt,operation.timezone)} → ~${formatTime(operation.expectedEndAt,operation.timezone)}`:"Abrir operación"}</p></Link><StudioDashboardClient data={{...data,studio:{fullName:studio.fullName,email:studio.email}}}/></>;}
function formatTime(value:string|null,timezone:string){return value?new Intl.DateTimeFormat("es-MX",{timeZone:timezone,hour:"numeric",minute:"2-digit"}).format(new Date(value)):"—";}
