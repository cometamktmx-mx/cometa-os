import { notFound } from "next/navigation";
export default async function MobileLinkPage({ params }: { params: Promise<{ path: string[] }> }) {
  if (process.env.COMETA_RUNTIME_ENV !== "beta" && process.env.NODE_ENV !== "development") notFound();
  const { path } = await params;
  if (!((path[0] === "auth" && ["callback", "recovery"].includes(path[1]) && path.length === 2) || path[0] === "pos")) notFound();
  return <main style={{ padding: 32 }}><h1>Abrir COMETA POS</h1><p>Abre este enlace en el dispositivo donde solicitaste el acceso. Si no tienes la app, instálala y solicita un enlace nuevo desde ella.</p><a href="/android">COMETA POS para Android</a></main>;
}
