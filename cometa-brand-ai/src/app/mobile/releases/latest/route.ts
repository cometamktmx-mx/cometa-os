import { betaRelease } from "@/lib/pos/beta-release";
export function GET() {
  const release = betaRelease();
  return Response.json(release || { error: "No release published" }, { status: release ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
