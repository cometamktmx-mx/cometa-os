"use client";

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import type { PosDensity } from "./pos-page";

export const PosInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
    label?: ReactNode;
    help?: ReactNode;
    error?: ReactNode;
    prefix?: ReactNode;
    suffix?: ReactNode;
    density?: PosDensity;
  }
>
(function PosInput(
  {
    id,
    label,
    help,
    error,
    prefix,
    suffix,
    density = "normal",
    className = "",
    disabled,
    ...props
  },
  ref
) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const messageId = help || error ? `${inputId}-message` : undefined;

  return (
    <label htmlFor={inputId} className="grid gap-2 text-sm">
      {label ? (
        <span className="font-semibold text-[var(--pos-text-primary)]">
          {label}
        </span>
      ) : null}
      <span
        className={`pos-ui-focus-within flex items-center rounded-[var(--pos-radius-sm)] border bg-[var(--pos-panel-muted)] transition-colors duration-150 ${
          error ? "border-rose-300/35" : "border-[var(--pos-line)]"
        } ${disabled ? "opacity-50" : ""}`}
      >
        {prefix ? (
          <span className="pl-3 text-[var(--pos-text-muted)]">{prefix}</span>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={messageId}
          className={`min-w-0 flex-1 bg-transparent px-3 text-sm text-[var(--pos-text-primary)] outline-none placeholder:text-[var(--pos-text-disabled)] ${
            density === "compact"
              ? "h-[var(--pos-control-compact)]"
              : "h-[var(--pos-control-normal)]"
          } ${className}`}
          {...props}
        />
        {suffix ? (
          <span className="pr-3 text-[var(--pos-text-muted)]">{suffix}</span>
        ) : null}
      </span>
      {error || help ? (
        <span
          id={messageId}
          className={`text-xs leading-5 ${
            error ? "text-[var(--pos-danger)]" : "text-[var(--pos-text-muted)]"
          }`}
        >
          {error || help}
        </span>
      ) : null}
    </label>
  );
});
