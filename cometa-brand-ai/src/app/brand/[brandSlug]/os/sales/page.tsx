import { PageHeader } from "../components/os-primitives";
import { SalesOverviewClient } from "./components/sales-overview-client";
export default async function SalesPage({ params }: { params: Promise<{ brandSlug: string }> }) { const { brandSlug } = await params; return <div className="space-y-7"><PageHeader title="Sales AI" description="CRM y atención inteligente para convertir conversaciones en oportunidades." /><SalesOverviewClient brandSlug={brandSlug} /></div>; }
