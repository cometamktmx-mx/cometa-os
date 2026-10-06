"use client";

import Image from "next/image";
import { useState } from "react";

export function HomeImage({ name, fallback, priority = false }: { name: string; fallback?: string; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const src = failed ? fallback : `/comu/home/${name}.jpg`;
  return <div className="home-photo" aria-hidden="true">
    {src && !fallbackFailed && <Image key={src} src={src} alt="" fill sizes="(max-width: 767px) 100vw, 80vw" priority={priority} className="object-cover" onError={() => failed ? setFallbackFailed(true) : setFailed(true)} />}
  </div>;
}
