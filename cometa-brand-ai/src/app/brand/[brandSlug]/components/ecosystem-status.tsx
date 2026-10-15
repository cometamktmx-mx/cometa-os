type OsStatus = "active" | "paused" | "inactive" | "not_configured";
type PosState = "active" | "preparation" | "unavailable";

export function EcosystemStatus({
  osStatus,
  posState,
}: {
  osStatus: OsStatus;
  posState: PosState;
}) {
  const osLabel = getOsLabel(osStatus);
  const posLabel = getPosLabel(posState);
  const activeSystems =
    Number(osStatus === "active") + Number(posState === "active");
  const secondaryStatus = getSecondaryStatus({ osStatus, posState });

  return (
    <section className="mt-5 rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-4 sm:px-5" aria-labelledby="ecosystem-status-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p id="ecosystem-status-heading" className="text-sm font-semibold text-white">Estado del ecosistema</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {activeSystems} {activeSystems === 1 ? "sistema activo" : "sistemas activos"}
            {secondaryStatus ? ` · ${secondaryStatus}` : ""}
          </p>
        </div>
        <dl className="grid gap-2 text-sm sm:grid-cols-2 sm:gap-5">
          <div className="flex items-center gap-2">
            <dt className="text-slate-500">Cometa OS</dt>
            <dd className="font-medium text-cyan-100">{osLabel}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="text-slate-500">Cometa POS</dt>
            <dd className="font-medium text-slate-200">{posLabel}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function getOsLabel(status: OsStatus) {
  if (status === "active") return "Activo";
  if (status === "paused") return "Pausado";
  if (status === "inactive") return "No activo";
  return "Disponible";
}

function getPosLabel(state: PosState) {
  if (state === "active") return "Activo";
  if (state === "preparation") return "En preparación";
  return "No disponible";
}

function getSecondaryStatus({
  osStatus,
  posState,
}: {
  osStatus: OsStatus;
  posState: PosState;
}) {
  const labels: string[] = [];

  if (osStatus === "not_configured") labels.push("Cometa OS disponible");
  if (osStatus === "paused") labels.push("Cometa OS pausado");
  if (osStatus === "inactive") labels.push("Cometa OS no activo");
  if (posState === "preparation") labels.push("POS en preparación");
  if (posState === "unavailable") labels.push("POS no disponible");

  return labels.join(" · ");
}
