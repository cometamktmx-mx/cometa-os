import {
  assertDatabaseResult,
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
    const { admin, brand } =
      await requirePosOperationalAccess({ brandSlug, entitlement: "pos.sales" });

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

    return ok({
      brand,
      sales,

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

    const { admin, brand, user } =
      await requirePosOperationalAccess({ brandSlug, entitlement: "pos.sales" });

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

    const {
      data,
      error,
    } = await admin.rpc(
      "pos_complete_sale_v4",
      {
        p_brand_slug:
          brand.slug,

        p_location_id:
          uuidValue(
            body.locationId,
            "locationId"
          ),

        p_register_id:
          uuidValue(
            body.registerId,
            "registerId"
          ),

        p_cash_session_id:
          uuidValue(
            body.cashSessionId,
            "cashSessionId"
          ),

        p_customer_id:
          uuidValue(
            body.customerId,
            "customerId",
            false
          ),

        p_items:
          normalizedItems,

        p_payments:
          normalizedPayments,

        p_notes:
          optionalText(
            body.notes,
            1000
          ),

        p_user_id:
          user.userId,

        p_reward_id:
          rewardId,

        p_idempotency_key:
          idempotencyKey,

        p_reward_unlock_id:
          rewardUnlockId,
      }
    );

    if (error) {
      const message =
        error.message || "";

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
