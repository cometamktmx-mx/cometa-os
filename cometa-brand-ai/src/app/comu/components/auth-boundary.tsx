"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { comuAuthPaths } from "@/lib/comu/auth-navigation";
export function ComuAuthBoundary({ children, authContent }: { children: ReactNode; authContent: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/comu/seller" || pathname.startsWith("/comu/seller/")) return authContent;
  return comuAuthPaths.includes(pathname) ? <div className="comu-market min-h-screen">{authContent}</div> : children;
}
