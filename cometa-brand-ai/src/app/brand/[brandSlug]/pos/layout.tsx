import type { ReactNode } from "react";
import PosShell from "../components/pos-shell";
import { requireClientBrandAccess } from "@/lib/brand-os/server";
import "../components/pos-ui/pos-tokens.css";

export default async function PosLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ brandSlug: string }>;
}) {
  const { brandSlug } = await params;
  await requireClientBrandAccess(brandSlug);
  return <PosShell>{children}</PosShell>;
}
