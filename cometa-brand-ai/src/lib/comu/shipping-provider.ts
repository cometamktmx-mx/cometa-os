export type ShipmentRequest = { orderId: string; destination: Record<string, unknown> | null; package: { weightKg: number; lengthCm: number; widthCm: number; heightCm: number }; providerRateId?: string };
export type ShipmentResult = { provider: string; providerShipmentId: string; trackingNumber: string; carrier: string; labelUrl: string | null };

export function normalizeSkydropxShipments(body: unknown): ShipmentResult[] {
  const data = body && typeof body === "object" && Array.isArray((body as { data?: unknown }).data) ? (body as { data: Array<Record<string, unknown>> }).data : [];
  return data.flatMap((shipment) => {
    const rate = shipment.rate && typeof shipment.rate === "object" ? shipment.rate as Record<string, unknown> : {};
    const id = typeof shipment.id === "string" ? shipment.id : null;
    if (!id) return [];
    return [{ provider: "SKYDROPX", providerShipmentId: id, trackingNumber: String(shipment.master_tracking_number ?? ""), carrier: String(rate.provider_display_name ?? rate.provider_name ?? "SKYDROPX"), labelUrl: typeof shipment.label_url === "string" ? shipment.label_url : null }];
  });
}

export function normalizeSkydropxTrackingStatus(status: string): string {
  return ({ created: "CREATED", picked_up: "IN_TRANSIT", in_transit: "IN_TRANSIT", last_mile: "OUT_FOR_DELIVERY", delivered: "DELIVERED", exception: "EXCEPTION", canceled: "CANCELLED", in_return: "EXCEPTION" } as Record<string, string>)[status.toLowerCase()] ?? "UNKNOWN";
}

export interface ShippingProvider {
  quote?(input: { orderId: string; destination: Record<string, unknown> | null; packages: ShipmentRequest["package"][] }): Promise<Array<{ serviceCode: string; etaDays: number; cost: number; carrier: string; serviceName?: string; currency?: string; providerRateId?: string; shipmentCreationType?: string }>>;
  createShipment(input: ShipmentRequest): Promise<ShipmentResult>;
  getTracking?(providerShipmentId: string): Promise<{ status: string; trackingNumber: string }>;
  cancelShipment?(providerShipmentId: string): Promise<void>;
}

export class LocalTestShippingProvider implements ShippingProvider {
  async createShipment(input: ShipmentRequest): Promise<ShipmentResult> {
    const compact = input.orderId.replaceAll("-", "").slice(0, 12).toUpperCase();
    return { provider: "LOCAL_TEST", providerShipmentId: `mock_${compact}`, trackingNumber: `COMUQA${compact}`, carrier: "COMETA TEST", labelUrl: null };
  }
  async quote(input: { orderId: string; destination: Record<string, unknown> | null; packages: ShipmentRequest["package"][] }) { const total = input.packages.reduce((n,p) => n + p.weightKg, 0); return [{ serviceCode: "STANDARD", etaDays: 7, cost: Number((178 + total * 8).toFixed(2)), carrier: "COMETA TEST" }, { serviceCode: "FAST", etaDays: 2, cost: Number((361 + total * 12).toFixed(2)), carrier: "COMETA TEST" }]; }
  async getTracking(providerShipmentId: string) { return { status: "IN_TRANSIT", trackingNumber: providerShipmentId.replace("mock_", "COMUQA") }; }
  async cancelShipment() {}
}

export class SkydropxShippingProvider implements ShippingProvider {
  private readonly baseUrl = process.env.SKYDROPX_ENV === "production" ? "https://api-pro.skydropx.com" : "https://sb-pro.skydropx.com";
  private token: { value: string; expiresAt: number } | null = null;
  private async accessToken() { if (this.token && this.token.expiresAt > Date.now()+30_000) return this.token.value; const id=process.env.SKYDROPX_CLIENT_ID, secret=process.env.SKYDROPX_CLIENT_SECRET; if (!id || !secret) throw new Error("SKYDROPX_CREDENTIALS_MISSING"); const response=await fetch(`${this.baseUrl}/api/v1/oauth/token`,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"client_credentials",client_id:id,client_secret:secret})}); if(!response.ok) throw new Error(`SKYDROPX_AUTH_${response.status}`); const body=await response.json() as {access_token?:string;expires_in?:number}; if(!body.access_token) throw new Error("SKYDROPX_AUTH_INVALID"); this.token={value:body.access_token,expiresAt:Date.now()+(body.expires_in??7200)*1000}; return body.access_token; }
  async quote(input: { orderId: string; destination: Record<string, unknown> | null; packages: ShipmentRequest["package"][] }): Promise<Array<{serviceCode:string;etaDays:number;cost:number;carrier:string;serviceName?:string;currency?:string;providerRateId?:string;shipmentCreationType?:string}>> {
    const token=await this.accessToken();
    const destination=input.destination ?? {};
    const origin=(destination.origin as Record<string, unknown> | undefined) ?? {};
    const address=(value: Record<string, unknown>) => ({ country_code:String(value.country_code ?? ""), postal_code:String(value.postal_code ?? ""), area_level1:String(value.area_level1 ?? ""), area_level2:String(value.area_level2 ?? ""), area_level3:String(value.area_level3 ?? "") });
    const addressFrom=address(origin); const addressTo=address(destination);
    if (!addressFrom.area_level1 || !addressFrom.area_level2 || !addressFrom.area_level3 || !addressTo.area_level1 || !addressTo.area_level2 || !addressTo.area_level3) throw new Error("SKYDROPX_QUOTE_ADDRESS_INCOMPLETE");
    const response=await fetch(`${this.baseUrl}/api/v1/quotations`,{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify({quotation:{address_from:addressFrom,address_to:addressTo,parcels:input.packages.map((p)=>({length:p.lengthCm,width:p.widthCm,height:p.heightCm,weight:p.weightKg}))}})});
    if(!response.ok) throw new Error(`SKYDROPX_QUOTE_${response.status}`);
    let body=await response.json() as {id?:string;is_completed?:boolean;rates?:Array<Record<string,unknown>>};
    if (!body.id) throw new Error("SKYDROPX_QUOTE_ID_MISSING");
    const quotationId=body.id;
    for (let attempt=0; attempt<10 && !body.is_completed; attempt++) { await new Promise((resolve)=>setTimeout(resolve,1500)); const poll=await fetch(`${this.baseUrl}/api/v1/quotations/${encodeURIComponent(quotationId)}`,{headers:{authorization:`Bearer ${token}`}}); if(!poll.ok) throw new Error(`SKYDROPX_QUOTE_POLL_${poll.status}`); body=await poll.json() as typeof body; }
    if (!body.is_completed) throw new Error("SKYDROPX_QUOTE_TIMEOUT");
    return (body.rates ?? []).map((x)=>({serviceCode:String(x.provider_service_code ?? "UNKNOWN"),serviceName:String(x.provider_service_name ?? x.provider_service_code ?? "UNKNOWN"),etaDays:Number(x.days ?? 0),cost:Number(x.total ?? x.amount ?? 0),carrier:String(x.provider_display_name ?? x.provider_name ?? "SKYDROPX"),currency:String(x.currency_code ?? "MXN"),providerRateId:x.id ? String(x.id) : undefined,shipmentCreationType:x.shipment_creation_type ? String(x.shipment_creation_type) : undefined}));
  }
  async createShipment(input: ShipmentRequest): Promise<ShipmentResult> {
    const token=await this.accessToken(); const destination=input.destination ?? {}; const origin=destination.origin as Record<string, unknown> | undefined;
    if (!input.providerRateId || !origin) throw new Error("SKYDROPX_SHIPMENT_PAYLOAD_REQUIRED");
    const address=(value: Record<string, unknown>) => ({ country_code:String(value.country_code ?? ""), postal_code:String(value.postal_code ?? ""), area_level1:String(value.area_level1 ?? ""), area_level2:String(value.area_level2 ?? ""), area_level3:String(value.area_level3 ?? ""), street1:String(value.street1 ?? ""), name:String(value.name ?? ""), company:String(value.company ?? ""), phone:String(value.phone ?? ""), email:String(value.email ?? ""), reference:String(value.reference ?? "") });
    const addressFrom=address(origin); const addressTo=address(destination); const required=[addressFrom,addressTo].flatMap((x)=>[x.country_code,x.postal_code,x.area_level1,x.area_level2,x.area_level3,x.street1,x.name,x.company,x.phone,x.email,x.reference]);
    if (required.some((value)=>!value)) throw new Error("SKYDROPX_SHIPMENT_ADDRESS_INCOMPLETE");
    const response=await fetch(`${this.baseUrl}/api/v2/shipments`,{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify({shipment:{rate_id:input.providerRateId,unique_shipment:true,auto_advance:process.env.SKYDROPX_ENV === "sandbox",printing_format:"standard",include_order_detail:false,address_from:addressFrom,address_to:addressTo,packages:[{package_number:"1",package_protected:false,declared_value:100,consignment_note:"53102400",package_type:"4G",products:[{name:"COMU QA Prenda textil",sku:"COMU-QA-001",product_type_code:"42152400",product_type_name:"Prenda textil"}]}]}})});
    if(!response.ok) throw new Error(`SKYDROPX_SHIPMENT_${response.status}`);
    const results=normalizeSkydropxShipments(await response.json()); if(!results.length) throw new Error("SKYDROPX_SHIPMENT_EMPTY"); return results[0];
  }
  async getTracking(providerShipmentId: string): Promise<{ status: string; trackingNumber: string }> {
    const token=await this.accessToken(); const detailResponse=await fetch(`${this.baseUrl}/api/v1/shipments/${encodeURIComponent(providerShipmentId)}`,{headers:{authorization:`Bearer ${token}`}}); if(!detailResponse.ok) throw new Error(`SKYDROPX_SHIPMENT_${detailResponse.status}`);
    const detail=await detailResponse.json() as { data?: Record<string, unknown>; included?: Array<Record<string, unknown>> }; const shipment=detail.data ?? {}; const attributes=shipment.attributes && typeof shipment.attributes === "object" ? shipment.attributes as Record<string, unknown> : {}; const packageRow=(detail.included ?? []).find((row)=>row.type === "package"); const packageAttributes=packageRow?.attributes && typeof packageRow.attributes === "object" ? packageRow.attributes as Record<string, unknown> : {}; const trackingNumber=String(packageAttributes.tracking_number ?? attributes.master_tracking_number ?? ""); const carrier=String(attributes.carrier_name ?? ""); if(!trackingNumber || !carrier) throw new Error("SKYDROPX_TRACKING_DATA_MISSING");
    const trackingResponse=await fetch(`${this.baseUrl}/api/v1/shipments/tracking?tracking_number=${encodeURIComponent(trackingNumber)}&carrier_name=${encodeURIComponent(carrier)}`,{headers:{authorization:`Bearer ${token}`}}); if(!trackingResponse.ok) throw new Error(`SKYDROPX_TRACKING_${trackingResponse.status}`); const tracking=await trackingResponse.json() as { data?: Array<Record<string, unknown>> }; const latest=tracking.data?.[0]?.attributes && typeof tracking.data[0].attributes === "object" ? tracking.data[0].attributes as Record<string, unknown> : {}; return { status: normalizeSkydropxTrackingStatus(String(latest.status ?? "")), trackingNumber };
  }
}
