"use client";

import { useMemo, useState } from "react";
import { PosOperatorGateSurface, type PosOperatorGateData, type PosStaffChoice } from "@/app/brand/[brandSlug]/components/pos-operator-gate";
import { PosTopbar } from "@/app/brand/[brandSlug]/components/pos-topbar";

type PreviewState = "first-run" | "selector" | "selected" | "error" | "lockout" | "active";

const staff: PosStaffChoice[] = [
  { id: "carlos", name: "Carlos", role: "WAITER", locationId: "mood-centro" },
  { id: "andrea", name: "Andrea", role: "CASHIER", roleLabel: "Caja", locationId: "mood-centro" },
  { id: "diego", name: "Diego", role: "MANAGER", locationId: null },
  { id: "sofia", name: "Sofía", role: "KITCHEN", locationId: "mood-centro" },
];

const logo = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' rx='20' fill='%23F4A261'/%3E%3Cpath d='M21 51V25h8l11 15 11-15h8v26h-8V37L40 51 29 37v14z' fill='%231A1323'/%3E%3C/svg%3E";

export default function PosFoodPreviewClient() {
  const [preview, setPreview] = useState<PreviewState>("first-run");
  const [selected, setSelected] = useState<PosStaffChoice | null>(null);
  const [pin, setPin] = useState("");
  const [firstName, setFirstName] = useState("Valeria");
  const [firstLocation, setFirstLocation] = useState("mood-centro");

  const data = useMemo<PosOperatorGateData>(() => ({
    mode: "CAFE", gateRequired: true, firstRun: preview === "first-run", canConfigure: true,
    branding: { display_name: "MOOD CAFÉ", logo_url: logo, primary_color: "#F4A261", secondary_color: "#1A1323", accent_color: "#E76F51", text_color: "#FFF7ED" },
    locations: [{ id: "mood-centro", name: "Mood Café · Centro" }],
    staff: preview === "lockout" ? staff.map((member) => member.id === "andrea" ? { ...member, lockedUntil: "2099-01-01T00:00:00.000Z" } : member) : staff,
    session: null,
  }), [preview]);

  const chooseState = (value: PreviewState) => {
    setPreview(value); setPin(value === "error" ? "1234" : "");
    setSelected(["selected", "error"].includes(value) ? staff[0] : null);
  };

  return <main className="cometa-pos min-h-screen bg-[var(--pos-shell)] text-[var(--pos-text-primary)]">
    <div className="sticky top-0 z-50 flex flex-wrap items-center gap-2 border-b border-white/10 bg-[#080711]/95 px-4 py-3 backdrop-blur-xl">
      <span className="mr-2 text-xs font-black uppercase tracking-[0.18em] text-[#F4A261]">Preview · POS Food</span>
      {(["first-run", "selector", "selected", "error", "lockout", "active"] as PreviewState[]).map((value) => <button key={value} type="button" onClick={() => chooseState(value)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${preview === value ? "bg-[#F4A261] text-[#1A1323]" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>{({ "first-run": "First-run", selector: "Selector", selected: "Seleccionado", error: "PIN incorrecto", lockout: "Lockout", active: "Header activo" } as const)[value]}</button>)}
    </div>
    {preview === "active" ? <div className="min-h-screen bg-[#070912]"><PosTopbar brand={{ slug: "mood-cafe", name: "MOOD CAFÉ", industry: "Cafetería", brandId: "preview", brandExists: true }} user={{ id: "preview", email: "preview@local", role: "admin", isAdmin: true }} pathname="/brand/mood-cafe/pos/register" isLoading={false} operator={staff[0]} operatorGateRequired onOperatorAction={async () => undefined} onOpenNavigation={() => undefined} /><div className="mx-auto max-w-6xl p-6"><div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#F4A261]">Terminal activa</p><h1 className="mt-3 text-3xl font-black text-white">Nueva venta</h1><p className="mt-2 text-slate-400">Vista de contexto para revisar la identidad compacta del operador en el header.</p></div></div></div> : <div className="p-3 md:p-6"><PosOperatorGateSurface data={data} fallbackName="MOOD CAFÉ" selected={selected} pin={pin} error={preview === "error" ? "El PIN no es correcto. Inténtalo nuevamente." : preview === "lockout" ? "Demasiados intentos. Andrea está bloqueada temporalmente." : null} busy={false} firstName={firstName} firstLocation={firstLocation} onSelect={(member) => { setSelected(member); setPin(""); }} onPinChange={setPin} onFirstNameChange={setFirstName} onFirstLocationChange={setFirstLocation} onCreateFirst={(event) => event.preventDefault()} onLogin={() => undefined} /></div>}
  </main>;
}
