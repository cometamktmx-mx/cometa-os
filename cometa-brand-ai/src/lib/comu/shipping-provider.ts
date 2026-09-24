export type ShipmentRequest = { orderId: string; destination: Record<string, unknown> | null; package: { weightKg: number; lengthCm: number; widthCm: number; heightCm: number } };
export type ShipmentResult = { provider: string; providerShipmentId: string; trackingNumber: string; carrier: string; labelUrl: string | null };

export interface ShippingProvider {
  createShipment(input: ShipmentRequest): Promise<ShipmentResult>;
}

export class LocalTestShippingProvider implements ShippingProvider {
  async createShipment(input: ShipmentRequest): Promise<ShipmentResult> {
    const compact = input.orderId.replaceAll("-", "").slice(0, 12).toUpperCase();
    return { provider: "LOCAL_TEST", providerShipmentId: `mock_${compact}`, trackingNumber: `COMUQA${compact}`, carrier: "COMETA TEST", labelUrl: null };
  }
}
