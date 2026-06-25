import Link from "next/link";
import Sidebar from "../Sidebar";
import AnalyzeBrandForm from "../AnalyzeBrandForm";

export default function NewAnalysisPage() {
  return (
    <main className="min-h-screen bg-[#f6f7fb] text-slate-950 pl-80 pr-10 py-10">
      <Sidebar />

      <div className="mb-8">
        <Link href="/" className="text-sm font-bold text-blue-600">
          ← Volver al Command Center
        </Link>
      </div>

      <section className="relative overflow-hidden bg-slate-950 text-white rounded-[2rem] p-10 mb-8 shadow-xl">
        <div className="absolute -right-20 -top-20 w-80 h-80 bg-blue-600 rounded-full blur-3xl opacity-30" />

        <div className="relative z-10">
          <p className="text-blue-300 font-black tracking-[0.22em] text-xs mb-4">
            ORION · BRAND INTELLIGENCE
          </p>

          <h1 className="text-6xl font-black mb-4">
            Nuevo diagnóstico de marca
          </h1>

          <p className="text-slate-300 text-lg max-w-3xl leading-8">
            ORION analiza presencia digital, percepción, sitio web, confianza,
            posicionamiento y oportunidades para iniciar la memoria estratégica
            de la marca dentro de COSMOS.
          </p>
        </div>
      </section>

      <AnalyzeBrandForm />
    </main>
  );
}