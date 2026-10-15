export type DeliveryEstimate = { source: "COMU_PROMISE" | "CARRIER"; from: string; to: string; updatedAt: string } | null;
export type BuyerPresentation = "CONFIRMED" | "PREPARING" | "GATHERING_AT_HUB" | "READY_TO_SHIP" | "PARTIALLY_IN_TRANSIT" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "ISSUE" | "CANCELLED" | "PAYMENT_PENDING" | "PAYMENT_PROCESSING" | "PAYMENT_FAILED";
export type BuyerProduct = { id: string; title: string | null; image: string | null; sellerNameSnapshot: string | null; variant: string | null; sku: string | null; attributes: Record<string, unknown>; quantity: number; unitPrice: number; subtotal: number };
export type BuyerRecordedEvent = { id: string; scope: "MASTER" | "SUBORDER"; suborderId: string | null; type: string; recordedAt: string };
export type BuyerTrackingSource = { shipmentId: string; carrier: string | null; trackingNumber: string | null; status: string; suborderIds: string[]; events: Array<{ id: string; status: string; recordedAt: string }> };
// Private-to-server shape of the allowlisted SQL RPC, not a table row.
export type BuyerOrderSource = {
  orderId: string; orderNumber: string; createdAt: string; currency: string;
  commercialStatus: string; fulfillmentStatus: string; shippingMode: string;
  presentationStatus: BuyerPresentation; paymentConfirmed: boolean; paymentState: string;
  economics: { subtotal: number; shipping: number; discount: number; pointsTotal: number; total: number; refunded: number };
  shippingAddress: { recipient: string | null; line1: string | null; line2: string | null; city: string | null; state: string | null; postalCode: string | null; country: string | null; references: string | null } | null;
  suborders: Array<{ suborderId: string; sellerId: string; sellerName: string; sellerLogo: string | null; route: "HUB" | "DIRECT"; fulfillmentStatus: string; total: number; products: BuyerProduct[] }>;
  events: BuyerRecordedEvent[]; tracking: BuyerTrackingSource[];
  issues: Array<{ id: string; suborderId: string; createdAt: string; message: string }>;
};
export type BuyerOrderSummary = {
  orderId: string; orderNumber: string; createdAt: string; currency: string; total: number;
  itemCount: number; sellerCount: number; previewImages: string[];
  presentationStatus: BuyerPresentation; presentationLabel: string; hasIssue: boolean;
  latestVerifiedUpdate: string | null; deliveryEstimate: DeliveryEstimate;
};
export type BuyerTimelineEvent = { id: string; scope: "MASTER" | "SUBORDER" | "SHIPMENT"; suborderId: string | null; shipmentId: string | null; sellerName: string | null; label: string; recordedAt: string };
export type BuyerTracking = { shipmentId: string; carrier: string | null; trackingNumber: string | null; presentationState: string; presentationLabel: string; suborderIds: string[]; events: BuyerTimelineEvent[]; latestVerifiedUpdate: string | null; publicTrackingUrl: string | null; deliveryEstimate: DeliveryEstimate };
export type BuyerSuborder = { suborderId: string; sellerId: string; sellerName: string; sellerLogo: string | null; logoSource: "CURRENT_PUBLIC" | "PLACEHOLDER"; route: "HUB" | "DIRECT"; itemCount: number; total: number; products: BuyerProduct[]; presentationState: string; presentationLabel: string; progress: BuyerTimelineEvent[] };
export type BuyerOrderDetail = BuyerOrderSummary & {
  payment: { state: string; label: string; confirmed: boolean };
  suborders: BuyerSuborder[]; shippingMode: string;
  economics: BuyerOrderSource["economics"] & { net: number };
  shippingAddress: BuyerOrderSource["shippingAddress"];
  hubProgress: { totalSellers: number; preparedSellers: number; handedSellers: number; receivedSellers: number; consolidated: boolean; label: string | null };
  timeline: BuyerTimelineEvent[]; tracking: BuyerTracking[]; issues: BuyerOrderSource["issues"];
  limitations: string[]; availableActions: [];
  context: { deepLink: string; focusSuborderId: string | null; notificationAudience: "BUYER" };
};
export type BuyerOrderList = { orders: BuyerOrderSummary[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } };
