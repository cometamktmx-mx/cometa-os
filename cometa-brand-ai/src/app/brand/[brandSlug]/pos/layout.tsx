import type { ReactNode } from "react";
import PosShell from "../components/pos-shell";
import Link from "next/link";
import { PosExit } from "@/components/pos-exit";
import { redirect } from "next/navigation";
import { requirePosSurfaceAccess } from "@/lib/pos/access";
import { PosApiError } from "@/lib/pos/server";
import "../components/pos-ui/pos-tokens.css";

export default async function PosLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ brandSlug: string }>;
}) {
  const { brandSlug } = await params;
  try {
    await requirePosSurfaceAccess(brandSlug);
  } catch (error) {
    if (error instanceof PosApiError && error.status === 401 && error.code === "POS_UNAUTHORIZED") {
      redirect(`/login?next=${encodeURIComponent(`/brand/${brandSlug}/pos`)}`);
    }
    if (error instanceof PosApiError && [400, 401, 403, 404, 503].includes(error.status)) {
      return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
        <section className="max-w-md rounded-2xl border border-white/10 p-8 text-center">
          <h1 className="text-2xl font-semibold">Acceso POS no disponible</h1>
          <p className="mt-4 text-slate-300">{error.message}</p>
          <Link className="mt-6 inline-block text-cyan-300" href="/pos?select=1">Seleccionar negocio POS</Link><PosExit clearOnMount />
        </section>
      </main>;
    }
    throw error;
  }
  return <PosShell key={brandSlug}>{children}</PosShell>;
}
