"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const LEGACY_OS_HASHES = new Set([
  "#resumen",
  "#cuenta-digital",
  "#trabajo-realizado",
  "#estrategia-mes",
  "#calendario-contenido",
  "#conexiones",
  "#reportes",
  "#inventario",
  "#oportunidades",
]);

export function BrandHomeHashRedirect({ brandSlug }: { brandSlug: string }) {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash;

    if (!LEGACY_OS_HASHES.has(hash)) return;

    router.replace(`/brand/${encodeURIComponent(brandSlug)}/os${hash}`);
  }, [brandSlug, router]);

  return null;
}
