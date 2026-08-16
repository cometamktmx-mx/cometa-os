"use client";

import {
  useEffect,
  useId,
  type MouseEvent,
  type ReactNode,
} from "react";

export type PosModalSize = "small" | "medium" | "large";

const SIZE_CLASSES: Record<PosModalSize, string> = {
  small: "max-w-md",
  medium: "max-w-2xl",
  large: "max-w-5xl",
};

export function PosModal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "medium",
  closeLabel = "Cerrar",
  dismissible = true,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: PosModalSize;
  closeLabel?: string;
  dismissible?: boolean;
  className?: string;
}) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (dismissible && event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dismissible, onClose, open]);

  if (!open) return null;

  function handleBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (dismissible && event.target === event.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--pos-overlay)] p-4 backdrop-blur-sm"
      onMouseDown={handleBackdrop}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-[var(--pos-radius-xl)] bg-[var(--pos-panel-raised)] shadow-[var(--pos-shadow-overlay)] ${SIZE_CLASSES[size]} ${className}`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--pos-line-subtle)] px-5 py-4 md:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-bold text-[var(--pos-text-primary)]">
              {title}
            </h2>
            {description ? (
              <div id={descriptionId} className="mt-1 text-sm leading-6 text-[var(--pos-text-muted)]">
                {description}
              </div>
            ) : null}
          </div>
          {dismissible ? (
            <button
              type="button"
              onClick={onClose}
              className="pos-ui-focus flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--pos-radius-sm)] text-lg text-[var(--pos-text-muted)] hover:bg-white/[0.05] hover:text-[var(--pos-text-primary)]"
              aria-label={closeLabel}
            >
              ×
            </button>
          ) : null}
        </header>
        <div className="pos-ui-scrollbar flex-1 overflow-y-auto px-5 py-5 md:px-6">
          {children}
        </div>
        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--pos-line-subtle)] px-5 py-4 md:px-6">
            {footer}
          </footer>
        ) : null}
      </section>
    </div>
  );
}
