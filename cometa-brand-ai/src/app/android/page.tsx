import { notFound } from "next/navigation";
import { existsSync } from "node:fs";
import path from "node:path";
import { betaRelease } from "@/lib/pos/beta-release";
import { PosMobileDownload } from "@/components/pos-mobile-download";
export const dynamic = "force-dynamic";
export default function AndroidBetaPage() {
  if (process.env.COMETA_RUNTIME_ENV !== "beta" && process.env.NODE_ENV !== "development") notFound();
  const qrUrl = existsSync(path.join(process.cwd(), "public/beta-download-qr.svg")) ? "/beta-download-qr.svg" : undefined;
  return <PosMobileDownload release={betaRelease()} qrUrl={qrUrl}/>;
}
