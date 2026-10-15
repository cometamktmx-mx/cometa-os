"use client";
export default function ErrorPage({reset}:{reset:()=>void}) { return <section role="alert" style={{padding:40,background:"#fff9f5",color:"#740a32"}}><h1>No se pudo cargar el catálogo.</h1><p>Inténtalo de nuevo. Tus filtros siguen en la dirección de esta página.</p><button onClick={reset}>Reintentar</button></section>; }
