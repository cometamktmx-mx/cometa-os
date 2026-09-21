"use client";

import { useEffect, useState, type FormEvent } from "react";

export default function StorefrontEditor({ sellerId }: { sellerId: string }) {
  const [name, setName] = useState(""); const [headline, setHeadline] = useState(""); const [description, setDescription] = useState(""); const [message, setMessage] = useState("");
  useEffect(() => { if (!sellerId) return; void fetch(`/api/comu/storefronts?sellerId=${encodeURIComponent(sellerId)}`).then((response) => response.json()).then((data: { storefront?: { name?: string; headline?: string; description?: string } }) => { setName(data.storefront?.name || ""); setHeadline(data.storefront?.headline || ""); setDescription(data.storefront?.description || ""); }); }, [sellerId]);
  async function save(event: FormEvent) { event.preventDefault(); const response = await fetch("/api/comu/storefronts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sellerId, name, headline, description }) }); const data = await response.json() as { ok?: boolean; error?: string }; setMessage(data.ok ? "Storefront actualizado." : data.error || "No se pudo actualizar."); }
  if (!sellerId) return null;
  return <form onSubmit={save} className="mt-8 rounded-3xl bg-white p-6"><h2 className="text-xl font-black">Storefront</h2><div className="mt-4 grid gap-3"><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre público" className="min-h-12 rounded-xl border border-black/10 px-4" /><input value={headline} onChange={(event) => setHeadline(event.target.value)} placeholder="Headline" className="min-h-12 rounded-xl border border-black/10 px-4" /><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Descripción" className="min-h-24 rounded-xl border border-black/10 p-4" /><button className="w-fit rounded-full bg-[#17201d] px-5 py-3 text-sm font-bold text-white">Guardar storefront</button>{message ? <p className="text-sm text-emerald-700">{message}</p> : null}</div></form>;
}
