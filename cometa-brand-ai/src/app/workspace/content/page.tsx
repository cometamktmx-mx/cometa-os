import { WorkspaceShell } from "@/app/workspace/components/workspace-shell";
import { getGlobalContentData, validContentPeriod } from "@/lib/workspace/content";
import { ContentClient } from "./content-client";

export const dynamic = "force-dynamic";

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ month?: string; year?: string }> }) {
  const params = await searchParams; const today = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { month: "numeric", year: "numeric", timeZone: "America/Mexico_City" }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  const requestedMonth = Number(params.month); const requestedYear = Number(params.year);
  const month = validContentPeriod(requestedMonth, requestedYear) ? requestedMonth : Number(today.month);
  const year = validContentPeriod(requestedMonth, requestedYear) ? requestedYear : Number(today.year);
  const data = await getGlobalContentData(month, year);
  return <WorkspaceShell><ContentClient data={data} /></WorkspaceShell>;
}
