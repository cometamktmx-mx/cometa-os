"use client";

import Image from "next/image";
import { useState } from "react";
import { AccountIcon } from "../account/buyer/account-icon";

const stories = {
  login: {
    image: "/comu/auth/buyer-login.jpg",
    eyebrow: "Tu estilo empieza aquí.",
    headline: "Tu estilo\nempieza aquí.",
    description: "Descubre marcas, guarda tus favoritos y encuentra algo nuevo cada vez que vuelves.",
  },
  register: {
    image: "/comu/auth/buyer-register.jpg",
    eyebrow: "Una comunidad, tu estilo.",
    headline: "Encuentra.\nGuarda.\nVuelve por más.",
    description: "Tu cuenta COMU guarda todo lo que te encanta en un solo lugar.",
  },
};

export function ComuAuthEditorial({ variant }: { variant: keyof typeof stories }) {
  const story = stories[variant];
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return <aside className="relative isolate flex min-h-32 overflow-hidden rounded-2xl bg-[#e9e0d4] px-6 py-5 md:min-h-[680px] md:flex-col md:justify-between md:rounded-[1.75rem] md:p-9 lg:p-12">
    {!failed && <Image src={story.image} alt="" fill sizes="(min-width: 1280px) 720px, (min-width: 768px) 55vw, 100vw" priority className="-z-20 object-cover object-[65%_center]" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />}
    {loaded && !failed && <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-[#f1e9dd]/95 via-[#f1e9dd]/65 to-transparent" />}
    <p className="comu-eyebrow hidden md:block">{story.eyebrow}</p>
    <div className="max-w-sm py-1 md:py-20">
      <h2 className="whitespace-pre-line font-serif text-[1.7rem] leading-[1.05] tracking-[-.04em] md:text-5xl lg:text-[4rem]">{story.headline}</h2>
      <p className="mt-7 hidden max-w-[16rem] text-sm leading-7 text-[#51493f] md:block">{story.description}</p>
    </div>
    <ul className="hidden flex-wrap gap-x-5 gap-y-4 text-[11px] text-[#51493f] md:flex">
      {[["Direcciones", "Marcas locales"], ["Mis pedidos", "Nuevas colecciones"], ["Puntos y recompensas", "Beneficios COMU"]].map(([icon, label]) => <li key={label} className="flex items-center gap-2"><AccountIcon name={icon} />{label}</li>)}
    </ul>
  </aside>;
}
