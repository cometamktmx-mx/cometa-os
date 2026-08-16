import type { HTMLAttributes, ReactNode } from "react";

export type PosBadgeTone =
  | "neutral"
  | "primary"
  | "info"
  | "success"
  | "warning"
  | "danger";

const TONE_CLASSES: Record<PosBadgeTone, string> = {
  neutral: "bg-white/[0.06] text-[var(--pos-text-secondary)]",
  primary: "bg-[var(--pos-primary-soft)] text-[var(--pos-primary)]",
  info: "bg-[var(--pos-info-soft)] text-[var(--pos-info)]",
  success: "bg-[var(--pos-success-soft)] text-[var(--pos-success)]",
  warning: "bg-[var(--pos-warning-soft)] text-[var(--pos-warning)]",
  danger: "bg-[var(--pos-danger-soft)] text-[var(--pos-danger)]",
};

export function PosBadge({
  tone = "neutral",
  size = "normal",
  dot = false,
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: PosBadgeTone;
  size?: "compact" | "normal";
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-[var(--pos-radius-pill)] font-semibold ${TONE_CLASSES[tone]} ${
        size === "compact" ? "px-2 py-1 text-[10px]" : "px-2.5 py-1.5 text-xs"
      } ${className}`}
      {...props}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
