import type { HTMLAttributes, ReactNode } from "react";

export function PosPageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
  compact = false,
  className = "",
  ...props
}: Omit<HTMLAttributes<HTMLElement>, "title"> & {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
}) {
  return (
    <header
      className={`flex flex-col gap-4 border-b border-[var(--pos-line-subtle)] pb-5 sm:flex-row sm:items-end sm:justify-between ${className}`}
      {...props}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-2 text-[var(--pos-text-caption)] font-semibold uppercase tracking-[0.14em] text-[var(--pos-primary)]">
            {eyebrow}
          </div>
        ) : null}
        <h1
          className={`font-bold tracking-[-0.035em] text-[var(--pos-text-primary)] ${
            compact ? "text-xl" : "text-[length:var(--pos-text-page)]"
          }`}
        >
          {title}
        </h1>
        {description ? (
          <div className="mt-2 max-w-3xl text-sm leading-6 text-[var(--pos-text-secondary)]">
            {description}
          </div>
        ) : null}
        {meta ? (
          <div className="mt-3 text-xs text-[var(--pos-text-muted)]">
            {meta}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
