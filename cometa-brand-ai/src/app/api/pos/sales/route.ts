import { requirePosMutationAccess } from "@/lib/pos/mutation-access";
import {thermalReceipt} from "@/lib/pos/thermal";
import {
  assertDatabaseResult,
  PosApiError,
  fail,
  getBrandSlugFromUrl,
  getPagination,
  handlePosError,
  numberValue,
  ok,
  optionalText,
  readJsonBody,
  requiredText,
  uuidValue,
} from "@/lib/pos/server";
import { requirePosOperationalAccess } from "@/lib/pos/access";
import { requireStaffSession, getPosMode, requireRetailPermission } from "@/lib/pos/staff-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SaleItemBody = {
  variantId?: unknown;
  quantity?: unknown;
  discountAmount?: unknown;
};

type PaymentBody = {
  method?: unknown;
  amount?: unknown;

  // Campo que utilizará la interfaz de Cometa POS.
  tenderedAmount?: unknown;

  // Compatibilidad interna con payloads en snake_case.
  tendered_amount?: unknown;

  reference?: unknown;
  metadata?: unknown;
};

type SaleBody = {
  expectedQuote?: unknown;
  brandSlug?: unknown;
  locationId?: unknown;
  registerId?: unknown;
  cashSessionId?: unknown;
  customerId?: unknown;
  items?: unknown;
  payments?: unknown;
  notes?: unknown;
  rewardId?: unknown;
  rewardUnlockId?: unknown;
  idempotencyKey?: unknown;
};

const PAYMENT_METHODS = new Set([
  "cash",
  "card",
  "transfer",
  "wallet",
  "other",
]);

export async function GET(request: Request) {
  try {
    const brandSlug = getBrandSlugFromUrl(request);
    const context = await requirePosOperationalAccess({ brandSlug, entitlement: "pos.sales" });
    const { admin, brand } = context;
    const browserPrint = new URL(request.url).searchParams.get("print") === "1";
    const printStaff = browserPrint ? await requireRetailPermission(context,"REPRINT") : null;

    const {
      page,
      pageSize,
      from,
      to,
    } = getPagination(request);

    const url = new URL(request.url);

    const status =
      url.searchParams.get("status");

    const locationId =
      url.searchParams.get("locationId");

    const cashSessionId =
      url.searchParams.get("cashSessionId");
    const rawCustomerId = url.searchParams.get("customerId");
    const customerId = rawCustomerId
      ? uuidValue(rawCustomerId, "customerId")
      : null;
    const rawSaleId = url.searchParams.get("saleId");
    const saleId = rawSaleId ? uuidValue(rawSaleId, "saleId") : null;
    if(browserPrint && !saleId) throw new PosApiError(400,"POS_VALIDATION_ERROR","Selecciona la venta confirmada para imprimir.");

    let query = admin
      .from("pos_sales")
      .select(
        `
          *,
          location:pos_locations(
            id,
            name,
            code
          ),
          register:pos_registers(
            id,
            name,
            code
          ),
          customer:pos_customers(
            id,
            first_name,
            last_name,
            phone,
            email
          ),
          items:pos_sale_items(
            *
          ),
          payments:pos_payments(
            *
          ),
          loyalty_redemptions:pos_loyalty_redemptions(
            id,
            reward_id,
            reward_name,
            reward_type,
            reward_value,
            discount_applied,
            points_spent,
            status
          ),
          loyalty_transactions:pos_loyalty_transactions(
            transaction_type,
            points
          )
        `,
        {
          count: "exact",
        }
      )
      .eq("brand_slug", brand.slug)
      .order("sold_at", {
        ascending: false,
      })
      .range(from, to);

    if(browserPrint){
      query=query.in("status",["completed","partially_refunded","refunded"]);
      if(printStaff?.locationId)query=query.eq("location_id",printStaff.locationId);
      if(context.device?.locationId)query=query.eq("location_id",context.device.locationId);
    }
    if (status) {
      query = query.eq(
        "status",
        status
      );
    }

    if (locationId) {
      query = query.eq(
        "location_id",
        locationId
      );
    }

    if (cashSessionId) {
      query = query.eq(
        "cash_session_id",
        cashSessionId
      );
    }

    if (customerId) {
      query = query.eq("customer_id", customerId);
    }

    if (saleId) {
      query = query.eq("id", saleId);
    }

    const {
      data,
      error,
      count,
    } = await query;

    assertDatabaseResult(
      error,
      "No se pudieron cargar las ventas."
    );

    const sales = (data || []).map(
      (sale: any) => {
        const redemption = Array.isArray(
          sale.loyalty_redemptions
        )
          ? sale.loyalty_redemptions[0] || null
          : sale.loyalty_redemptions || null;
        const pointsEarned = (
          Array.isArray(sale.loyalty_transactions)
            ? sale.loyalty_transactions
            : []
        )
          .filter(
            (transaction: any) =>
              transaction.transaction_type === "earn"
          )
          .reduce(
            (total: number, transaction: any) =>
              total + Number(transaction.points || 0),
            0
          );
        const saleFields = { ...sale };
        delete saleFields.loyalty_redemptions;
        delete saleFields.loyalty_transactions;

        return {
        ...saleFields,

        subtotal: Number(
          sale.subtotal || 0
        ),

        discount_total: Number(
          sale.discount_total || 0
        ),

        loyalty_discount_total: Number(
          sale.loyalty_discount_total || 0
        ),

        tax_total: Number(
          sale.tax_total || 0
        ),

        total: Number(
          sale.total || 0
        ),

        items: (
          sale.items || []
        ).map((item: any) => ({
          ...item,

          quantity: Number(
            item.quantity || 0
          ),

          unit_price: Number(
            item.unit_price || 0
          ),

          discount_amount: Number(
            item.discount_amount || 0
          ),

          loyalty_discount_amount: Number(
            item.loyalty_discount_amount || 0
          ),

          tax_amount: Number(
            item.tax_amount || 0
          ),

          line_total: Number(
            item.line_total || 0
          ),
        })),

        payments: (
          sale.payments || []
        ).map((payment: any) => ({
          ...payment,

          amount: Number(
            payment.amount || 0
          ),

          tendered_amount: Number(
            payment.tendered_amount ||
              payment.amount ||
              0
          ),

          change_amount: Number(
            payment.change_amount || 0
          ),
        })),

        loyalty: {
          discountTotal: Number(
            sale.loyalty_discount_total || 0
          ),
          pointsRedeemed: redemption
            ? Number(redemption.points_spent || 0)
            : 0,
          pointsEarned,
          redemption: redemption
            ? {
                id: redemption.id,
                rewardId: redemption.reward_id,
                rewardName: redemption.reward_name,
                rewardType: redemption.reward_type,
                rewardValue: Number(redemption.reward_value || 0),
                discountApplied: Number(redemption.discount_applied || 0),
                pointsSpent: Number(redemption.points_spent || 0),
                status: redemption.status,
              }
            : null,
        },
      };
      }
    );

    let receiptHtml:string|undefined;
    if(browserPrint && sales.length===1){
      const sale=sales[0];
      const identity=await admin.from("pos_branding").select("display_name").eq("brand_slug",brand.slug).maybeSingle();
      assertDatabaseResult(identity.error,"No se pudo consultar la identidad del ticket.");
      const cashier=sale.cashier_staff_id?await admin.from("pos_staff").select("name").eq("brand_slug",brand.slug).eq("id",sale.cashier_staff_id).maybeSingle():null;
      assertDatabaseResult(cashier?.error??null,"No se pudo consultar el operador del ticket.");
      receiptHtml=thermalReceipt(sale,identity.data?.display_name||brand.slug,cashier?.data?.name||"No registrado",80,{copy:true,customer:sale.customer?[sale.customer.first_name,sale.customer.last_name].filter(Boolean).join(" "):undefined});
    }
    return ok({
      brand,
      sales,
      ...(receiptHtml?{receiptHtml}:{}),

      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil(
          (count || 0) / pageSize
        ),
      },
    });
  } catch (error) {
    return handlePosError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body =
      await readJsonBody<SaleBody>(
        request
      );

    const brandSlug = requiredText(
      body.brandSlug,
      "brandSlug",
      120
    );

    const access = await requirePosMutationAccess({ brandSlug: brandSlug, operation: "sale.create", locationId: body.locationId });
    const { admin, brand, user } = access;
    const posMode = (await getPosMode(access));

    const bodyRecord = body as Record<string, unknown>;
    const forbiddenRewardFields = [
      "pointsCost",
      "rewardValue",
      "rewardType",
      "loyaltyDiscount",
      "expectedBalance",
    ];

    if (
      forbiddenRewardFields.some((field) =>
        Object.prototype.hasOwnProperty.call(bodyRecord, field)
      )
    ) {
      return fail(
        "La venta contiene datos de fidelización que deben resolverse en el servidor.",
        400,
        "POS_SALE_REWARD_PAYLOAD_INVALID"
      );
    }

    const idempotencyKey = uuidValue(
      body.idempotencyKey,
      "idempotencyKey"
    ) as string;
    const rewardId = uuidValue(
      body.rewardId,
      "rewardId",
      false
    );
    const rewardUnlockId = uuidValue(
      body.rewardUnlockId,
      "rewardUnlockId",
      false
    );

    if (rewardId && rewardUnlockId) {
      return fail(
        "Sólo puede aplicarse una recompensa por venta.",
        400,
        "POS_SALE_REWARD_CONFLICT"
      );
    }

    const items = Array.isArray(body.items)
      ? (
          body.items as
            SaleItemBody[]
        )
      : [];

    const payments = Array.isArray(
      body.payments
    )
      ? (
          body.payments as
            PaymentBody[]
        )
      : [];

    if (items.length === 0) {
      return fail(
        "La venta debe contener al menos un producto.",
        400,
        "POS_SALE_ITEMS_REQUIRED"
      );
    }

    if (items.length > 250) {
      return fail(
        "Una venta no puede contener más de 250 partidas.",
        400,
        "POS_SALE_ITEMS_LIMIT"
      );
    }

    if (payments.length === 0) {
      return fail(
        "La venta debe contener al menos un pago.",
        400,
        "POS_SALE_PAYMENTS_REQUIRED"
      );
    }

    if (payments.length > 10) {
      return fail(
        "Una venta no puede contener más de 10 formas de pago.",
        400,
        "POS_SALE_PAYMENTS_LIMIT"
      );
    }

    const normalizedItems =
      items.map(
        (item, index) => ({
          variant_id: uuidValue(
            item.variantId,
            `items[${index}].variantId`
          ),

          quantity: numberValue(
            item.quantity,
            `items[${index}].quantity`,
            {
              min: 0.001,
            }
          ),

          discount_amount:
            numberValue(
              item.discountAmount,
              `items[${index}].discountAmount`,
              {
                min: 0,
                defaultValue: 0,
              }
            ),
        })
      );

    let appliedTotal = 0;
    let tenderedTotal = 0;
    let expectedChange = 0;

    const normalizedPayments =
      payments.map(
        (payment, index) => {
          const method =
            requiredText(
              payment.method,
              `payments[${index}].method`,
              30
            )
              .trim()
              .toLowerCase();

          if (
            !PAYMENT_METHODS.has(method)
          ) {
            throw new Error(
              `El método de pago “${method}” no está permitido.`
            );
          }

          const amount =
            roundMoney(
              numberValue(
                payment.amount,
                `payments[${index}].amount`,
                {
                  min: 0.01,
                }
              )
            );

          const rawTendered =
            payment.tenderedAmount ??
            payment.tendered_amount;

          const tenderedAmount =
            method === "cash"
              ? roundMoney(
                  numberValue(
                    rawTendered,
                    `payments[${index}].tenderedAmount`,
                    {
                      min: amount,
                      defaultValue: amount,
                    }
                  )
                )
              : amount;

          if (
            method !== "cash" &&
            rawTendered !== undefined &&
            rawTendered !== null &&
            rawTendered !== "" &&
            roundMoney(
              Number(rawTendered)
            ) !== amount
          ) {
            throw new Error(
              "Los pagos distintos a efectivo no pueden generar cambio."
            );
          }

          const changeAmount =
            method === "cash"
              ? roundMoney(
                  tenderedAmount -
                    amount
                )
              : 0;

          appliedTotal =
            roundMoney(
              appliedTotal + amount
            );

          tenderedTotal =
            roundMoney(
              tenderedTotal +
                tenderedAmount
            );

          expectedChange =
            roundMoney(
              expectedChange +
                changeAmount
            );

          const metadata =
            payment.metadata &&
            typeof payment.metadata ===
              "object" &&
            !Array.isArray(
              payment.metadata
            )
              ? payment.metadata
              : {};

          return {
            method,
            amount,

            // La función SQL del Paso 19 espera snake_case.
            tendered_amount:
              tenderedAmount,

            reference: optionalText(
              payment.reference,
              180
            ),

            metadata,
          };
        }
      );

    if (posMode === "RETAIL" && normalizedItems.some(item => Number(item.discount_amount) > 0)) await requireRetailPermission(access,"DISCOUNT");
    const cashierSession = await requireStaffSession(access, "SALE_CHARGE", uuidValue(body.locationId, "locationId") as string);
    const saleRpc = posMode === "RETAIL" ? "pos_complete_retail_sale_v1" : cashierSession ? "pos_complete_sale_with_staff_v1" : "pos_complete_sale_v4";
    const saleArgs: Record<string, unknown> = {
        p_brand_slug: brand.slug,
        p_location_id: uuidValue(body.locationId, "locationId"),
        p_register_id: uuidValue(body.registerId, "registerId"),
        p_cash_session_id: uuidValue(body.cashSessionId, "cashSessionId"),
        p_customer_id: uuidValue(body.customerId, "customerId", false),
        p_items: normalizedItems,
        p_payments: normalizedPayments,
        p_notes: optionalText(body.notes, 1000),
        p_user_id: user.userId,
        p_reward_id: rewardId,
        p_idempotency_key: idempotencyKey,
        p_reward_unlock_id: rewardUnlockId,
    };
    if (cashierSession) {
      saleArgs.p_served_by_staff_id = null;
      saleArgs.p_cashier_staff_id = cashierSession.staff.id;
    }
    if(posMode === "RETAIL")saleArgs.p_expected_quote=body.expectedQuote??null;
    const {
      data,
      error,
    } = await admin.rpc(saleRpc, saleArgs);

    if (error) {
      const message =
        error.message || "";

      if (["POS_PRICES_CHANGED", "POS_QUOTE_REQUIRED"].includes(message)) {
        return fail("Los precios cambiaron. Revisa el pedido y actualiza los precios antes de cobrar. No se registró el pago.", 409, "POS_SALE_VALIDATION_ERROR");
      }
      if (message === "POS_IDEMPOTENCY_CONFLICT") {
        return fail("La solicitud ya fue utilizada con otros datos. Revisa las ventas antes de volver a cobrar.", 409, "POS_SALE_VALIDATION_ERROR");
      }

      const validationMessages = [
        "no cubre el total",
        "superan el total",
        "Método de pago no permitido",
        "monto aplicado",
        "efectivo recibido",
        "no cubre el monto aplicado",
        "La caja no tiene un turno abierto",
        "no pertenece",
        "sin inventario suficiente",
        "no está disponible",
        "La venta debe contener",
        "Conflicto de idempotencia",
        "recompensa",
        "Recompensa",
        "fidelización",
        "Fidelización",
        "puntos suficientes",
        "saldo suficiente",
        "recompensa desbloqueada",
        "Recompensa desbloqueada",
        "Sólo puede aplicarse una recompensa",
      ];

      if (
        validationMessages.some(
          (fragment) =>
            message.includes(fragment)
        )
      ) {
        return fail(
          message,
          400,
          "POS_SALE_VALIDATION_ERROR"
        );
      }
    }

    assertDatabaseResult(
      error,
      "No se pudo completar la venta."
    );

    return ok(
      {
        sale: data,

        paymentSummary: {
          appliedTotal,
          tenderedTotal,
          expectedChange,
        },
      },
      201
    );
  } catch (error) {
    if (
      error instanceof Error &&
      (
        error.message.includes(
          "método de pago"
        ) ||
        error.message.includes(
          "no pueden generar cambio"
        )
      )
    ) {
      return fail(
        error.message,
        400,
        "POS_SALE_PAYMENT_INVALID"
      );
    }

    return handlePosError(error);
  }
}

function roundMoney(value: number) {
  return Math.round(
    (
      Number(value || 0) +
      Number.EPSILON
    ) * 100
  ) / 100;
}
