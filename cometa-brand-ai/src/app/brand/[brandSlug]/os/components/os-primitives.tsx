import type { ReactNode } from "react";
import Link from "next/link";

export function OsIcon({ name, className = "h-5 w-5" }: { name: "home" | "spark" | "sales" | "marketing" | "work" | "report" | "link" | "settings" | "arrow" | "check" | "alert"; className?: string }) {
  const paths: Record<string, ReactNode> = { home: <><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/></>, spark: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/></>, sales: <><circle cx="8" cy="8" r="3"/><path d="M2.5 20a5.5 5.5 0 0 1 11 0"/><path d="M15 7h6M18 4v6"/></>, marketing: <><path d="m3 11 14-6v14L3 13v-2Z"/><path d="M17 9h3a2 2 0 0 1 0 4h-3"/><path d="m6 14 1 5"/></>, work: <><path d="M4 5h16v14H4z"/><path d="M8 3v4M16 3v4M4 10h16"/><path d="m8 14 2 2 4-4"/></>, report: <><path d="M4 19V5h16v14H4Z"/><path d="M8 16v-4M12 16V8M16 16v-6"/></>, link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1"/></>, settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.1h-2.6v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H6v-2.6h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1L9 6.6l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5v-.1h2.6v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1V14h-.1a1.7 1.7 0 0 0-1.1 1Z"/></>, arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>, check: <path d="m5 12 4 4L19 6"/>, alert: <><path d="M12 3 2.8 19h18.4L12 3Z"/><path d="M12 9v4M12 16h.01"/></> };
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export function PageHeader({
  eyebrow = "COMETA OS",
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-[var(--os-border)] pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="os-label">{eyebrow}</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-[var(--os-text)] sm:text-3xl">{title}</h1>
        {description ? <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--os-text-muted)]">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function Section({ title, description, children, accent }: { title: string; description?: string; children: ReactNode; accent?: "intelligence" | "marketing" }) {
  return <section className="space-y-3"><div className="flex items-start gap-3"><span aria-hidden="true" className={`mt-1.5 h-5 w-1 rounded-full ${accent === "intelligence" ? "bg-cyan-500" : accent === "marketing" ? "bg-teal-600" : "bg-slate-300"}`} /><div><h2 className="text-sm font-semibold tracking-[-0.01em] text-[var(--os-text)]">{title}</h2>{description ? <p className="mt-1 text-sm text-[var(--os-text-muted)]">{description}</p> : null}</div></div>{children}</section>;
}

export function MetricCard({ label, value, context, status }: { label: string; value: string; context?: string; status?: "positive" | "attention" | "neutral" }) {
  return <article className="os-card min-w-0"><div className="flex items-start justify-between gap-3"><div><p className="os-label">{label}</p><p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--os-text)]">{value}</p></div><div className={`h-9 w-9 rounded-xl ${status === "attention" ? "bg-amber-50 text-amber-700" : status === "positive" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}><OsIcon name={status === "attention" ? "alert" : status === "positive" ? "check" : "spark"} className="m-2 h-5 w-5" /></div></div>{context ? <p className={`mt-3 text-xs ${status === "positive" ? "text-[var(--os-success)]" : status === "attention" ? "text-[var(--os-warning)]" : "text-[var(--os-text-muted)]"}`}>{context}</p> : null}</article>;
}

export function InsightCard({ kind, title, summary, action }: { kind: string; title: string; summary: string; action?: ReactNode }) {
  return <article className="rounded-[16px] border border-cyan-100 bg-gradient-to-br from-white to-cyan-50/60 p-4">
    <div className="flex items-center justify-between gap-3"><StatusBadge label={kind} tone="positive" /><OsIcon name="spark" className="h-4 w-4 text-cyan-600" /></div>
    <h3 className="mt-4 text-sm font-semibold text-[var(--os-text)]">{title}</h3><p className="mt-1 text-xs leading-5 text-[var(--os-text-muted)]">{summary}</p>{action ? <div className="mt-3">{action}</div> : null}
  </article>;
}

export function ActivityRow({ origin, title, context, status }: { origin: string; title: string; context: string; status?: string }) {
  return <div className="flex gap-3 rounded-xl px-2 py-2 transition hover:bg-slate-50"><div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600 ring-4 ring-blue-50" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-700">{origin}</span>{status ? <StatusBadge label={status} /> : null}</div><p className="mt-1 text-sm font-medium text-[var(--os-text)]">{title}</p><p className="mt-0.5 text-xs text-[var(--os-text-muted)]">{context}</p></div></div>;
}

export function DecisionCard({ title, context, href, tone = "attention" }: { title: string; context: string; href?: string; tone?: "attention" | "neutral" }) {
  const content = <div className={`rounded-xl border p-3 ${tone === "attention" ? "border-amber-200 bg-amber-50/70" : "border-[var(--os-border)] bg-white"}`}><p className="text-sm font-semibold text-[var(--os-text)]">{title}</p><p className="mt-1 text-xs leading-5 text-[var(--os-text-muted)]">{context}</p></div>;
  return href ? <Link href={href} className="block transition hover:-translate-y-0.5">{content}</Link> : content;
}

export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: "positive" | "warning" | "critical" | "neutral" }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tone === "positive" ? "bg-emerald-50 text-emerald-700" : tone === "warning" ? "bg-amber-50 text-amber-700" : tone === "critical" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"}`}>{label}</span>;
}

export function EmptyState({ title, description, action, status = "Listo para observar", source }: { title: string; description: string; action?: ReactNode; status?: string; source?: string }) {
  return <div className="os-card-primary relative overflow-hidden"><div className="absolute right-0 top-0 h-24 w-24 rounded-bl-full bg-blue-50" aria-hidden="true" /><div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex items-center gap-2"><StatusBadge label={status} tone="neutral" />{source ? <span className="text-xs text-[var(--os-text-muted)]">Fuente: {source}</span> : null}</div><p className="mt-4 text-base font-semibold text-[var(--os-text)]">{title}</p><p className="mt-1 max-w-xl text-sm leading-6 text-[var(--os-text-muted)]">{description}</p></div>{action ? <div className="shrink-0">{action}</div> : null}</div></div>;
}

export function Skeleton({ className = "h-24" }: { className?: string }) { return <div aria-hidden="true" className={`animate-pulse rounded-[14px] bg-slate-100 ${className}`} />; }

export function ErrorState({ title = "No pudimos cargar esta información.", description = "Intenta nuevamente en unos momentos." }: { title?: string; description?: string }) {
  return <div role="alert" className="rounded-[14px] border border-rose-200 bg-rose-50 p-5"><p className="font-semibold text-rose-900">{title}</p><p className="mt-1 text-sm text-rose-700">{description}</p></div>;
}
