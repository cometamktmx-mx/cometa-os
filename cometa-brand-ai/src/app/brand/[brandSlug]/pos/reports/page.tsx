"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { PosIcon } from "../../components/pos-icons";
import { usePosContext } from "../../components/pos-shell";
import { buildPosHref } from "../../components/pos-sidebar";

type Metric = { current: number; previous: number; delta: number; deltaPercent: number | null };
type AnalyticsSummary = {
  timezone: string;
  period: { from: string; to: string; previousFrom: string; previousTo: string };
  sales: { netSales: Metric; ordersCount: Metric; averageTicket: Metric; itemsSold: Metric; grossProfit: number; grossMarginPercent: number | null };
  customers: { uniqueCustomers: number; newCustomers: number; returningCustomers: number; customerIdentificationRate: number | null };
  payments: Array<{ paymentMethod: string; transactionsCount: number; amount: number; percentageOfSales: number | null }>;
};
type AnalyticsProduct = { productId: string; productName: string; variantId: string; variantName: string; sku: string | null; unitsSold: number; salesTotal: number; percentageOfSales: number | null; currentStock: number };
type AnalyticsCustomer = { customerId: string; customerName: string; ordersCount: number; salesTotal: number; averageTicket: number };
type AnalyticsInventory = { productId: string; productName: string; variantId: string; variantName: string; locationId: string; currentQuantity: number; availableQuantity: number; minimumQuantity: number; inventoryCostValue: number; daysOfStockEstimate: number | null };
type AnalyticsLoyalty = { membersCount: number; activeMembersCount: number; pointsEarnedPeriod: number; pointsRedeemedPeriod: number; visitQualifiesPeriod: number; visitUnlocksCreatedPeriod: number; visitUnlocksRedeemedPeriod: number; availableUnlocksCurrent: number; tierDistribution: Array<{ tierId: string; tierName: string; members: number; percentage: number | null }> };
type AnalyticsSeries = Array<{ bucketStart: string; netSales: number; ordersCount: number; itemsSold: number; averageTicket: number }>;
type AnalyticsDataQuality = { completedSalesCount: number; identifiedSalesCount: number; customerIdentificationRate: number | null; salesWithPayment: number; salesWithoutPayment: number; productsWithoutCategory: number; customersWithoutContact: number; customersWithPhone: number; customersWithEmail: number; customersWithMarketingConsent: number; customersWithWalletConsent: number; inventoryProductsWithoutStockRows: number };
type IntelligenceSignal = { id: string; signalType: string; category: string; severity: string; title: string; currentValue: number | null; evidence: Record<string, unknown>; context: Record<string, unknown>; detectedAt: string; signal_category?: string };
type SignalsResponse = { signals: IntelligenceSignal[]; limit: number; offset: number };
type SignalsGeneration = SignalsResponse;
type PulsarReport={id:string;location_id:string|null;report_type:string;period_start:string;period_end:string;executive_summary:string;health_status:"strong"|"stable"|"watch"|"risk"|"insufficient_data";findings:Array<{id:string;title:string;summary:string;evidence:string[]}>;opportunities:Array<{id:string;title:string;summary:string;whyNow:string;evidence:string[]}>;risks:Array<{id:string;title:string;summary:string;severity:string;evidence:string[]}>;hypotheses:Array<{id:string;statement:string;confidence:string;whatWouldConfirmIt:string}>;recommended_actions:Array<{id:string;title:string;description:string;priority:string;measurement:string}>;data_quality_notes:string[];generated_at:string};
type Location = { id: string; name: string; active: boolean; currency?: string };
type ReportsApiResponse<T> = { ok: true; data: T } | { ok: false; error?: string; code?: string };
type PeriodKey = "today" | "7d" | "30d" | "month" | "custom";
type ReportsFilters = { period: PeriodKey; locationId: string; customFrom: string; customTo: string };
type BlockState<T> = { data: T | null; loading: boolean; error: string | null };

const EMPTY = <T,>(): BlockState<T> => ({ data: null, loading: true, error: null });
const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });

export default function PosReportsPage() {
  const { brand } = usePosContext();
  const requestId = useRef(0);
  const [locations, setLocations] = useState<Location[]>([]);
  const [filters, setFilters] = useState<ReportsFilters>(() => ({ period: "7d", locationId: "", customFrom: localDate(-7), customTo: localDate(0) }));
  const [summary, setSummary] = useState<BlockState<AnalyticsSummary>>(EMPTY);
  const [series, setSeries] = useState<BlockState<AnalyticsSeries>>(EMPTY);
  const [products, setProducts] = useState<BlockState<AnalyticsProduct[]>>(EMPTY);
  const [customers, setCustomers] = useState<BlockState<AnalyticsCustomer[]>>(EMPTY);
  const [inventory, setInventory] = useState<BlockState<AnalyticsInventory[]>>(EMPTY);
  const [loyalty, setLoyalty] = useState<BlockState<AnalyticsLoyalty>>(EMPTY);
  const [quality, setQuality] = useState<BlockState<AnalyticsDataQuality>>(EMPTY);
  const [signals, setSignals] = useState<BlockState<SignalsResponse>>(EMPTY);
  const [pulsar,setPulsar]=useState<BlockState<PulsarReport>>({data:null,loading:true,error:null});
  const [pulsarGenerating,setPulsarGenerating]=useState(false);

  const range = useMemo(() => resolveRange(filters), [filters]);
  const granularity = useMemo(() => selectGranularity(range.from, range.to, filters.period), [range, filters.period]);

  useEffect(() => {
    if (!brand.slug) return;
    const controller = new AbortController();
    fetch(`/api/pos/locations?brandSlug=${encodeURIComponent(brand.slug)}`, { signal: controller.signal, cache: "no-store" })
      .then((response) => response.json())
      .then((body) => { if (body?.ok) setLocations((body.locations || []).filter((location: Location) => location.active)); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [brand.slug]);

  const loadReports = useCallback(() => {
    if (!brand.slug || !range.valid) return () => undefined;
    const controller = new AbortController();
    const generation = ++requestId.current;
    const base = new URLSearchParams({ brandSlug: brand.slug, dateFrom: range.from.toISOString(), dateTo: range.to.toISOString() });
    if (filters.locationId) base.set("locationId", filters.locationId);
    function load<T>(view: string, setter: Dispatch<SetStateAction<BlockState<T>>>) {
      setter((state) => ({ ...state, loading: true, error: null }));
      const params = new URLSearchParams(base);
      params.set("view", view);
      if (view === "sales_series") params.set("granularity", granularity);
      if (view === "products" || view === "customers") params.set("limit", "5");
      fetch(`/api/pos/reports?${params}`, { signal: controller.signal, cache: "no-store" })
        .then(async (response) => ({ response, body: await response.json() as ReportsApiResponse<unknown> }))
        .then(({ response, body }) => {
          if (generation !== requestId.current) return;
          if (!response.ok || !body.ok) throw new Error(!body.ok ? body.error || "No se pudo cargar esta sección." : "No se pudo cargar esta sección.");
          setter({ data: body.data as T, loading: false, error: null });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || generation !== requestId.current) return;
          setter((state) => ({ ...state, loading: false, error: error instanceof Error ? error.message : "No se pudo cargar esta sección." }));
        });
    }
    load<AnalyticsSummary>("summary", setSummary);
    load<AnalyticsSeries>("sales_series", setSeries);
    load<AnalyticsProduct[]>("products", setProducts);
    load<AnalyticsCustomer[]>("customers", setCustomers);
    load<AnalyticsInventory[]>("inventory", setInventory);
    load<AnalyticsLoyalty>("loyalty", setLoyalty);
    load<AnalyticsDataQuality>("data_quality", setQuality);
    load<SignalsResponse>("signals", setSignals);
    /* Signals are read-only here. Generation is an explicit server operation.
    fetch(`/api/pos/reports/signals?${base}`, { method: "POST", signal: controller.signal, cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json() as ReportsApiResponse<unknown> }))
      .then(({ response, body }) => {
        if (generation !== requestId.current) return;
        if (!response.ok || !body.ok) throw new Error(!body.ok ? body.error || "No se pudieron actualizar las señales." : "No se pudieron actualizar las señales.");
        setSignals({ data: body.data as SignalsGeneration, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || generation !== requestId.current) return;
        setSignals((state) => ({ ...state, loading: false, error: error instanceof Error ? error.message : "No se pudieron actualizar las señales." }));
      }); */
    return () => controller.abort();
  }, [brand.slug, filters.locationId, granularity, range]);

  useEffect(() => loadReports(), [loadReports]);
  useEffect(()=>{if(!brand.slug)return;const controller=new AbortController();const params=new URLSearchParams({brandSlug:brand.slug,view:"latest"});if(filters.locationId)params.set("locationId",filters.locationId);setPulsar(s=>({...s,loading:true,error:null}));fetch(`/api/pos/reports/pulsar?${params}`,{signal:controller.signal,cache:"no-store"}).then(async response=>({response,body:await response.json()})).then(({response,body})=>{if(!response.ok||!body.ok)throw new Error(body.error||"No se pudo cargar PULSAR.");setPulsar({data:body.report||null,loading:false,error:null})}).catch(error=>{if(!controller.signal.aborted)setPulsar(s=>({...s,loading:false,error:error instanceof Error?error.message:"No se pudo cargar PULSAR."}))});return()=>controller.abort()},[brand.slug,filters.locationId]);

  const hasSales = Number(summary.data?.sales.ordersCount.current || 0) > 0;
  const currency = locations.find((location) => location.id === filters.locationId)?.currency || locations[0]?.currency || "MXN";
  const formatMoney = (value: number) => currency === "MXN" ? money.format(value || 0) : new Intl.NumberFormat("es-MX", { style: "currency", currency, maximumFractionDigits: 0 }).format(value || 0);

  return (
    <main className="min-h-screen bg-[#030811] px-4 py-6 text-slate-300 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1580px] space-y-6">
        <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">Business intelligence</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">Reportes</h1>
            <p className="mt-2 text-sm font-semibold text-slate-500">Inteligencia comercial para tomar mejores decisiones.</p>
          </div>
          <ReportFilters filters={filters} locations={locations} onChange={setFilters} range={range} />
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Kpi label="Ventas netas" metric={summary.data?.sales.netSales} value={formatMoney(summary.data?.sales.netSales.current || 0)} loading={summary.loading} />
          <Kpi label="Órdenes" metric={summary.data?.sales.ordersCount} value={integer.format(summary.data?.sales.ordersCount.current || 0)} loading={summary.loading} />
          <Kpi label="Ticket promedio" metric={summary.data?.sales.averageTicket} value={formatMoney(summary.data?.sales.averageTicket.current || 0)} loading={summary.loading} />
          <Kpi label="Clientes" value={integer.format(summary.data?.customers.uniqueCustomers || 0)} loading={summary.loading} note="Clientes identificados" />
          <Kpi label="Margen bruto" value={summary.data?.sales.grossMarginPercent == null ? "—" : `${summary.data.sales.grossMarginPercent.toFixed(1)}%`} loading={summary.loading} note="Costo histórico de la venta" />
        </section>

        <section className="hidden">
          <p className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-300">PULSAR — Inteligencia comercial</p>
          <p className="mt-2 text-sm font-black text-white">Próximamente: interpretación, hipótesis y recomendaciones automáticas.</p>
        </section>
        <PulsarBrief state={pulsar} generating={pulsarGenerating} onGenerate={async()=>{if(!range.valid||pulsarGenerating)return;setPulsarGenerating(true);try{const response=await fetch(`/api/pos/reports/pulsar?brandSlug=${encodeURIComponent(brand.slug)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"generate",reportType:"manual",dateFrom:range.from.toISOString(),dateTo:range.to.toISOString(),locationId:filters.locationId||null})});const body=await response.json();if(!response.ok||!body.ok)throw new Error(body.error||"No se pudo generar el análisis.");setPulsar({data:body.report,loading:false,error:null})}catch(error){setPulsar(s=>({...s,loading:false,error:error instanceof Error?error.message:"No se pudo generar el análisis."}))}finally{setPulsarGenerating(false)}}}/>
        <SignalsPanel state={signals} />

        {!summary.loading && !hasSales ? <EmptySales /> : null}
        <section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <Panel title="Tendencia de ventas" subtitle={`Ventas netas · ${granularityLabel(granularity)}`} loading={series.loading} error={series.error}>
            <SalesChart data={series.data || []} formatMoney={formatMoney} />
          </Panel>
          <Panel title="Clientes nuevos vs recurrentes" subtitle="Comportamiento dentro del periodo" loading={summary.loading} error={summary.error}>
            <CustomerMix summary={summary.data} />
          </Panel>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <Panel title="Top productos" subtitle="Mayor venta neta del periodo" loading={products.loading} error={products.error} action={<Link href={buildPosHref(brand.slug,"products")}>Ver productos</Link>}>
            <Ranking rows={(products.data || []).map((p) => ({ id:p.variantId,label:p.productName,meta:p.variantName && p.variantName!=="Única" ? p.variantName : `${integer.format(p.unitsSold)} unidades`,value:formatMoney(p.salesTotal),share:p.percentageOfSales }))} empty="Sin productos vendidos en este periodo." />
          </Panel>
          <Panel title="Top clientes" subtitle="Clientes con mayor venta atribuida" loading={customers.loading} error={customers.error} action={<Link href={buildPosHref(brand.slug,"customers")}>Ver clientes</Link>}>
            <Ranking rows={(customers.data || []).map((c) => ({ id:c.customerId,label:c.customerName||"Cliente sin nombre",meta:`${integer.format(c.ordersCount)} órdenes`,value:formatMoney(c.salesTotal) }))} empty="Aún no hay ventas identificadas." />
          </Panel>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
          <Panel title="Salud de inventario" subtitle="Cobertura estimada según ritmo reciente" loading={inventory.loading} error={inventory.error} action={<Link href={buildPosHref(brand.slug,"inventory")}>Ver inventario</Link>}>
            <InventoryHealth rows={inventory.data || []} formatMoney={formatMoney} />
          </Panel>
          <Panel title="Fidelización" subtitle="Puntos y visitas, sin mezclar sus ledgers" loading={loyalty.loading} error={loyalty.error} action={<Link href={buildPosHref(brand.slug,"loyalty")}>Abrir fidelización</Link>}>
            <LoyaltySummary data={loyalty.data} />
          </Panel>
        </section>

        <Panel title="Calidad de datos" subtitle="Qué tan preparada está la operación para análisis y marketing" loading={quality.loading} error={quality.error}>
          <DataQuality data={quality.data} />
        </Panel>
      </div>
    </main>
  );
}

function PulsarBrief({state,generating,onGenerate}:{state:BlockState<PulsarReport>;generating:boolean;onGenerate:()=>void}){const r=state.data;return <section className="rounded-[26px] border border-violet-300/20 bg-[linear-gradient(130deg,#081426,#0b0818)] p-6"><div className="flex flex-wrap justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[.22em] text-cyan-300">PULSAR · Inteligencia comercial</p><h2 className="mt-2 text-xl font-black text-white">{r?healthLabel(r.health_status):"Daily Intelligence Brief"}</h2></div><button type="button" disabled={generating} onClick={onGenerate} className="rounded-xl bg-cyan-300 px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-50">{generating?"Analizando el negocio...":r?"Actualizar análisis":"Generar análisis"}</button></div>{state.loading?<div className="mt-5"><Skeleton/></div>:state.error?<p className="mt-5 rounded-xl bg-rose-300/[.08] p-3 text-xs font-bold text-rose-200">{state.error}</p>:r?<><p className="mt-5 max-w-5xl text-sm leading-6 text-slate-300">{r.executive_summary}</p><div className="mt-5 grid gap-4 lg:grid-cols-2"><PulsarList title="Hallazgos clave" rows={r.findings.map(x=>({title:x.title,body:x.summary,meta:x.evidence.slice(0,2).join(" · ")}))}/><PulsarList title="Oportunidades" rows={r.opportunities.map(x=>({title:x.title,body:x.whyNow,meta:x.evidence.slice(0,2).join(" · ")}))}/><PulsarList title="Riesgos" rows={r.risks.map(x=>({title:x.title,body:x.summary,meta:x.evidence.slice(0,2).join(" · ")}))}/><PulsarList title="HIPÓTESIS para probar" rows={r.hypotheses.map(x=>({title:x.statement,body:`Confianza ${x.confidence}`,meta:x.whatWouldConfirmIt}))}/><PulsarList title="Acciones sugeridas" rows={r.recommended_actions.map(x=>({title:x.title,body:x.description,meta:`Medición: ${x.measurement}`}))}/></div>{r.data_quality_notes.length?<p className="mt-4 rounded-xl bg-amber-300/[.05] p-3 text-xs text-amber-100">Confianza del análisis: {r.data_quality_notes.join(" · ")}</p>:null}</>:<p className="mt-5 text-xs text-slate-500">Genera manualmente el análisis del periodo visible.</p>}</section>}
function PulsarList({title,rows}:{title:string;rows:Array<{title:string;body:string;meta:string}>}){if(!rows.length)return null;return <div><h3 className="text-[10px] font-black uppercase text-violet-200">{title}</h3><div className="mt-2 space-y-2">{rows.slice(0,3).map((row,index)=><article key={`${title}-${index}`} className="rounded-xl border border-white/[.06] bg-black/15 p-3"><p className="text-xs font-black text-white">{row.title}</p><p className="mt-1 text-[11px] text-slate-400">{row.body}</p><p className="mt-2 text-[10px] text-cyan-200/70">{row.meta}</p></article>)}</div></div>}
function healthLabel(value:PulsarReport["health_status"]){return value==='strong'?'Estado: Fuerte':value==='stable'?'Estado: Estable':value==='watch'?'Estado: Atención':value==='risk'?'Estado: Riesgo':'Datos insuficientes'}
function ReportFilters({ filters, locations, onChange, range }: { filters: ReportsFilters; locations: Location[]; onChange: (next: ReportsFilters) => void; range: ReturnType<typeof resolveRange> }) {
  return <div className="flex max-w-full flex-col gap-3 rounded-2xl border border-white/[.08] bg-white/[.035] p-3">
    <div className="flex flex-wrap gap-1">{([['today','Hoy'],['7d','7 días'],['30d','30 días'],['month','Mes'],['custom','Personalizado']] as const).map(([key,label])=><button key={key} type="button" onClick={()=>onChange({...filters,period:key})} className={`rounded-xl px-3 py-2 text-xs font-black transition ${filters.period===key?'bg-cyan-300 text-slate-950':'text-slate-500 hover:bg-white/[.05] hover:text-white'}`}>{label}</button>)}</div>
    <div className="flex flex-wrap items-center gap-3">
      {locations.length>1?<label className="flex items-center gap-2 text-xs font-bold text-slate-500">Sucursal<select value={filters.locationId} onChange={(e)=>onChange({...filters,locationId:e.target.value})} className="h-9 rounded-xl border border-white/[.08] bg-[#08111e] px-3 text-white"><option value="">Todas</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>:null}
      {filters.period==='custom'?<><input aria-label="Fecha inicial" type="date" value={filters.customFrom} onChange={(e)=>onChange({...filters,customFrom:e.target.value})} className="h-9 rounded-xl border border-white/[.08] bg-[#08111e] px-3 text-xs text-white"/><input aria-label="Fecha final" type="date" value={filters.customTo} onChange={(e)=>onChange({...filters,customTo:e.target.value})} className="h-9 rounded-xl border border-white/[.08] bg-[#08111e] px-3 text-xs text-white"/></>:null}
      <span className="text-[11px] font-semibold text-slate-600">{range.valid?formatRange(range.from,range.to):"Rango inválido"}</span>
    </div>
  </div>;
}

function Kpi({label,value,metric,loading,note}:{label:string;value:string;metric?:Metric;loading:boolean;note?:string}) { const delta=metric?.deltaPercent; return <article className="rounded-[22px] border border-white/[.08] bg-[linear-gradient(145deg,rgba(255,255,255,.055),rgba(255,255,255,.018))] p-5">{loading?<Skeleton/>:<><p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-600">{label}</p><p className="mt-3 truncate text-2xl font-black tracking-tight text-white">{value}</p><p className={`mt-2 text-[11px] font-bold ${delta==null?'text-slate-600':delta>=0?'text-emerald-300':'text-rose-300'}`}>{delta==null?(note||"Sin comparación"):`${delta>=0?'↑':'↓'} ${Math.abs(delta).toFixed(1)}%`} {delta!=null?<span className="text-slate-700">vs periodo anterior</span>:null}</p></>}</article> }
function SignalsPanel({state}:{state:BlockState<SignalsGeneration>}){const rows=state.data?.signals||[];return <section className="relative overflow-hidden rounded-[26px] border border-cyan-300/20 bg-[radial-gradient(circle_at_12%_20%,rgba(34,211,238,.16),transparent_36%),linear-gradient(120deg,#071624,#060b14)] p-6 sm:p-8"><div className="absolute right-8 top-1/2 h-28 w-28 -translate-y-1/2 rounded-full bg-cyan-300/10 blur-3xl"/><div className="relative"><div className="flex items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200"><PosIcon name="activity" className="h-6 w-6"/></div><div><p className="text-[10px] font-black uppercase tracking-[.22em] text-cyan-300">PULSAR — Signals Engine</p><h2 className="mt-1 text-lg font-black text-white">Señales comerciales detectadas automáticamente</h2><p className="mt-1 text-xs font-semibold text-slate-500">Hechos deterministas y auditables; todavía sin interpretación generativa.</p></div></div>{state.loading?<div className="mt-5"><Skeleton/></div>:state.error?<p className="mt-5 rounded-xl bg-rose-300/[.06] p-3 text-xs font-bold text-rose-200">{state.error}</p>:rows.length?<div className="mt-5 grid gap-3 lg:grid-cols-2">{rows.slice(0,6).map(signal=><article key={signal.id} className="rounded-2xl border border-white/[.08] bg-black/15 p-4"><div className="flex items-center justify-between gap-3"><span className="text-[9px] font-black uppercase tracking-wider text-cyan-300">{signal.signal_category}</span><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${signal.severity==='high'||signal.severity==='critical'?'bg-rose-300/10 text-rose-200':signal.severity==='medium'?'bg-amber-300/10 text-amber-200':'bg-white/[.06] text-slate-400'}`}>{signal.severity}</span></div><p className="mt-2 text-sm font-black text-white">{signal.title}</p></article>)}</div>:<p className="mt-5 rounded-xl border border-white/[.06] bg-black/10 p-4 text-xs font-semibold text-slate-500">No se detectaron señales para este periodo. Eso también es una lectura válida.</p>}</div></section>}
function Panel({title,subtitle,loading,error,action,children}:{title:string;subtitle:string;loading:boolean;error:string|null;action?:ReactNode;children:ReactNode}){return <section className="overflow-hidden rounded-[24px] border border-white/[.08] bg-white/[.03]"><header className="flex items-start justify-between border-b border-white/[.07] px-5 py-4"><div><h2 className="text-sm font-black text-white">{title}</h2><p className="mt-1 text-[11px] font-semibold text-slate-600">{subtitle}</p></div>{action?<div className="text-[11px] font-black text-cyan-300 hover:text-cyan-200">{action}</div>:null}</header><div className="min-h-36 p-5">{loading?<Skeleton tall/>:error?<p className="rounded-xl bg-rose-300/[.06] p-3 text-xs font-bold text-rose-200">{error}</p>:children}</div></section>}
function SalesChart({data,formatMoney}:{data:AnalyticsSeries;formatMoney:(v:number)=>string}){if(!data.length)return <Empty text="Sin ventas para graficar."/>;const width=760,height=220,pad=28,max=Math.max(...data.map(d=>d.netSales),1);const points=data.map((d,i)=>`${pad+(i*(width-pad*2))/Math.max(data.length-1,1)},${height-pad-(d.netSales/max)*(height-pad*2)}`).join(' ');return <div><svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full overflow-visible" role="img" aria-label="Tendencia de ventas netas"><defs><linearGradient id="sales-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#22d3ee" stopOpacity=".25"/><stop offset="1" stopColor="#22d3ee" stopOpacity="0"/></linearGradient></defs><path d={`M ${points} L ${width-pad},${height-pad} L ${pad},${height-pad} Z`} fill="url(#sales-fill)"/><polyline points={points} fill="none" stroke="#67e8f9" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>{data.map((d,i)=>{const x=pad+(i*(width-pad*2))/Math.max(data.length-1,1),y=height-pad-(d.netSales/max)*(height-pad*2);return <circle key={d.bucketStart} cx={x} cy={y} r="3" fill="#07111e" stroke="#67e8f9"><title>{`${formatDate(d.bucketStart)} · ${formatMoney(d.netSales)}`}</title></circle>})}</svg><div className="flex justify-between text-[10px] font-bold text-slate-700"><span>{formatDate(data[0].bucketStart)}</span><span>{formatMoney(max)} máx.</span><span>{formatDate(data[data.length-1].bucketStart)}</span></div></div>}
function CustomerMix({summary}:{summary:AnalyticsSummary|null}){const n=summary?.customers.newCustomers||0,r=summary?.customers.returningCustomers||0,total=n+r;return <div className="space-y-5"><div className="flex items-center gap-5"><div className="relative h-28 w-28 rounded-full" style={{background:`conic-gradient(#67e8f9 0 ${total?n*100/total:0}%,#34d399 0)`}}><div className="absolute inset-3 flex items-center justify-center rounded-full bg-[#070d16] text-lg font-black text-white">{integer.format(total)}</div></div><div className="space-y-3"><Legend color="bg-cyan-300" label="Nuevos" value={n}/><Legend color="bg-emerald-400" label="Recurrentes" value={r}/></div></div><div className="rounded-xl bg-white/[.035] p-3"><p className="text-[10px] font-black uppercase tracking-wider text-slate-600">Tasa de identificación</p><p className="mt-1 text-xl font-black text-white">{summary?.customers.customerIdentificationRate==null?'—':`${summary.customers.customerIdentificationRate.toFixed(1)}%`}</p><p className="text-[10px] text-slate-600">Ventas asociadas a un cliente</p></div></div>}
function Ranking({rows,empty}:{rows:Array<{id:string;label:string;meta:string;value:string;share?:number|null}>;empty:string}){if(!rows.length)return <Empty text={empty}/>;return <div className="divide-y divide-white/[.06]">{rows.map((row,i)=><div key={row.id} className="flex items-center gap-3 py-3"><span className="w-5 text-xs font-black text-slate-700">{String(i+1).padStart(2,'0')}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-white">{row.label}</p><p className="truncate text-[11px] font-semibold text-slate-600">{row.meta}</p></div>{row.share!=null?<span className="text-[10px] font-bold text-slate-600">{row.share.toFixed(1)}%</span>:null}<span className="text-sm font-black tabular-nums text-cyan-200">{row.value}</span></div>)}</div>}
function InventoryHealth({rows,formatMoney}:{rows:AnalyticsInventory[];formatMoney:(v:number)=>string}){const value=rows.reduce((s,r)=>s+r.inventoryCostValue,0),out=rows.filter(r=>r.availableQuantity<=0).length,below=rows.filter(r=>r.availableQuantity>0&&r.availableQuantity<=r.minimumQuantity).length,coverage=rows.filter(r=>r.daysOfStockEstimate!=null);const avg=coverage.length?coverage.reduce((s,r)=>s+(r.daysOfStockEstimate||0),0)/coverage.length:null;return <div className="grid gap-3 sm:grid-cols-2"><Stat label="Valor disponible" value={formatMoney(value)}/><Stat label="Cobertura media" value={avg==null?'—':`${avg.toFixed(1)} días`} note="Estimado según ritmo reciente"/><Stat label="Agotados" value={integer.format(out)} tone={out?'danger':'normal'}/><Stat label="En mínimo" value={integer.format(below)} tone={below?'warning':'normal'}/></div>}
function LoyaltySummary({data}:{data:AnalyticsLoyalty|null}){if(!data)return <Empty text="Sin datos de fidelización."/>;return <div className="space-y-4"><div className="grid grid-cols-2 gap-3"><Stat label="Miembros activos" value={`${integer.format(data.activeMembersCount)} / ${integer.format(data.membersCount)}`}/><Stat label="Unlocks disponibles" value={integer.format(data.availableUnlocksCurrent)}/><Stat label="Puntos ganados" value={integer.format(data.pointsEarnedPeriod)}/><Stat label="Puntos canjeados" value={integer.format(data.pointsRedeemedPeriod)}/><Stat label="Visitas calificadas" value={integer.format(data.visitQualifiesPeriod)}/><Stat label="Unlocks creados" value={integer.format(data.visitUnlocksCreatedPeriod)}/></div>{data.tierDistribution?.length?<div><p className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-600">Distribución por nivel</p>{data.tierDistribution.map(t=><div key={t.tierId} className="mb-2"><div className="flex justify-between text-[11px] font-bold"><span>{t.tierName}</span><span>{integer.format(t.members)}</span></div><div className="mt-1 h-1.5 rounded-full bg-white/[.05]"><div className="h-full rounded-full bg-cyan-300" style={{width:`${Math.min(t.percentage||0,100)}%`}}/></div></div>)}</div>:null}</div>}
function DataQuality({data}:{data:AnalyticsDataQuality|null}){if(!data)return <Empty text="Sin datos de calidad."/>;return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Quality label="Ventas identificadas" value={data.customerIdentificationRate}/><Stat label="Clientes con teléfono" value={integer.format(data.customersWithPhone)}/><Stat label="Clientes con email" value={integer.format(data.customersWithEmail)}/><Stat label="Clientes sin contacto" value={integer.format(data.customersWithoutContact)} tone={data.customersWithoutContact?'warning':'normal'}/><div className="sm:col-span-2 lg:col-span-4 flex flex-wrap gap-3 text-[11px] font-bold text-slate-600"><span>{data.productsWithoutCategory} productos sin categoría</span><span>·</span><span>{data.salesWithoutPayment} ventas sin pago</span><span>·</span><span>{data.inventoryProductsWithoutStockRows} variantes sin fila de inventario</span><span>·</span><span>{data.customersWithMarketingConsent} consentimientos de marketing</span></div></div>}
function Quality({label,value}:{label:string;value:number|null}){const safe=value==null?null:Math.max(0,Math.min(100,value));return <div><div className="flex justify-between text-xs font-black"><span className="text-slate-400">{label}</span><span className="text-white">{safe==null?'—':`${safe.toFixed(0)}%`}</span></div><div className="mt-3 h-2 rounded-full bg-white/[.05]"><div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-300" style={{width:`${safe||0}%`}}/></div></div>}
function Stat({label,value,note,tone='normal'}:{label:string;value:string;note?:string;tone?:'normal'|'warning'|'danger'}){return <div className="rounded-xl border border-white/[.06] bg-white/[.025] p-3"><p className="text-[10px] font-black uppercase tracking-wider text-slate-600">{label}</p><p className={`mt-1 text-lg font-black ${tone==='danger'?'text-rose-300':tone==='warning'?'text-amber-200':'text-white'}`}>{value}</p>{note?<p className="text-[9px] text-slate-700">{note}</p>:null}</div>}
function Legend({color,label,value}:{color:string;label:string;value:number}){return <div className="flex items-center gap-2 text-xs font-bold"><span className={`h-2 w-2 rounded-full ${color}`}/><span className="text-slate-500">{label}</span><span className="text-white">{integer.format(value)}</span></div>}
function Skeleton({tall=false}:{tall?:boolean}){return <div className={`${tall?'h-32':'h-16'} animate-pulse rounded-xl bg-white/[.045]`}/>}
function Empty({text}:{text:string}){return <div className="flex min-h-28 items-center justify-center text-center text-xs font-semibold text-slate-600">{text}</div>}
function EmptySales(){return <div className="rounded-[22px] border border-cyan-300/10 bg-cyan-300/[.04] p-5 text-center"><p className="font-black text-white">Aún no hay suficientes ventas para generar reportes.</p><p className="mt-1 text-xs text-slate-600">Inventario y calidad de datos seguirán visibles cuando exista información.</p></div>}
function localDate(offset:number){const d=new Date();d.setDate(d.getDate()+offset);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function resolveRange(filters:ReportsFilters){const now=new Date();let from:Date,to=now;if(filters.period==='today'){from=new Date(now);from.setHours(0,0,0,0)}else if(filters.period==='7d'){from=new Date(now.getTime()-7*864e5)}else if(filters.period==='30d'){from=new Date(now.getTime()-30*864e5)}else if(filters.period==='month'){from=new Date(now.getFullYear(),now.getMonth(),1)}else{from=new Date(`${filters.customFrom}T00:00:00`);to=new Date(`${filters.customTo}T00:00:00`);to.setDate(to.getDate()+1)}return{from,to,valid:Number.isFinite(from.getTime())&&Number.isFinite(to.getTime())&&to>from}}
function selectGranularity(from:Date,to:Date,period:PeriodKey){const days=(to.getTime()-from.getTime())/864e5;if(period==='today')return'hour';if(days>180)return'month';if(days>45)return'week';return'day'}
function granularityLabel(value:string){return value==='hour'?'por hora':value==='week'?'por semana':value==='month'?'por mes':'por día'}
function formatDate(value:string){return new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short'}).format(new Date(value))}
function formatRange(from:Date,to:Date){return `${formatDate(from.toISOString())} — ${new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',year:'numeric'}).format(new Date(to.getTime()-1))}`}
