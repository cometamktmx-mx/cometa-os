"use client";

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

export type PosButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "success"
  | "danger";
export type PosButtonSize = "compact" | "normal" | "touch";

const VARIANT_CLASSES: Record<PosButtonVariant, string> = {
  primary:
    "bg-[var(--pos-primary)] text-slate-950 hover:bg-[var(--pos-primary-hover)]",
  secondary:
    "border border-[var(--pos-line)] bg-[var(--pos-panel-raised)] text-[var(--pos-text-primary)] hover:border-[var(--pos-line-strong)]",
  ghost:
    "bg-transparent text-[var(--pos-text-secondary)] hover:bg-white/[0.05] hover:text-[var(--pos-text-primary)]",
  success:
    "bg-emerald-300 text-slate-950 hover:bg-emerald-200",
  danger:
    "bg-[var(--pos-danger-soft)] text-[var(--pos-danger)] hover:bg-rose-400/15",
};

const SIZE_CLASSES: Record<PosButtonSize, string> = {
  compact: "h-[var(--pos-control-compact)] px-3 text-xs",
  normal: "h-[var(--pos-control-normal)] px-4 text-sm",
  touch: "min-h-[var(--pos-control-touch)] px-5 text-sm",
};

export const PosButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: PosButtonVariant;
    size?: PosButtonSize;
    leadingIcon?: ReactNode;
    trailingIcon?: ReactNode;
    loading?: boolean;
    fullWidth?: boolean;
  }
>
(function PosButton(
  {
    variant = "primary",
    size = "normal",
    leadingIcon,
    trailingIcon,
    loading = false,
    fullWidth = false,
    disabled,
    children,
    className = "",
    type = "button",
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`pos-ui-focus inline-flex items-center justify-center gap-2 rounded-[var(--pos-radius-sm)] font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />
      ) : leadingIcon}
      <span>{children}</span>
      {!loading ? trailingIcon : null}
    </button>
  );
});
