"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <section><h1>No pudimos cargar este producto</h1><button onClick={reset}>Intentar de nuevo</button><a href="/catalogo">Volver al catálogo</a></section>; }
