import type { HTMLAttributes, ReactNode } from "react";

export type PosCardVariant =
  | "default"
  | "muted"
  | "raised"
  | "interactive"
  | "selected"
  | "danger";
export type PosCardPadding = "none" | "compact" | "normal";

const VARIANT_CLASSES: Record<PosCardVariant, string> = {
  default: "bg-[var(--pos-panel)]",
  muted: "bg-[var(--pos-panel-muted)]",
  raised: "bg-[var(--pos-panel-raised)] shadow-[var(--pos-shadow-panel)]",
  interactive:
    "bg-[var(--pos-panel)] transition-colors duration-150 hover:bg-[var(--pos-panel-raised)]",
  selected:
    "border border-[var(--pos-primary-line)] bg-[var(--pos-row-selected)]",
  danger:
    "border border-rose-300/20 bg-[var(--pos-danger-soft)]",
};

const PADDING_CLASSES: Record<PosCardPadding, string> = {
  none: "",
  compact: "p-4",
  normal: "p-5 md:p-6",
};

export function PosCard({
  variant = "default",
  padding = "normal",
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  variant?: PosCardVariant;
  padding?: PosCardPadding;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-[var(--pos-radius-lg)] ${VARIANT_CLASSES[variant]} ${PADDING_CLASSES[padding]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
