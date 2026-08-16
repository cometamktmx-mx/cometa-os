"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePosContext } from "../../components/pos-shell";
import { PosIcon } from "../../components/pos-icons";
import {
  PosBadge,
  PosButton,
  PosCard,
  PosDataTable,
  PosPage,
  PosPageHeader,
  PosSection,
} from "../../components/pos-ui";

type PaymentMethod =
  | "cash"
  | "card"
  | "transfer"
  | "wallet"
  | "other";

type SaleItem = {
  id: string;
  product_id: string;
  variant_id: string;
  product_name: string;
  variant_name: string;
  sku: string | null;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  discount_amount: number;
  loyalty_discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  line_total: number;
};

type SalePayment = {
  id: string;
  payment_method: PaymentMethod;
  amount: number;
  tendered_amount: number;
  change_amount: number;
  reference: string | null;
  created_at: string;
};

type Sale = {
  id: string;
  sale_number: string;
  status:
    | "completed"
    | "partially_refunded"
    | "refunded"
    | "void";
  location_id: string;
  register_id: string;
  cash_session_id: string;
  customer_id: string | null;
  subtotal: number;
  discount_total: number;
  loyalty_discount_total: number;
  tax_total: number;
  total: number;
  currency: string;
  sold_at: string;
  notes: string | null;
  location?: {
    id: string;
    name: string;
    code: string;
  } | null;
  register?: {
    id: string;
    name: string;
    code: string;
  } | null;
  customer?: {
    id: string;
    first_name: string;
    last_name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  items: SaleItem[];
  payments: SalePayment[];
  loyalty: {
    discountTotal: number;
    pointsRedeemed: number;
    pointsEarned: number;
    redemption: {
      id: string;
      rewardId: string;
      rewardName: string;
      rewardType: string;
      rewardValue: number;
      discountApplied: number;
      pointsSpent: number;
      status: string;
    } | null;
  };
};

type SalesResponse = {
  ok: true;
  sales: Sale[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type Branding = {
  display_name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  text_color: string;
  loyalty_program_name: string;
  loyalty_message: string;
  whatsapp: string | null;
  website: string | null;
  ticket_footer: string | null;
};

type BootstrapResponse = {
  ok: true;
  branding: Branding;
  locations: Array<{
    id: string;
    name: string;
    code: string;
    currency: string;
  }>;
};

type DateFilter =
  | "today"
  | "week"
  | "month"
  | "all";

const PAYMENT_LABELS: Record<
  PaymentMethod,
  string
> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  wallet: "Wallet",
  other: "Otro",
};

const STATUS_LABELS: Record<
  Sale["status"],
  string
> = {
  completed: "Completada",
  partially_refunded:
    "Reembolso parcial",
  refunded: "Reembolsada",
  void: "Anulada",
};

export default function PosSalesPage() {
  const { brand } = usePosContext();

  const [sales, setSales] = useState<
    Sale[]
  >([]);
  const [branding, setBranding] =
    useState<Branding | null>(null);
  const [totalSales, setTotalSales] =
    useState(0);

  const [search, setSearch] =
    useState("");
  const [dateFilter, setDateFilter] =
    useState<DateFilter>("today");
  const [
    paymentFilter,
    setPaymentFilter,
  ] = useState<
    PaymentMethod | "all"
  >("all");
  const [
    selectedSale,
    setSelectedSale,
  ] = useState<Sale | null>(null);

  const [isLoading, setIsLoading] =
    useState(true);
  const [error, setError] = useState<
    string | null
  >(null);
  const pendingAutoPrintSaleId = useRef<string | null>(null);

  const loadSales =
    useCallback(async () => {
      try {
        setIsLoading(true);
        setError(null);

        const searchParams = new URLSearchParams(window.location.search);
        const requestedSaleId = searchParams.get("saleId");
        const shouldPrint = searchParams.get("print") === "1";
        const saleFilter = requestedSaleId
          ? `&saleId=${encodeURIComponent(requestedSaleId)}`
          : "";

        const [
          salesData,
          bootstrap,
        ] = await Promise.all([
          apiRequest<SalesResponse>(
            `/api/pos/sales?brandSlug=${encodeURIComponent(
              brand.slug
            )}&pageSize=100${saleFilter}`
          ),
          apiRequest<BootstrapResponse>(
            `/api/pos/bootstrap?brandSlug=${encodeURIComponent(
              brand.slug
            )}`
          ),
        ]);

        setSales(
          salesData.sales || []
        );
        if (requestedSaleId) {
          const requestedSale = (salesData.sales || []).find(
            (sale) => sale.id === requestedSaleId
          );
          if (requestedSale) {
            setSelectedSale(requestedSale);
            pendingAutoPrintSaleId.current = shouldPrint ? requestedSaleId : null;
          }
        }
        setTotalSales(
          salesData.pagination
            ?.total || 0
        );
        setBranding(
          bootstrap.branding
        );
      } catch (loadError) {
        setError(
          getErrorMessage(loadError)
        );
      } finally {
        setIsLoading(false);
      }
    }, [brand.slug]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  useEffect(() => {
    if (!selectedSale || !branding || pendingAutoPrintSaleId.current !== selectedSale.id) return;
    pendingAutoPrintSaleId.current = null;
    const timer = window.setTimeout(() => window.print(), 150);
    return () => window.clearTimeout(timer);
  }, [branding, selectedSale]);

  const filteredSales =
    useMemo(() => {
      const query = search
        .trim()
        .toLowerCase();

      return sales.filter(
        (sale) => {
          if (
            !matchesDateFilter(
              sale.sold_at,
              dateFilter
            )
          ) {
            return false;
          }

          if (
            paymentFilter !==
              "all" &&
            !sale.payments.some(
              (payment) =>
                payment.payment_method ===
                paymentFilter
            )
          ) {
            return false;
          }

          if (!query) {
            return true;
          }

          const customerName =
            sale.customer
              ? `${sale.customer.first_name} ${
                  sale.customer
                    .last_name || ""
                }`
              : "Público general";

          return [
            sale.sale_number,
            sale.location?.name ||
              "",
            sale.register?.name ||
              "",
            customerName,
            sale.customer?.phone ||
              "",
            ...sale.items.flatMap(
              (item) => [
                item.product_name,
                item.variant_name,
                item.sku || "",
              ]
            ),
          ].some((value) =>
            value
              .toLowerCase()
              .includes(query)
          );
        }
      );
    }, [
      sales,
      search,
      dateFilter,
      paymentFilter,
    ]);

  const metrics = useMemo(() => {
    const completed =
      filteredSales.filter(
        (sale) =>
          sale.status ===
            "completed" ||
          sale.status ===
            "partially_refunded"
      );

    const revenue = completed.reduce(
      (total, sale) =>
        total +
        Number(sale.total || 0),
      0
    );

    const cash = completed.reduce(
      (total, sale) =>
        total +
        sale.payments
          .filter(
            (payment) =>
              payment.payment_method ===
              "cash"
          )
          .reduce(
            (
              paymentTotal,
              payment
            ) =>
              paymentTotal +
              Number(
                payment.amount || 0
              ),
            0
          ),
      0
    );

    const card = completed.reduce(
      (total, sale) =>
        total +
        sale.payments
          .filter(
            (payment) =>
              payment.payment_method ===
              "card"
          )
          .reduce(
            (
              paymentTotal,
              payment
            ) =>
              paymentTotal +
              Number(
                payment.amount || 0
              ),
            0
          ),
      0
    );

    return {
      tickets: completed.length,
      revenue,
      averageTicket:
        completed.length > 0
          ? revenue /
            completed.length
          : 0,
      cash,
      card,
    };
  }, [filteredSales]);

  const currency =
    sales[0]?.currency ||
    "MXN";

  if (isLoading) {
    return (
      <PosPage width="wide" density="compact" aria-busy="true">
        <div className="h-20 animate-pulse border-b border-[var(--pos-line-subtle)]" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-[var(--pos-radius-md)] bg-white/[0.035]" />
          ))}
        </div>
        <div className="h-12 animate-pulse rounded-[var(--pos-radius-md)] bg-white/[0.035]" />
        <div className="overflow-hidden rounded-[var(--pos-radius-md)] bg-[var(--pos-panel)]">
          <div className="h-10 animate-pulse border-b border-[var(--pos-line-subtle)] bg-white/[0.025]" />
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse border-b border-[var(--pos-line-subtle)] last:border-0" />
          ))}
        </div>
      </PosPage>
    );
  }

  return (
    <PosPage width="wide" density="compact">
      <PosPageHeader
        compact
        title="Ventas"
        description="Consulta transacciones, pagos y comprobantes del punto de venta."
        meta={`${totalSales} ventas registradas`}
      />

      <section aria-label="Resumen de ventas" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <HeaderMetric label="Ventas filtradas" value={String(metrics.tickets)} />
        <HeaderMetric label="Total vendido" value={formatMoney(metrics.revenue, currency)} />
        <HeaderMetric label="Ticket promedio" value={formatMoney(metrics.averageTicket, currency)} />
        <HeaderMetric label="Efectivo" value={formatMoney(metrics.cash, currency)} />
      </section>

      {error ? (
        <PosCard variant="danger" padding="compact" className="flex items-center justify-between gap-4">
          <p className="text-sm text-rose-200">{error}</p>
          <PosButton variant="secondary" size="compact" onClick={() => void loadSales()}>
            Reintentar
          </PosButton>
        </PosCard>
      ) : null}

      <PosSection
        title="Historial"
        description={`${filteredSales.length} resultados en las ventas cargadas`}
      >
        <div className="grid gap-2 rounded-[var(--pos-radius-md)] bg-[var(--pos-panel)] p-3 md:grid-cols-[minmax(240px,1fr)_180px_180px]">
          <label className="relative">
            <PosIcon
              name="search"
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600"
            />

            <input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Buscar ticket, producto, SKU o cliente"
              className="pos-ui-focus h-10 w-full rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] bg-[var(--pos-canvas)] pl-10 pr-3 text-sm text-[var(--pos-text-primary)] outline-none placeholder:text-[var(--pos-text-muted)]"
            />
          </label>

          <select
            value={dateFilter}
            onChange={(event) =>
              setDateFilter(
                event.target
                  .value as DateFilter
              )
            }
            className="pos-ui-focus h-10 rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] bg-[var(--pos-canvas)] px-3 text-sm text-[var(--pos-text-primary)] outline-none"
          >
            <option value="today">
              Ventas de hoy
            </option>
            <option value="week">
              Últimos 7 días
            </option>
            <option value="month">
              Este mes
            </option>
            <option value="all">
              Todas las cargadas
            </option>
          </select>

          <select
            value={paymentFilter}
            onChange={(event) =>
              setPaymentFilter(
                event.target.value as
                  | PaymentMethod
                  | "all"
              )
            }
            className="pos-ui-focus h-10 rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] bg-[var(--pos-canvas)] px-3 text-sm text-[var(--pos-text-primary)] outline-none"
          >
            <option value="all">
              Todos los pagos
            </option>
            <option value="cash">
              Efectivo
            </option>
            <option value="card">
              Tarjeta
            </option>
            <option value="transfer">
              Transferencia
            </option>
            <option value="wallet">
              Wallet
            </option>
            <option value="other">
              Otro
            </option>
          </select>
        </div>

        {filteredSales.length > 0 ? (
          <>
          <div className="hidden md:block">
            <PosDataTable caption="Historial de ventas" density="compact" minWidth={780}>
              <thead className="bg-[var(--pos-panel-raised)] text-left text-[11px] font-semibold text-[var(--pos-text-muted)]">
                <tr>
                  <th>Venta</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th className="hidden lg:table-cell">Pago</th>
                  <th className="text-right">Total</th>
                  <th>Estado</th>
                  <th className="text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map((sale) => (
                  <SaleTableRow key={sale.id} sale={sale} onOpen={() => setSelectedSale(sale)} />
                ))}
              </tbody>
            </PosDataTable>
          </div>
          <div className="grid gap-2 md:hidden">
            {filteredSales.map(
              (sale) => (
                <SaleRow
                  key={sale.id}
                  sale={sale}
                  onOpen={() =>
                    setSelectedSale(
                      sale
                    )
                  }
                />
              )
            )}
          </div>
          </>
        ) : (
          <EmptySales
            hasSales={
              sales.length > 0
            }
          />
        )}
      </PosSection>

      {selectedSale ? (
        <SaleDetailModal
          sale={selectedSale}
          branding={branding}
          onClose={() =>
            setSelectedSale(null)
          }
          onPrint={() =>
            window.print()
          }
        />
      ) : null}
    </PosPage>
  );
}

function SaleTableRow({
  sale,
  onOpen,
}: {
  sale: Sale;
  onOpen: () => void;
}) {
  const primaryPayment = sale.payments[0];
  const customerName = sale.customer
    ? `${sale.customer.first_name} ${sale.customer.last_name || ""}`.trim()
    : "Público general";

  return (
    <tr
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className="cursor-pointer border-t border-[var(--pos-line-subtle)] transition-colors hover:bg-white/[0.035] focus-visible:bg-[var(--pos-row-selected)] focus-visible:outline-none"
    >
      <td>
        <span className="font-mono text-xs font-semibold text-[var(--pos-text-primary)]">
          {sale.sale_number}
        </span>
      </td>
      <td className="whitespace-nowrap text-xs text-[var(--pos-text-secondary)]">
        {formatDateTime(sale.sold_at)}
      </td>
      <td>
        <span className="block max-w-44 truncate text-sm text-[var(--pos-text-primary)]">
          {customerName}
        </span>
      </td>
      <td className="hidden lg:table-cell">
        {primaryPayment ? PAYMENT_LABELS[primaryPayment.payment_method] : "Sin pago"}
        {sale.payments.length > 1 ? ` +${sale.payments.length - 1}` : ""}
      </td>
      <td className="whitespace-nowrap text-right text-sm font-semibold text-[var(--pos-text-primary)]">
        {formatMoney(sale.total, sale.currency)}
      </td>
      <td><StatusBadge status={sale.status} /></td>
      <td className="text-right">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          className="pos-ui-focus h-9 rounded-[var(--pos-radius-sm)] px-3 text-xs font-semibold text-[var(--pos-primary)] hover:bg-[var(--pos-primary-soft)]"
        >
          Ver detalle
        </button>
      </td>
    </tr>
  );
}

function SaleRow({
  sale,
  onOpen,
}: {
  sale: Sale;
  onOpen: () => void;
}) {
  const primaryPayment =
    sale.payments[0];

  const articleCount =
    sale.items.reduce(
      (total, item) =>
        total +
        Number(item.quantity || 0),
      0
    );

  const customerName =
    sale.customer
      ? `${sale.customer.first_name} ${
          sale.customer.last_name ||
          ""
        }`.trim()
      : "Público general";

  return (
    <button type="button" onClick={onOpen} className="pos-ui-focus w-full rounded-[var(--pos-radius-md)] bg-[var(--pos-panel)] p-4 text-left">
      <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--pos-radius-sm)] bg-white/[0.05] text-[var(--pos-text-secondary)]">
            <PosIcon
              name="receipt"
              className="h-5 w-5"
            />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-xs font-semibold text-[var(--pos-text-primary)]">
                {sale.sale_number}
              </p>

              <StatusBadge
                status={sale.status}
              />
            </div>

            <p className="mt-1 truncate text-xs text-[var(--pos-text-secondary)]">
              {formatDateTime(
                sale.sold_at
              )}{" "}
              ·{" "}
              {sale.register?.name ||
                "Caja"}{" "}
              · {customerName}
            </p>

            <p className="mt-1 truncate text-[11px] text-[var(--pos-text-muted)]">
              {sale.items
                .slice(0, 3)
                .map(
                  (item) =>
                    `${formatQuantity(
                      item.quantity
                    )}× ${
                      item.product_name
                    }`
                )
                .join(" · ")}
              {sale.items.length > 3
                ? ` · +${
                    sale.items.length -
                    3
                  }`
                : ""}
            </p>
          </div>
          <div className="ml-auto shrink-0 text-right">
          <p className="text-base font-semibold text-[var(--pos-text-primary)]">
            {formatMoney(
              sale.total,
              sale.currency
            )}
          </p>

          <p className="mt-1 text-[11px] text-[var(--pos-text-muted)]">
            {primaryPayment ? PAYMENT_LABELS[primaryPayment.payment_method] : "Sin pago"} · {formatQuantity(articleCount)} artículos
          </p>
        </div>
      </div>
    </button>
  );
}

function SaleDetailModal({
  sale,
  branding,
  onClose,
  onPrint,
}: {
  sale: Sale;
  branding: Branding | null;
  onClose: () => void;
  onPrint: () => void;
}) {
  const totalTendered =
    sale.payments.reduce(
      (total, payment) =>
        total +
        Number(
          payment.tendered_amount ||
            payment.amount ||
            0
        ),
      0
    );

  const totalChange =
    sale.payments.reduce(
      (total, payment) =>
        total +
        Number(
          payment.change_amount || 0
        ),
      0
    );
  const loyaltyDiscount = Number(
    sale.loyalty?.discountTotal ??
      sale.loyalty_discount_total ??
      0
  );
  const manualDiscount = Math.max(
    Number(sale.discount_total || 0) - loyaltyDiscount,
    0
  );
  const hasLoyaltyRedemption =
    loyaltyDiscount > 0 ||
    Boolean(sale.loyalty?.redemption);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--pos-overlay)] p-0 backdrop-blur-sm sm:p-4 print:static print:block print:bg-white print:p-0">
      <div className="grid h-full w-full overflow-hidden bg-[var(--pos-panel-raised)] shadow-[var(--pos-shadow-overlay)] lg:h-auto lg:max-h-[94vh] lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_360px] lg:rounded-[var(--pos-radius-lg)] print:block print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:border-0 print:bg-white print:shadow-none">
        <div className="pos-ui-scrollbar overflow-y-auto p-5 md:p-6 print:hidden">
          <div className="flex items-start justify-between gap-5 border-b border-[var(--pos-line-subtle)] pb-4">
            <div>
              <p className="text-xs font-medium text-[var(--pos-text-muted)]">
                Detalle de venta
              </p>
              <h3 className="mt-1 font-mono text-xl font-semibold text-[var(--pos-text-primary)] md:text-2xl">
                {sale.sale_number}
              </h3>
              <p className="mt-1 text-xs text-[var(--pos-text-secondary)]">
                {formatDateTime(
                  sale.sold_at
                )}{" "}
                ·{" "}
                {sale.location?.name ||
                  "Sucursal"}{" "}
                ·{" "}
                {sale.register?.name ||
                  "Caja"}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="pos-ui-focus flex h-10 w-10 items-center justify-center rounded-[var(--pos-radius-sm)] text-[var(--pos-text-muted)] hover:bg-white/[0.05] hover:text-[var(--pos-text-primary)]"
            >
              <PosIcon
                name="close"
                className="h-5 w-5"
              />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <DetailMetric
              label="Total"
              value={formatMoney(
                sale.total,
                sale.currency
              )}
            />
            <DetailMetric
              label="Recibido"
              value={formatMoney(
                totalTendered,
                sale.currency
              )}
            />
            <DetailMetric
              label="Cambio"
              value={formatMoney(
                totalChange,
                sale.currency
              )}
              accent
            />
          </div>

          <div className="mt-5 border-t border-[var(--pos-line-subtle)] pt-4">
            <p className="text-xs font-semibold text-[var(--pos-text-secondary)]">Cliente</p>
            <p className="mt-1 text-sm font-semibold text-[var(--pos-text-primary)]">
              {sale.customer
                ? `${sale.customer.first_name} ${sale.customer.last_name || ""}`.trim()
                : "Público general"}
            </p>
            {sale.customer?.phone || sale.customer?.email ? (
              <p className="mt-1 text-xs text-[var(--pos-text-muted)]">
                {sale.customer.phone || sale.customer.email}
              </p>
            ) : null}
          </div>

          <div className="mt-5">
            <p className="text-sm font-semibold text-[var(--pos-text-secondary)]">
              Productos
            </p>

            <div className="mt-2 overflow-hidden rounded-[var(--pos-radius-md)] bg-[var(--pos-canvas)]">
              {sale.items.map(
                (item) => (
                  <div
                    key={item.id}
                    className="border-b border-[var(--pos-line-subtle)] p-3 last:border-0"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--pos-text-primary)]">
                          {
                            item.product_name
                          }
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--pos-text-muted)]">
                          {
                            item.variant_name
                          }
                          {item.sku
                            ? ` · SKU ${item.sku}`
                            : ""}
                        </p>
                      </div>

                      <p className="text-sm font-semibold text-[var(--pos-text-primary)]">
                        {formatMoney(
                          item.line_total,
                          sale.currency
                        )}
                      </p>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--pos-text-secondary)]">
                      <span>
                        {formatQuantity(
                          item.quantity
                        )}{" "}
                        ×{" "}
                        {formatMoney(
                          item.unit_price,
                          sale.currency
                        )}
                      </span>

                      <span>
                        Impuesto{" "}
                        {formatMoney(
                          item.tax_amount,
                          sale.currency
                        )}
                      </span>

                      {Math.max(
                        Number(item.discount_amount || 0) -
                          Number(item.loyalty_discount_amount || 0),
                        0
                      ) > 0 ? (
                        <span className="text-emerald-300">
                          Descuento manual{" "}
                          {formatMoney(
                            Math.max(
                              Number(item.discount_amount || 0) -
                                Number(item.loyalty_discount_amount || 0),
                              0
                            ),
                            sale.currency
                          )}
                        </span>
                      ) : null}
                      {Number(item.loyalty_discount_amount || 0) > 0 ? (
                        <span className="text-cyan-300">
                          Fidelización{" "}
                          {formatMoney(
                            item.loyalty_discount_amount,
                            sale.currency
                          )}
                        </span>
                      ) : null}
                    </div>
                  </div>
                )
              )}
            </div>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-[var(--pos-text-secondary)]">
                Pagos
              </p>

              <div className="mt-2 overflow-hidden rounded-[var(--pos-radius-md)] bg-[var(--pos-canvas)]">
                {sale.payments.map(
                  (payment) => (
                    <div
                      key={payment.id}
                      className="border-b border-[var(--pos-line-subtle)] p-3 last:border-0"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-sm font-semibold text-[var(--pos-text-primary)]">
                          {
                            PAYMENT_LABELS[
                              payment
                                .payment_method
                            ]
                          }
                        </p>

                        <p className="text-sm font-semibold text-[var(--pos-text-primary)]">
                          {formatMoney(
                            payment.amount,
                            sale.currency
                          )}
                        </p>
                      </div>

                      {payment.payment_method ===
                      "cash" ? (
                        <p className="mt-1 text-[11px] text-[var(--pos-text-muted)]">
                          Recibido{" "}
                          {formatMoney(
                            payment.tendered_amount,
                            sale.currency
                          )}{" "}
                          · Cambio{" "}
                          {formatMoney(
                            payment.change_amount,
                            sale.currency
                          )}
                        </p>
                      ) : payment.reference ? (
                        <p className="mt-1 text-[11px] text-[var(--pos-text-muted)]">
                          Referencia:{" "}
                          {
                            payment.reference
                          }
                        </p>
                      ) : null}
                    </div>
                  )
                )}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-[var(--pos-text-secondary)]">
                Resumen
              </p>

              <div className="mt-2 rounded-[var(--pos-radius-md)] bg-[var(--pos-canvas)] p-4">
                <SummaryLine
                  label="Subtotal"
                  value={formatMoney(
                    sale.subtotal,
                    sale.currency
                  )}
                />
                <SummaryLine
                  label="Descuentos existentes"
                  value={formatMoney(
                    manualDiscount > 0
                      ? -manualDiscount
                      : 0,
                    sale.currency
                  )}
                />
                {loyaltyDiscount > 0 ? (
                  <SummaryLine
                    label="Fidelización"
                    value={formatMoney(
                      -loyaltyDiscount,
                      sale.currency
                    )}
                  />
                ) : null}
                <SummaryLine
                  label="Impuestos"
                  value={formatMoney(
                    sale.tax_total,
                    sale.currency
                  )}
                />

                <div className="mt-4 flex items-end justify-between gap-4 border-t border-white/[0.08] pt-4">
                  <p className="text-sm font-semibold text-[var(--pos-text-primary)]">
                    Total
                  </p>
                  <p className="text-2xl font-bold tracking-[-0.04em] text-[var(--pos-text-primary)]">
                    {formatMoney(
                      sale.total,
                      sale.currency
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {hasLoyaltyRedemption ? (
            <div className="mt-5 rounded-[var(--pos-radius-md)] bg-[var(--pos-success-soft)] p-4">
              <p className="text-sm font-semibold text-[var(--pos-success)]">
                Fidelización
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <LoyaltyDetail
                  label="Recompensa"
                  value={sale.loyalty.redemption?.rewardName || "Descuento de fidelización"}
                />
                <LoyaltyDetail
                  label="Estado del canje"
                  value={redemptionStatusLabel(sale.loyalty.redemption?.status)}
                />
                <LoyaltyDetail
                  label="Puntos utilizados"
                  value={formatInteger(sale.loyalty.pointsRedeemed)}
                />
                <LoyaltyDetail
                  label="Descuento aplicado"
                  value={formatMoney(loyaltyDiscount, sale.currency)}
                />
                <LoyaltyDetail
                  label="Puntos ganados"
                  value={`+${formatInteger(sale.loyalty.pointsEarned)}`}
                />
              </div>
            </div>
          ) : null}

          {sale.notes ? (
            <div className="mt-6 rounded-[18px] border border-white/[0.07] bg-white/[0.025] p-4">
              <p className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-700">
                Notas
              </p>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">
                {sale.notes}
              </p>
            </div>
          ) : null}

          <button
            type="button"
            onClick={onPrint}
            className="pos-ui-focus mt-5 flex h-11 w-full items-center justify-center rounded-[var(--pos-radius-sm)] bg-[var(--pos-primary)] px-5 text-sm font-semibold text-slate-950"
          >
            Reimprimir ticket térmico
          </button>
        </div>

        <div className="hidden border-l border-[var(--pos-line-subtle)] bg-white p-5 text-slate-950 lg:block print:block print:border-0 print:p-0">
          <ThermalReceipt
            sale={sale}
            branding={branding}
          />
        </div>
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: 80mm auto;
            margin: 0;
          }

          html,
          body {
            width: 80mm !important;
            min-width: 80mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }

          body * {
            visibility: hidden !important;
          }

          .pos-print-receipt,
          .pos-print-receipt * {
            visibility: visible !important;
          }

          .pos-print-receipt {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 80mm !important;
            min-height: auto !important;
            margin: 0 !important;
            padding: 5mm !important;
            color: #000 !important;
            background: #fff !important;
            box-shadow: none !important;
          }
        }
      `}</style>
    </div>
  );
}

function ThermalReceipt({
  sale,
  branding,
}: {
  sale: Sale;
  branding: Branding | null;
}) {
  const totalTendered =
    sale.payments.reduce(
      (total, payment) =>
        total +
        Number(
          payment.tendered_amount ||
            payment.amount ||
            0
        ),
      0
    );

  const totalChange =
    sale.payments.reduce(
      (total, payment) =>
        total +
        Number(
          payment.change_amount || 0
        ),
      0
    );

  const customerName =
    sale.customer
      ? `${sale.customer.first_name} ${
          sale.customer.last_name ||
          ""
        }`.trim()
      : "Público general";

  const loyaltyDiscount = Number(
    sale.loyalty?.discountTotal ??
      sale.loyalty_discount_total ??
      0
  );
  const manualDiscount = Math.max(
    Number(sale.discount_total || 0) - loyaltyDiscount,
    0
  );
  const hasLoyaltyRedemption =
    loyaltyDiscount > 0 ||
    Boolean(sale.loyalty?.redemption);

  return (
    <div className="pos-print-receipt mx-auto w-full max-w-[80mm] bg-white px-2 py-4 font-mono text-[11px] leading-[1.35] text-black">
      <div className="text-center">
        {branding?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={branding.logo_url}
            alt={
              branding.display_name
            }
            className="mx-auto mb-3 h-14 max-w-40 object-contain grayscale"
          />
        ) : null}

        <p className="text-base font-black uppercase">
          {branding?.display_name ||
            "Cometa POS"}
        </p>

        <p className="mt-1">
          {sale.location?.name ||
            "Sucursal"}
        </p>

        {branding?.whatsapp ? (
          <p>
            WhatsApp{" "}
            {branding.whatsapp}
          </p>
        ) : null}

        {branding?.website ? (
          <p className="break-all">
            {branding.website}
          </p>
        ) : null}
      </div>

      <ReceiptDivider />

      <div>
        <ReceiptTextLine
          label="Ticket"
          value={sale.sale_number}
        />
        <ReceiptTextLine
          label="Fecha"
          value={formatDateTime(
            sale.sold_at
          )}
        />
        <ReceiptTextLine
          label="Caja"
          value={
            sale.register?.name ||
            "Caja"
          }
        />
        <ReceiptTextLine
          label="Cliente"
          value={customerName}
        />
      </div>

      <ReceiptDivider />

      <div className="grid gap-3">
        {sale.items.map((item) => (
          <div key={item.id}>
            <p className="font-black uppercase">
              {item.product_name}
            </p>

            <p>
              {item.variant_name}
              {item.sku
                ? ` · ${item.sku}`
                : ""}
            </p>

            <div className="mt-1 flex justify-between gap-3">
              <span>
                {formatQuantity(
                  item.quantity
                )}{" "}
                ×{" "}
                {formatMoneyPlain(
                  item.unit_price
                )}
              </span>

              <span className="font-black">
                {formatMoneyPlain(
                  item.line_total
                )}
              </span>
            </div>

            {item.discount_amount >
            0 ? (
              <div className="flex justify-between">
                <span>
                  Descuento
                </span>
                <span>
                  -
                  {formatMoneyPlain(
                    item.discount_amount
                  )}
                </span>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <ReceiptDivider />

      <div className="grid gap-1">
        <ReceiptAmountLine
          label="Subtotal"
          value={sale.subtotal}
        />

        {manualDiscount > 0 ? (
          <ReceiptAmountLine
            label="Descuentos"
            value={
              -manualDiscount
            }
          />
        ) : null}

        {loyaltyDiscount > 0 ? (
          <ReceiptAmountLine
            label="Fidelización"
            value={-loyaltyDiscount}
          />
        ) : null}

        <ReceiptAmountLine
          label="Impuestos"
          value={sale.tax_total}
        />

        <div className="mt-1 flex items-end justify-between gap-3 border-t border-black pt-2 text-base font-black">
          <span>TOTAL</span>
          <span>
            {formatMoneyPlain(
              sale.total
            )}
          </span>
        </div>
      </div>

      {hasLoyaltyRedemption ? (
        <>
          <ReceiptDivider />
          <div className="grid gap-1">
            <p className="font-black uppercase">Fidelización</p>
            <ReceiptTextLine
              label="Recompensa"
              value={sale.loyalty.redemption?.rewardName || "Descuento"}
            />
            <ReceiptTextLine
              label="Puntos usados"
              value={formatInteger(sale.loyalty.pointsRedeemed)}
            />
            <ReceiptTextLine
              label="Puntos ganados"
              value={`+${formatInteger(sale.loyalty.pointsEarned)}`}
            />
            <ReceiptTextLine
              label="Estado"
              value={redemptionStatusLabel(sale.loyalty.redemption?.status)}
            />
          </div>
        </>
      ) : null}

      <ReceiptDivider />

      <div className="grid gap-1">
        {sale.payments.map(
          (payment) => (
            <ReceiptAmountLine
              key={payment.id}
              label={
                PAYMENT_LABELS[
                  payment
                    .payment_method
                ]
              }
              value={
                payment.amount
              }
            />
          )
        )}

        {totalTendered !==
        sale.total ? (
          <ReceiptAmountLine
            label="Recibido"
            value={
              totalTendered
            }
          />
        ) : null}

        {totalChange > 0 ? (
          <ReceiptAmountLine
            label="Cambio"
            value={
              totalChange
            }
          />
        ) : null}
      </div>

      {sale.notes ? (
        <>
          <ReceiptDivider />
          <p>
            Nota: {sale.notes}
          </p>
        </>
      ) : null}

      <ReceiptDivider />

      <div className="text-center">
        <p className="font-black">
          {branding
            ?.ticket_footer ||
            "Gracias por tu compra."}
        </p>

        {branding
          ?.loyalty_message ? (
          <p className="mt-2">
            {
              branding.loyalty_message
            }
          </p>
        ) : null}

        <p className="mt-4 text-[9px]">
          Operado con Cometa POS
        </p>
      </div>
    </div>
  );
}

function HeaderMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <PosCard padding="compact" className="min-h-20">
      <p className="text-[11px] font-medium text-[var(--pos-text-muted)]">
        {label}
      </p>
      <p className="mt-2 truncate text-xl font-semibold tracking-[-0.035em] text-[var(--pos-text-primary)]">
        {value}
      </p>
    </PosCard>
  );
}

function DetailMetric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-[var(--pos-radius-sm)] bg-[var(--pos-canvas)] p-3">
      <p className="text-[11px] font-medium text-[var(--pos-text-muted)]">
        {label}
      </p>
      <p
        className={`mt-1 text-lg font-semibold ${
          accent
            ? "text-emerald-300"
            : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function SummaryLine({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-4 last:mb-0">
      <p className="text-xs font-medium text-[var(--pos-text-muted)]">
        {label}
      </p>
      <p className="text-sm font-semibold text-[var(--pos-text-primary)]">
        {value}
      </p>
    </div>
  );
}

function LoyaltyDetail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="border-b border-emerald-300/10 py-2 last:border-0">
      <p className="text-[11px] font-medium text-[var(--pos-text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-[var(--pos-text-primary)]">
        {value}
      </p>
    </div>
  );
}

function redemptionStatusLabel(status?: string) {
  if (status === "completed") return "Completado";
  if (status === "reserved") return "Reservado";
  if (status === "cancelled") return "Cancelado";
  return status || "No disponible";
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function StatusBadge({
  status,
}: {
  status: Sale["status"];
}) {
  const tone =
    status === "completed"
      ? "success"
      : status ===
        "partially_refunded"
      ? "warning"
      : "danger";

  return (
    <PosBadge tone={tone} size="compact" dot>
      {STATUS_LABELS[status]}
    </PosBadge>
  );
}

function EmptySales({
  hasSales,
}: {
  hasSales: boolean;
}) {
  return (
    <div className="flex min-h-52 items-center justify-center rounded-[var(--pos-radius-md)] border border-dashed border-[var(--pos-line)] bg-[var(--pos-panel)] p-5 text-center">
      <div className="max-w-sm">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-[var(--pos-radius-sm)] bg-white/[0.05] text-[var(--pos-text-secondary)]">
          <PosIcon
            name="receipt"
            className="h-7 w-7"
          />
        </div>

        <h4 className="mt-4 text-base font-semibold text-[var(--pos-text-primary)]">
          {hasSales
            ? "No hay ventas con estos filtros"
            : "Aún no hay tickets"}
        </h4>

        <p className="mt-2 text-sm leading-6 text-[var(--pos-text-muted)]">
          {hasSales
            ? "Cambia la fecha, el método de pago o el término de búsqueda."
            : "La primera venta completada en la terminal aparecerá aquí."}
        </p>
      </div>
    </div>
  );
}

function ReceiptDivider() {
  return (
    <div className="my-3 border-t border-dashed border-black" />
  );
}

function ReceiptTextLine({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex justify-between gap-4">
      <span>{label}</span>
      <span className="text-right">
        {value}
      </span>
    </div>
  );
}

function ReceiptAmountLine({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex justify-between gap-4">
      <span>{label}</span>
      <span>
        {formatMoneyPlain(value)}
      </span>
    </div>
  );
}

function matchesDateFilter(
  value: string,
  filter: DateFilter
) {
  if (filter === "all") {
    return true;
  }

  const date = new Date(value);
  const now = new Date();

  if (
    Number.isNaN(date.getTime())
  ) {
    return false;
  }

  if (filter === "today") {
    return (
      date.getFullYear() ===
        now.getFullYear() &&
      date.getMonth() ===
        now.getMonth() &&
      date.getDate() ===
        now.getDate()
    );
  }

  if (filter === "week") {
    const sevenDaysAgo =
      new Date(now);

    sevenDaysAgo.setDate(
      now.getDate() - 7
    );

    return date >= sevenDaysAgo;
  }

  return (
    date.getFullYear() ===
      now.getFullYear() &&
    date.getMonth() ===
      now.getMonth()
  );
}

function formatDateTime(
  value: string
) {
  return new Intl.DateTimeFormat(
    "es-MX",
    {
      dateStyle: "medium",
      timeStyle: "short",
    }
  ).format(new Date(value));
}

function formatQuantity(
  value: number
) {
  return new Intl.NumberFormat(
    "es-MX",
    {
      maximumFractionDigits: 3,
    }
  ).format(Number(value || 0));
}

function formatMoney(
  value: number,
  currency = "MXN"
) {
  return new Intl.NumberFormat(
    "es-MX",
    {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }
  ).format(Number(value || 0));
}

function formatMoneyPlain(
  value: number
) {
  const sign =
    Number(value || 0) < 0
      ? "-"
      : "";

  return `${sign}$${new Intl.NumberFormat(
    "es-MX",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  ).format(
    Math.abs(
      Number(value || 0)
    )
  )}`;
}

async function apiRequest<
  T = unknown
>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(
    url,
    {
      ...init,
      cache: "no-store",
      headers: {
        "Content-Type":
          "application/json",
        ...(init?.headers || {}),
      },
    }
  );

  const data =
    await response.json();

  if (
    !response.ok ||
    !data?.ok
  ) {
    throw new Error(
      data?.error ||
        data?.message ||
        "No se pudo completar la operación."
    );
  }

  return data as T;
}

function getErrorMessage(
  error: unknown
) {
  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado.";
}
