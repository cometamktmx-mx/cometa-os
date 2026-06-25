"use client";

type Evidence = {
  id: string;
  source: string;
  evidence_type: string;
  source_url: string;
  screenshot_url?: string | null;
  confidence?: number;
  ai_summary?: string;
};

export default function EvidencePanel({
  evidences,
}: {
  evidences: Evidence[];
}) {
  if (!evidences || evidences.length === 0) return null;

  return (
    <section className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm mb-8">
      <h2 className="text-3xl font-black mb-2">ORION Evidence Layer</h2>

      <p className="text-slate-500 mb-8">
        Evidencias reales registradas para este diagnóstico.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {evidences.map((evidence) => (
          <div
            key={evidence.id}
            className="bg-slate-50 border border-slate-200 rounded-3xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-black tracking-[0.18em] text-blue-600 uppercase">
                {evidence.source}
              </p>

              <span className="text-xs font-black bg-white border border-slate-200 px-3 py-1 rounded-full">
                {evidence.confidence || 0}% confianza
              </span>
            </div>

            <h3 className="text-xl font-black mb-3">
              {evidence.evidence_type}
            </h3>

            <p className="text-slate-600 leading-7 mb-5">
              {evidence.ai_summary || "Evidencia registrada por ORION."}
            </p>

            {evidence.screenshot_url && (
              <img
                src={evidence.screenshot_url}
                alt="Evidencia ORION"
                className="w-full rounded-2xl border border-slate-200 mb-5"
              />
            )}

            {evidence.source_url && (
              <a
                href={evidence.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 font-black"
              >
                Ver fuente →
              </a>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}