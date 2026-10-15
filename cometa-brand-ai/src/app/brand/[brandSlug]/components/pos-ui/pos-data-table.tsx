import type { CSSProperties, ReactNode, TableHTMLAttributes } from "react";
import type { PosDensity } from "./pos-page";

export function PosDataTable({
  children,
  caption,
  density = "normal",
  minWidth = 720,
  stickyHeader = false,
  className = "",
  ...props
}: TableHTMLAttributes<HTMLTableElement> & {
  children: ReactNode;
  caption?: ReactNode;
  density?: PosDensity;
  minWidth?: CSSProperties["minWidth"];
  stickyHeader?: boolean;
}) {
  return (
    <div className="pos-ui-scrollbar w-full overflow-x-auto rounded-[var(--pos-radius-md)] bg-[var(--pos-panel)]">
      <table
        className={`pos-ui-table w-full border-collapse text-[length:var(--pos-text-table)] text-[var(--pos-text-secondary)] ${
          density === "compact"
            ? "[&_td]:px-3 [&_td]:py-2.5 [&_th]:px-3 [&_th]:py-2.5"
            : "[&_td]:px-4 [&_td]:py-3.5 [&_th]:px-4 [&_th]:py-3"
        } ${
          stickyHeader
            ? "[&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10"
            : ""
        } ${className}`}
        style={{ minWidth }}
        {...props}
      >
        {caption ? (
          <caption className="sr-only">{caption}</caption>
        ) : null}
        {children}
      </table>
    </div>
  );
}
