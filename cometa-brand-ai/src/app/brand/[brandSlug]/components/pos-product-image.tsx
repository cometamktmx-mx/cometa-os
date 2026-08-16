"use client";

import { useEffect, useState } from "react";
import { PosIcon } from "./pos-icons";

export function PosProductImage({
  src,
  alt,
  className = "",
  fallbackIcon = "product",
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  fallbackIcon?: "product" | "inventory";
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    return (
      <span
        role="img"
        aria-label={alt}
        className={`${className} flex items-center justify-center bg-white/[0.04] text-[var(--pos-text-muted)]`}
      >
        <PosIcon name={fallbackIcon} className="h-1/2 w-1/2 max-h-7 max-w-7" />
      </span>
    );
  }

  // The product bucket can contain externally supplied legacy URLs.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}
