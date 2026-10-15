import { getBrandActivity } from "@/lib/cosmos/activity";
import { Section } from "./os-primitives";

const COMETA_TIME_ZONE = "America/Mexico_City";

function dateKey(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: COMETA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function activityTime(value: string, now = new Date()): string {
  const date = new Date(value);
  const time = new Intl.DateTimeFormat("es-MX", {
    timeZone: COMETA_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  if (dateKey(date) === dateKey(now)) return `Hoy, ${time}`;
  const day = new Intl.DateTimeFormat("es-MX", {
    timeZone: COMETA_TIME_ZONE,
    day: "numeric",
    month: "short",
  }).format(date);
  return `${day}, ${time}`;
}

export async function RecentActivity({ brandSlug }: { brandSlug: string }) {
  let events: Awaited<ReturnType<typeof getBrandActivity>>["events"] = [];
  let readFailed = false;
  try {
    const result = await getBrandActivity({
      brandSlug,
      audience: "client",
      limit: 6,
    });
    events = result.events;
  } catch (error: unknown) {
    readFailed = true;
    console.error("[COMETA_ACTIVITY_READ_FAILED]", {
      brandSlug,
      errorCode: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    });
  }
  if (readFailed) {
    return (
      <Section title="Actividad reciente">
        <div className="rounded-[14px] border border-rose-200 bg-rose-50 p-5">
          <p className="text-sm font-semibold text-rose-900">
            No pudimos cargar la actividad registrada.
          </p>
        </div>
      </Section>
    );
  }
  return (
    <Section
      title="Actividad reciente"
      description="Acciones verificables registradas por Cometa OS."
    >
      <div className="os-card overflow-hidden p-0">
        {events.length ? (
          <ol className="divide-y divide-[var(--os-border)]">
            {events.map((event) => (
              <li key={event.id} className="flex gap-3 px-4 py-4 sm:px-5">
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600 ring-4 ring-blue-50"
                />
                <div className="min-w-0">
                  <time
                    dateTime={event.occurredAt}
                    className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-700"
                  >
                    {activityTime(event.occurredAt)}
                  </time>
                  <p className="mt-1 text-sm font-medium leading-6 text-[var(--os-text)]">
                    {event.title}
                  </p>
                  {event.description ? (
                    <p className="mt-0.5 text-xs leading-5 text-[var(--os-text-muted)]">
                      {event.description}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="px-5 py-8 text-sm text-[var(--os-text-muted)]">
            No hay actividad registrada todavía.
          </p>
        )}
      </div>
    </Section>
  );
}
