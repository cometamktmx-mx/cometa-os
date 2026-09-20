import "server-only";
import { requirePosOperationalAccess, requirePosCommercialAccess } from "./access";
import { getPosMode, requireStaffSession } from "./staff-server";
import { PosApiError, uuidValue } from "./server";
import { FOOD_ACTION_PERMISSIONS, type FoodAction } from "./food-shared";

export async function requireFoodAccess(brandSlug: string, action?: FoodAction, locationId?: string | null) {
  const context = await requirePosOperationalAccess({ brandSlug, entitlement: "pos.access" });
  if (await getPosMode(context) === "RETAIL") throw new PosApiError(403, "POS_FOOD_REQUIRED", "Esta operación requiere un perfil Food.");
  const session = await requireStaffSession(context, action ? FOOD_ACTION_PERMISSIONS[action] : "POS_ACCESS", locationId);
  if (action === "pay") {
    await requirePosCommercialAccess(context, "pos.sales");
    await requirePosCommercialAccess(context, "pos.cash");
  }
  return { context, session };
}

export function foodCommand(body: Record<string, unknown>) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new PosApiError(400, "POS_VALIDATION_ERROR", "La operación debe ser un objeto JSON.");
  }
  if (typeof body.action !== "string" || !Object.hasOwn(FOOD_ACTION_PERMISSIONS, body.action)) {
    throw new PosApiError(400, "POS_VALIDATION_ERROR", "Acción Food inválida.");
  }
  const action = body.action as FoodAction;
  const payload: Record<string, unknown> = {};
  const ids = action === "table_create" ? ["locationId"] : action === "open" ? ["tableId"]
    : action === "item_add" ? ["checkId", "variantId"] : action === "item_update" ? ["checkId", "itemId"]
    : ["prepare", "ready", "serve"].includes(action) ? ["checkId", "ticketId"]
    : action === "pay" ? ["checkId", "cashSessionId"] : ["checkId"];
  for (const key of ids) payload[key] = uuidValue(body[key], key);
  function integer(key: string, min: number, max: number) {
    const value = body[key];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) throw new PosApiError(400, "POS_VALIDATION_ERROR", `Valor inválido: ${key}.`);
    payload[key] = value;
  }
  function text(key: string, max: number, required = false) {
    const value = body[key];
    if (value != null && typeof value !== "string") throw new PosApiError(400, "POS_VALIDATION_ERROR", `Texto inválido: ${key}.`);
    const normalized = typeof value === "string" ? value.trim() : "";
    if (normalized.length > max || (required && !normalized)) throw new PosApiError(400, "POS_VALIDATION_ERROR", `Texto inválido: ${key}.`);
    payload[key] = normalized || null;
  }
  if (action === "table_create") text("name", 60, true);
  if (action === "customer_set") {
    if (body.customerId !== null && body.customerId !== undefined && body.customerId !== "") payload.customerId = uuidValue(body.customerId, "customerId", true);
    else payload.customerId = null;
  }
  if (action === "open") { integer("guests", 1, 100); text("customerName", 120); }
  if (action === "item_add" || action === "item_update") { integer("quantity", action === "item_add" ? 1 : 0, 999); text("notes", 500); }
  if ((action === "item_add" || action === "item_update") && body.modifierOptionIds !== undefined) {
    if (!Array.isArray(body.modifierOptionIds) || body.modifierOptionIds.length > 100) throw new PosApiError(400, "POS_VALIDATION_ERROR", "Selecciones de modificadores inválidas.");
    const ids = body.modifierOptionIds.map(value => uuidValue(value, "modifierOptionId"));
    if (new Set(ids).size !== ids.length) throw new PosApiError(400, "POS_VALIDATION_ERROR", "No repitas modificadores.");
    payload.modifierOptionIds = [...ids].sort();
  }
  if (["send", "request_payment", "resume", "pay", "item_update"].includes(action)) integer("version", 0, 2147483647);
  if (action === "pay") {
    if (!["cash", "card", "other"].includes(String(body.method))) throw new PosApiError(400, "POS_SALE_PAYMENT_INVALID", "Método de pago inválido.");
    payload.method = body.method;
    for (const key of ["amount", "amountReceived"]) {
      if (body[key] !== undefined && (typeof body[key] !== "number" || !Number.isFinite(body[key]) || body[key] <= 0)) throw new PosApiError(400, "POS_SALE_PAYMENT_INVALID", `Monto inválido: ${key}.`);
      if (body[key] !== undefined) payload[key] = body[key];
    }
    text("reference", 160);
    if (body.rewardId !== undefined && body.rewardId !== null && body.rewardId !== "") {
      payload.rewardId = uuidValue(body.rewardId, "rewardId");
    }
    if (body.rewardUnlockId !== undefined && body.rewardUnlockId !== null && body.rewardUnlockId !== "") {
      payload.rewardUnlockId = uuidValue(body.rewardUnlockId, "rewardUnlockId");
    }
    if (payload.rewardId && payload.rewardUnlockId) {
      throw new PosApiError(400, "POS_SALE_REWARD_INVALID", "Selecciona una sola recompensa.");
    }
    if (body.allocations !== undefined) {
      if (!Array.isArray(body.allocations) || body.allocations.length > 100) throw new PosApiError(400, "POS_SALE_PAYMENT_INVALID", "Asignaciones inválidas.");
      payload.allocations = body.allocations.map(value => {
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new PosApiError(400, "POS_SALE_PAYMENT_INVALID", "Asignación inválida.");
        const row = value as Record<string, unknown>;
        const foodItemId = uuidValue(row.foodItemId, "foodItemId");
        if (typeof row.quantity !== "number" || !Number.isFinite(row.quantity) || row.quantity <= 0) throw new PosApiError(400, "POS_SALE_PAYMENT_INVALID", "Cantidad asignada inválida.");
        return { foodItemId, quantity: row.quantity };
      });
    }
  }
  return { action, payload, idempotencyKey: uuidValue(body.idempotencyKey, "idempotencyKey") };
}

export function assertFoodResult(error: { message: string; code?: string } | null, data: unknown): asserts data is Record<string, unknown> {
  if (error) {
    const code = error.message.match(/POS_FOOD_[A-Z_]+/)?.[0];
    const messages: Record<string, string> = {
      POS_FOOD_RECIPE_PRECISION: "La cantidad no puede representarse exactamente en la unidad base del inventario.",
      POS_FOOD_RECIPE_UNIT: "Selecciona una unidad compatible con la unidad base del insumo.",
      POS_FOOD_RECIPE_INGREDIENT: "El insumo no está activo o no pertenece a esta marca.",
      POS_FOOD_RECIPE_INVALID: "La receta o el producto preparado no son válidos.",
      POS_FOOD_RECIPE_REQUIRED: "Publica una receta válida antes de enviar este producto.",
      POS_FOOD_RECIPE_EFFECT_CONFLICT: "Los impactos de modificadores son incompatibles con la receta base.",
      POS_FOOD_RECIPE_MODE_CONFLICT: "No se puede cambiar el modo mientras existan existencias o pedidos pendientes.",
      POS_FOOD_RECIPE_FROZEN: "La receta enviada y los consumos históricos son inmutables.",
      POS_FOOD_STOCK_UNAVAILABLE: "No hay suficientes existencias en esta sucursal. Revisa el inventario antes de continuar.",
      POS_FOOD_CONFLICT: "La cuenta cambió en otra terminal. Actualiza y revisa antes de reintentar.",
      POS_FOOD_TABLE_OCCUPIED: "Esta mesa ya tiene una cuenta abierta.",
      POS_FOOD_DRAFT_REQUIRED: "Agrega productos nuevos antes de enviar.",
      POS_FOOD_SERVICE_INCOMPLETE: "Envía y entrega todos los productos antes de solicitar el cobro.",
      POS_FOOD_PRICE_CHANGED: "Cambió el precio, impuesto o disponibilidad del catálogo. Solicita revisión administrativa antes de cobrar.",
      POS_FOOD_CASH_REQUIRED: "Selecciona un turno de caja abierto de esta sucursal.",
      POS_FOOD_CATALOG_UNAVAILABLE: "El producto no está disponible en esta sucursal.",
      POS_FOOD_DUPLICATE_TABLE: "Ya existe una mesa con ese nombre en esta sucursal.",
      POS_FOOD_MODIFIERS_SELECTION: "Completa los grupos obligatorios y respeta el mínimo y máximo de opciones.",
      POS_FOOD_MODIFIERS_INVALID: "Los modificadores cambiaron o no están disponibles. Actualiza y revisa las opciones.",
      POS_FOOD_MODIFIERS_FROZEN: "Los modificadores de un pedido enviado no pueden cambiarse.",
      POS_CUSTOMER_NOT_FOUND: "El cliente no existe o no pertenece a esta marca.",
      POS_FOOD_CHECKOUT_INVALID: "La cuenta no coincide con el checkout autorizado. Actualiza y solicita revisión de caja.",
      POS_FOOD_PAYMENT_EXCEEDS_BALANCE: "El pago supera el saldo pendiente.",
      POS_FOOD_CASH_INSUFFICIENT: "El efectivo recibido no cubre el importe de este pago.",
      POS_FOOD_PAYMENT_REFERENCE_REQUIRED: "Captura el folio o referencia del pago.",
      POS_FOOD_ALLOCATION_INVALID: "La asignación de artículos no es válida.",
      POS_FOOD_ALLOCATION_EXCEEDS_ITEM: "La cantidad seleccionada ya fue pagada o supera el pendiente.",
      POS_FOOD_ALLOCATION_AMOUNT_MISMATCH: "El importe no coincide con los artículos seleccionados.",
      POS_FOOD_RESUME_BLOCKED_PAYMENTS: "No puedes reanudar una cuenta que ya tiene pagos aplicados.",
    };
    if (code === "POS_FOOD_FORBIDDEN") throw new PosApiError(403, code, "El operador no tiene acceso a esta operación.");
    if (code === "POS_FOOD_SESSION_REQUIRED") throw new PosApiError(401, code, "La sesión del operador expiró. Vuelve a ingresar con PIN.");
    if (code === "POS_FOOD_NOT_FOUND") throw new PosApiError(404, code, "No se encontró el recurso en esta sucursal.");
    if (code && messages[code]) throw new PosApiError(409, code, messages[code]);
    if (code === "POS_FOOD_INVALID") throw new PosApiError(400, code, "Revisa los datos de la operación.");
    // Never expose PostgreSQL details, private payloads or internal exceptions.
    throw new PosApiError(503, "POS_FOOD_OPERATION_FAILED", "No se pudo completar la operación. Actualiza y reintenta; si persiste, solicita revisión de caja, catálogo e inventario.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new PosApiError(503, "POS_FOOD_OPERATION_FAILED", "No se pudo confirmar la operación.");
}
