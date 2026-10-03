"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
export function ComuAuthBoundary({ children, authContent }: { children: ReactNode; authContent: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/comu/seller" || pathname.startsWith("/comu/seller/")) return authContent;
  return children;
}
