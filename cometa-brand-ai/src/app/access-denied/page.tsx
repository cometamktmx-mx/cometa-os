import Link from "next/link";

export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7fafc] px-6 text-[#081535]">
      <section className="w-full max-w-[620px] rounded-[34px] border border-[#dfe8f3] bg-white p-8 text-center shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] bg-[#fff1f2] text-4xl">
          🔒
        </div>

        <p className="mt-6 text-xs font-black uppercase tracking-[0.24em] text-[#ef4444]">
          Acceso restringido
        </p>

        <h1 className="mt-3 text-4xl font-black tracking-tight text-[#081535]">
          Esta sección es interna de Cometa
        </h1>

        <p className="mx-auto mt-4 max-w-md text-base font-semibold leading-7 text-[#60708a]">
          No tienes permisos para ver esta configuración. Los ajustes técnicos de
          SALES AI solo pueden ser modificados por el equipo de Cometa.
        </p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/sales-ai"
            className="rounded-2xl bg-[#08a9c6] px-6 py-4 text-sm font-black text-white shadow-[0_12px_28px_rgba(8,169,198,0.22)] transition hover:bg-[#0598b5]"
          >
            Volver a SALES AI
          </Link>

          <Link
            href="/sales-ai/inbox"
            className="rounded-2xl border border-[#dfe8f3] bg-white px-6 py-4 text-sm font-black text-[#324159] transition hover:bg-[#f8fbff]"
          >
            Ir al Inbox
          </Link>
        </div>
      </section>
    </main>
  );
}