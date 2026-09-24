export type ShipmentRequest = { orderId: string; destination: Record<string, unknown> | null; package: { weightKg: number; lengthCm: number; widthCm: number; heightCm: number } };
export type ShipmentResult = { provider: string; providerShipmentId: string; trackingNumber: string; carrier: string; labelUrl: string | null };

export interface ShippingProvider {
  quote?(input: { orderId: string; destination: Record<string, unknown> | null; packages: ShipmentRequest["package"][] }): Promise<Array<{ serviceCode: string; etaDays: number; cost: number; carrier: string }>>;
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
  private readonly baseUrl = process.env.SKYDROPX_ENV === "production" ? "https://pro.skydropx.com" : "https://api-demo.skydropx.com";
  private token: { value: string; expiresAt: number } | null = null;
  private async accessToken() { if (this.token && this.token.expiresAt > Date.now()+30_000) return this.token.value; const id=process.env.SKYDROPX_CLIENT_ID, secret=process.env.SKYDROPX_CLIENT_SECRET; if (!id || !secret) throw new Error("SKYDROPX_CREDENTIALS_MISSING"); const response=await fetch(`${this.baseUrl}/api/v1/oauth/token`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({client_id:id,client_secret:secret,grant_type:"client_credentials"})}); if(!response.ok) throw new Error(`SKYDROPX_AUTH_${response.status}`); const body=await response.json() as {access_token?:string;expires_in?:number}; if(!body.access_token) throw new Error("SKYDROPX_AUTH_INVALID"); this.token={value:body.access_token,expiresAt:Date.now()+(body.expires_in??3600)*1000}; return body.access_token; }
  async quote(): Promise<Array<{serviceCode:string;etaDays:number;cost:number;carrier:string}>> { const token=await this.accessToken(); const response=await fetch(`${this.baseUrl}/api/v1/quotations`,{headers:{authorization:`Bearer ${token}`}}); if(!response.ok) throw new Error(`SKYDROPX_QUOTE_${response.status}`); const body=await response.json() as {rates?:Array<{service?:string;delivery_days?:number;amount?:number;carrier?:string}>}; return (body.rates??[]).map((x)=>({serviceCode:x.service??"UNKNOWN",etaDays:Number(x.delivery_days??0),cost:Number(x.amount??0),carrier:x.carrier??"SKYDROPX"})); }
  async createShipment(): Promise<ShipmentResult> { throw new Error("SKYDROPX_SHIPMENT_PAYLOAD_REQUIRED"); }
}
