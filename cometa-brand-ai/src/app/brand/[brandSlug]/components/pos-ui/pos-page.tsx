import type { HTMLAttributes, ReactNode } from "react";

export type PosPageWidth = "narrow" | "standard" | "wide" | "full";
export type PosDensity = "compact" | "normal";

const WIDTH_CLASSES: Record<PosPageWidth, string> = {
  narrow: "max-w-3xl",
  standard: "max-w-7xl",
  wide: "max-w-[1600px]",
  full: "max-w-none",
};

export function PosPage({
  width = "standard",
  density = "normal",
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  width?: PosPageWidth;
  density?: PosDensity;
  children: ReactNode;
}) {
  return (
    <div
      data-pos-density={density}
      className={`mx-auto grid w-full ${WIDTH_CLASSES[width]} ${
        density === "compact" ? "gap-4" : "gap-6"
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
