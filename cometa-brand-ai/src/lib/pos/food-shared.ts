import type { PosStaffPermission, PosStaffRole } from "./staff-shared";

export const FOOD_ACTION_PERMISSIONS = {
  table_create: "STAFF_MANAGE", open: "ORDER_OPEN", item_add: "ORDER_EDIT",
  item_update: "ORDER_EDIT", send: "ORDER_SEND", prepare: "KDS_UPDATE",
  ready: "KDS_UPDATE", serve: "ORDER_EDIT", request_payment: "ORDER_EDIT",
  resume: "ORDER_EDIT", pay: "SALE_CHARGE",
  customer_set: "POS_ACCESS",
  void_item: "RESTRICTED_AUTHORIZE",
} as const satisfies Record<string, PosStaffPermission>;
export type FoodAction = keyof typeof FOOD_ACTION_PERMISSIONS;
export type FoodTableState = "AVAILABLE" | "OCCUPIED" | "ORDER_SENT" | "READY" | "PAYMENT_PENDING";
export type FoodItem = {
  voided_at?: string | null;
  id: string; check_id: string; ticket_id: string | null; variant_id: string;
  product_name: string; variant_name: string; quantity: number; unit_price: number;
  tax_rate: number; subtotal: number; tax_amount: number; line_total: number;
  notes: string | null; created_by: string; created_at: string; version: number;
  configuration?: { modifiers?: FoodModifierSelection[]; modifier_snapshot_version?: number };
};
export type FoodModifierOption = { id: string; name: string; price_delta: number; type: "choice" | "add" | "remove"; display_order: number };
export type FoodModifierGroup = { id: string; name: string; required: boolean; min_selections: number; max_selections: number; selection_mode: "single" | "multiple"; display_order: number; options: FoodModifierOption[] };
export type FoodModifierSelection = { group_id: string; group_name: string; group_order: number; option_id: string; name: string; price_delta: number; type: "choice" | "add" | "remove"; display_order: number };
export type FoodTicket = {
  cancelled_at?: string | null;
  id: string; check_id: string; sequence: number; status: "PENDING" | "PREPARING" | "READY";
  sent_at: string; sent_by: string; preparing_at: string | null; preparing_by: string | null;
  ready_at: string | null; ready_by: string | null; served_at: string | null; served_by: string | null;
};
export type FoodCheck = {
  service_type?: 'DINE_IN' | 'COUNTER' | 'TAKEAWAY' | 'PICKUP'; order_number?: number;
  id: string; table_id: string | null; status: "OPEN" | "PAYMENT_PENDING" | "CLOSED" | "CANCELLED";
  guests: number; customer_name: string | null; opened_at: string; opened_by: string;
  customer_id: string | null;
  closed_at: string | null; closed_by: string | null; sale_id: string | null;
  currency: string; prices_include_tax: boolean; version: number;
};
export type FoodPayment = {
  id: string; brand_id: string; brand_slug: string; location_id: string; check_id: string;
  cashier_staff_id: string; cash_session_id?: string | null; method: "cash" | "card" | "other"; amount: number;
  amount_received: number; change_amount: number; reference: string | null;
  request_key: string; created_at: string; finalized_sale_id: string | null; finalized_at: string | null;
};
export type FoodPaymentAllocation = {
  id: string; brand_id: string; brand_slug: string; location_id: string; check_id: string;
  payment_id: string; food_item_id: string; quantity: number; amount: number; created_at: string;
};
export type FoodPaymentItemStatus = {
  food_item_id: string; check_id: string; quantity_total: number; quantity_paid: number; quantity_pending: number;
};
export type FoodLocation = { id: string; name: string; currency: string; prices_include_tax: boolean };
export type FoodProduct = { id: string; product_id?: string; product_name: string; name: string; category: string; price: number; tax_rate: number; available: number | null; image_url?: string | null; modifier_groups?: FoodModifierGroup[] };
export type FoodConfigurationPreview = { variantId: string; unitPrice: number; lineTotal: number; available: number | null; canAdd: boolean; reason: string | null };
export function automaticFoodModifierIds(groups: readonly FoodModifierGroup[]) {
  return groups.filter(group => group.required && group.selection_mode === 'single' && group.options.length === 1).map(group => group.options[0].id);
}
export function validFoodModifierSelection(groups: readonly FoodModifierGroup[], ids: readonly string[]) {
  if (new Set(ids).size !== ids.length || ids.some(id => !groups.some(group => group.options.some(option => option.id === id)))) return false;
  return groups.every(group => {
    const count = group.options.filter(option => ids.includes(option.id)).length;
    return count <= group.max_selections && (group.selection_mode !== "single" || count <= 1)
      && ((!group.required && count === 0) || count >= group.min_selections);
  });
}
export type FoodSnapshot = {
  operatorRoles?: PosStaffRole[];
  locations: FoodLocation[]; location: FoodLocation | null;
  tables: { id: string; name: string }[]; checks: FoodCheck[]; items: FoodItem[];
  tickets: FoodTicket[]; staff: { id: string; name: string }[]; products: FoodProduct[];
  cash_sessions: { id: string; register_name: string }[]; payments: FoodPayment[]; payment_allocations: FoodPaymentAllocation[]; payment_item_status: FoodPaymentItemStatus[];
};
export function foodTableState(check: FoodCheck | undefined, tickets: readonly FoodTicket[]): FoodTableState {
  if (!check || check.status === "CLOSED" || check.status === "CANCELLED") return "AVAILABLE";
  if (check.status === "PAYMENT_PENDING") return "PAYMENT_PENDING";
  const active = tickets.filter(ticket => ticket.check_id === check.id && !ticket.served_at);
  if (active.some(ticket => ticket.status === "READY")) return "READY";
  return active.length ? "ORDER_SENT" : "OCCUPIED";
}
export function foodRoleViews(role: PosStaffRole | readonly PosStaffRole[]): ("salon" | "kitchen" | "cash")[] {
  if (typeof role !== "string") return [...new Set(role.flatMap(value => foodRoleViews(value)))];
  if (role === "KITCHEN") return ["kitchen"];
  if (role === "CASHIER") return ["cash"];
  return role === "WAITER" ? ["salon"] : ["salon", "kitchen", "cash"];
}
