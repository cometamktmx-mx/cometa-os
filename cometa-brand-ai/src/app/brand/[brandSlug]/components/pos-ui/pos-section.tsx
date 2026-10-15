import type { HTMLAttributes, ReactNode } from "react";
import type { PosDensity } from "./pos-page";

export function PosSection({
  title,
  description,
  actions,
  children,
  density = "normal",
  divided = false,
  className = "",
  ...props
}: Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  density?: PosDensity;
  divided?: boolean;
}) {
  return (
    <section
      className={`${divided ? "border-t border-[var(--pos-line-subtle)] pt-6" : ""} ${className}`}
      {...props}
    >
      {title || description || actions ? (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-[length:var(--pos-text-section)] font-bold text-[var(--pos-text-primary)]">
                {title}
              </h2>
            ) : null}
            {description ? (
              <div className="mt-1 text-sm leading-6 text-[var(--pos-text-muted)]">
                {description}
              </div>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={density === "compact" ? "grid gap-3" : "grid gap-4"}>
        {children}
      </div>
    </section>
  );
}
