"use client";

import Link from "next/link";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePosContext } from "../../components/pos-shell";
import { buildPosHref } from "../../components/pos-sidebar";
import { PosIcon } from "../../components/pos-icons";
import { PosProductImage } from "../../components/pos-product-image";
import {
  PosButton,
  PosCard,
  PosModal,
  PosPage,
} from "../../components/pos-ui";

type PaymentMethod =
  | "cash"
  | "card"
  | "transfer"
  | "wallet"
  | "other";

type SplitPaymentLine = {
  id: string;
  method: PaymentMethod;
  amount: string;
  tenderedAmount: string;
  reference: string;
};

type CheckoutPaymentPayload = {
  method: PaymentMethod;
  amount: number;
  tenderedAmount?: number;
  reference?: string | null;
};

type SplitPaymentSummary = {
  appliedCents: number;
  tenderedCents: number;
  changeCents: number;
  pendingCents: number;
  isOverpaid: boolean;
  isReady: boolean;
};

type Location = {
  id: string;
  name: string;
  code: string;
  currency: string;
  tax_rate: number;
  prices_include_tax: boolean;
};

type Register = {
  id: string;
  location_id: string;
  name: string;
  code: string;
  status: string;
};

type CashSession = {
  id: string;
  location_id: string;
  register_id: string;
  status: "open";
  opening_amount: number;
  opened_at: string;
  register?: {
    id: string;
    name: string;
    code: string;
  } | null;
  location?: {
    id: string;
    name: string;
    code: string;
  } | null;
};

type BootstrapResponse = {
  ok: true;
  locations: Location[];
  registers: Register[];
  openSessions: CashSession[];
  branding: {
    display_name: string;
    primary_color: string;
    secondary_color: string;
    accent_color: string;
  };
};

type UnitOption = {
  code: string;
  name: string;
  symbol: string;
  decimal_precision: number;
};

type ProductConfigResponse = {
  ok: true;
  units: UnitOption[];
  attributes?: ProductAttributeDefinition[];
};

type ProductAttributeDefinition = {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  use_in_variant_name: boolean;
  active?: boolean;
};

type LoyaltyMember = {
  id: string;
  member_number: string;
  points_balance: number;
  lifetime_points: number;
  status: "active" | "paused" | "cancelled";
  tier:
    | {
        id: string;
        name: string;
        minimum_lifetime_points: number;
        points_multiplier: number;
      }
    | null;
};

type PosCustomer = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  birthday: string | null;
  marketing_consent: boolean;
  wallet_consent: boolean;
  active: boolean;
  loyalty_member:
    | LoyaltyMember
    | LoyaltyMember[]
    | null;
};

type CustomersResponse = {
  ok: true;
  customers: PosCustomer[];
  pagination: {
    total: number;
  };
};

type CreateCustomerResponse = {
  ok: true;
  customer: PosCustomer;
};

type InventoryRecord = {
  id: string;
  location_id: string;
  quantity: number;
  reserved_quantity: number;
  minimum_quantity: number;
  available_quantity: number;
  location?: {
    id: string;
    name: string;
    code: string;
  } | null;
};

type ProductVariant = {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: number;
  cost: number;
  attributes: Record<string, unknown>;
  unit_code: string;
  image_url: string | null;
  active: boolean;
  inventory: InventoryRecord[];
};

type Product = {
  id: string;
  product_code: string | null;
  name: string;
  description: string | null;
  product_type: string;
  inventory_mode: string;
  track_inventory: boolean;
  sellable: boolean;
  tax_rate: number;
  image_url: string | null;
  active: boolean;
  category?: {
    id: string;
    name: string;
  } | null;
  variants: ProductVariant[];
};

type ProductsResponse = {
  ok: true;
  products: Product[];
  pagination: {
    total: number;
  };
};

type ScanFoundResponse = {
  ok: true;
  found: true;
  code: string;
  matchType: "sku" | "barcode";
  variant: {
    id: string;
    product_id: string;
    name: string;
    sku: string | null;
    barcode: string | null;
    price: number;
    cost: number;
    attributes: Record<string, unknown>;
    unit_code: string;
    image_url: string | null;
    inventory: InventoryRecord[];
    product: {
      id: string;
      name: string;
      description: string | null;
      product_type: string;
      inventory_mode: string;
      default_unit_code: string;
      has_variants: boolean;
      sellable: boolean;
      tax_rate: number;
      image_url: string | null;
      active: boolean;
      category?: {
        id: string;
        name: string;
      } | null;
    };
  };
};

type ScanNotFoundResponse = {
  ok: true;
  found: false;
  code: string;
  suggestedField: "sku" | "barcode";
};

type ScanResponse =
  | ScanFoundResponse
  | ScanNotFoundResponse;

type SellableVariant = {
  productId: string;
  productName: string;
  productCode: string | null;
  productDescription: string | null;
  productImageUrl: string | null;
  productType: string;
  inventoryMode: string;
  taxRate: number;
  categoryId: string | null;
  categoryName: string;
  variantId: string;
  variantName: string;
  variantImageUrl: string | null;
  sku: string | null;
  barcode: string | null;
  price: number;
  unitCode: string;
  attributes: Record<string, unknown>;
  availableStock: number;
  inventoryTracked: boolean;
};

type ProductGroup = {
  productId: string;
  productName: string;
  productDescription: string | null;
  productImageUrl: string | null;
  categoryId: string | null;
  categoryName: string;
  variants: SellableVariant[];
};

type CartItem = SellableVariant & {
  quantity: number;
  discountAmount: number;
};

type SaleTierSnapshot = {
  id: string;
  name: string;
  minimumLifetimePoints: number;
  pointsMultiplier: number;
};

type VisitProgressProgram = {
  id: string;
  name: string;
  requiredVisits: number;
  minimumSaleAmount: number;
  rewardId: string;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  completedVisits: number;
  cyclesCompleted: number;
  currentProgress: number;
};

type RewardUnlock = {
  id: string;
  visitProgramId: string;
  memberId: string;
  rewardId: string;
  cycleNumber: number;
  rewardName: string;
  rewardType: "discount_fixed";
  rewardValue: number;
  requiredVisits: number;
  minimumSaleAmount: number;
  unlockedAt: string;
};

type VisitUnlockCreated = {
  id: string;
  visitProgramId: string;
  visitProgramName: string;
  cycleNumber: number;
  rewardId: string;
  rewardName: string;
  rewardType: "discount_fixed";
  rewardValue: number;
};

type SaleResult = {
  id: string;
  sale_number: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  currency: string;
  payment_applied: number;
  payment_received: number;
  change_due: number;
  points_earned: number;
  points_redeemed: number;
  loyalty_discount: number;
  redemption_id: string | null;
  reward_id: string | null;
  loyalty_balance: number | null;
  idempotent_replay: boolean;
  base_points: number;
  tier_multiplier: number;
  tier_before: SaleTierSnapshot | null;
  tier_after: SaleTierSnapshot | null;
  tier_promoted: boolean;
  reward_source: "points" | "visits" | null;
  reward_unlock_id: string | null;
  visits_earned: number;
  visit_progress: VisitProgressProgram[];
  visit_unlocks_created: VisitUnlockCreated[];
};

type SaleResponse = {
  ok: true;
  sale: SaleResult;
  paymentSummary: {
    appliedTotal: number;
    tenderedTotal: number;
    expectedChange: number;
  };
};

type SaleTotals = {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  articleCount: number;
};

type AvailableReward = {
  id: string;
  name: string;
  description: string | null;
  pointsCost: number;
  rewardValue: number;
  available: boolean;
  unavailableReason: string | null;
};

type AvailableRewardsResponse = {
  ok: true;
  member: {
    id: string;
    pointsBalance: number;
    lifetimePoints: number;
    tier: {
      id: string;
      name: string;
      minimumLifetimePoints: number;
      pointsMultiplier: number;
    } | null;
  } | null;
  rewards: AvailableReward[];
};

type VisitProgressResponse = {
  ok: true;
  member: {
    id: string;
    customerId: string;
    status: string;
    pointsBalance: number;
    lifetimePoints: number;
  } | null;
  programs: VisitProgressProgram[];
};

type RewardUnlocksResponse = {
  ok: true;
  unlocks: RewardUnlock[];
};

const PAYMENT_METHODS: Array<{
  code: PaymentMethod;
  label: string;
  description: string;
}> = [
  {
    code: "cash",
    label: "Efectivo",
    description: "Calcula el cambio automáticamente.",
  },
  {
    code: "card",
    label: "Tarjeta",
    description: "Cobro mediante terminal bancaria.",
  },
  {
    code: "transfer",
    label: "Transferencia",
    description: "Registra una referencia opcional.",
  },
  {
    code: "wallet",
    label: "Wallet",
    description: "Registra una referencia opcional.",
  },
  {
    code: "other",
    label: "Otro",
    description: "Método adicional autorizado.",
  },
];

export default function PosRegisterPage() {
  const { brand } = usePosContext();

  const [locations, setLocations] = useState<
    Location[]
  >([]);
  const [openSessions, setOpenSessions] =
    useState<CashSession[]>([]);
  const [units, setUnits] = useState<
    UnitOption[]
  >([]);
  const [products, setProducts] = useState<
    Product[]
  >([]);
  const [attributeDefinitions, setAttributeDefinitions] =
    useState<ProductAttributeDefinition[]>([]);
  const [selectedProductId, setSelectedProductId] =
    useState<string | null>(null);
  const [customers, setCustomers] = useState<
    PosCustomer[]
  >([]);

  const [
    selectedCustomerId,
    setSelectedCustomerId,
  ] = useState("");
  const [
    isCustomerPickerOpen,
    setIsCustomerPickerOpen,
  ] = useState(false);
  const [
    customerSearch,
    setCustomerSearch,
  ] = useState("");
  const [
    completedCustomerName,
    setCompletedCustomerName,
  ] = useState<string | null>(null);

  const [
    selectedSessionId,
    setSelectedSessionId,
  ] = useState("");

  const [cart, setCart] = useState<
    CartItem[]
  >([]);

  const [search, setSearch] = useState("");
  const [
    selectedCategory,
    setSelectedCategory,
  ] = useState("all");

  const [scanCode, setScanCode] =
    useState("");
  const [isScanning, setIsScanning] =
    useState(false);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);

  const [
    paymentMethod,
    setPaymentMethod,
  ] = useState<PaymentMethod>("cash");
  const [
    tenderedAmount,
    setTenderedAmount,
  ] = useState("");
  const [
    paymentReference,
    setPaymentReference,
  ] = useState("");
  const [isSplitPayment, setIsSplitPayment] =
    useState(false);
  const [splitPayments, setSplitPayments] = useState<
    SplitPaymentLine[]
  >([]);
  const [isAddingSplitPayment, setIsAddingSplitPayment] =
    useState(false);
  const [saleNotes, setSaleNotes] =
    useState("");
  const [
    isPaymentOpen,
    setIsPaymentOpen,
  ] = useState(false);
  const [isCharging, setIsCharging] =
    useState(false);

  const [
    completedSale,
    setCompletedSale,
  ] = useState<SaleResult | null>(null);
  const [availableRewards, setAvailableRewards] = useState<AvailableReward[]>([]);
  const [loyaltyMember, setLoyaltyMember] = useState<AvailableRewardsResponse["member"]>(null);
  const [selectedPointRewardId, setSelectedPointRewardId] = useState<string | null>(null);
  const [selectedRewardUnlockId, setSelectedRewardUnlockId] = useState<string | null>(null);
  const [visitProgress, setVisitProgress] = useState<VisitProgressProgram[]>([]);
  const [rewardUnlocks, setRewardUnlocks] = useState<RewardUnlock[]>([]);
  const [loyaltyLoadError, setLoyaltyLoadError] = useState<string | null>(null);
  const [isLoadingRewards, setIsLoadingRewards] = useState(false);

  const [isLoading, setIsLoading] =
    useState(true);
  const [error, setError] = useState<
    string | null
  >(null);
  const [notice, setNotice] = useState<
    string | null
  >(null);

  const scannerRef =
    useRef<HTMLInputElement>(null);
  const searchRef =
    useRef<HTMLInputElement>(null);
  const checkoutIdempotencyKeyRef = useRef<string | null>(null);
  const checkoutTotalAtOpenRef = useRef<number | null>(null);
  const loyaltyRequestRef = useRef(0);

  const loadRegisterData =
    useCallback(async () => {
      try {
        setIsLoading(true);
        setError(null);

        const [
          bootstrap,
          productConfig,
          productData,
          customerData,
        ] = await Promise.all([
          apiRequest<BootstrapResponse>(
            `/api/pos/bootstrap?brandSlug=${encodeURIComponent(
              brand.slug
            )}`
          ),
          apiRequest<ProductConfigResponse>(
            `/api/pos/product-config?brandSlug=${encodeURIComponent(
              brand.slug
            )}`
          ),
          apiRequest<ProductsResponse>(
            `/api/pos/products?brandSlug=${encodeURIComponent(
              brand.slug
            )}&pageSize=100&active=true`
          ),
          apiRequest<CustomersResponse>(
            `/api/pos/customers?brandSlug=${encodeURIComponent(
              brand.slug
            )}&pageSize=200`
          ),
        ]);

        setLocations(
          bootstrap.locations || []
        );
        setOpenSessions(
          bootstrap.openSessions || []
        );
        setUnits(
          productConfig.units || []
        );
        setAttributeDefinitions(
          productConfig.attributes || []
        );
        setProducts(
          productData.products || []
        );
        setCustomers(
          customerData.customers || []
        );

        setSelectedCustomerId(
          (current) =>
            customerData.customers.some(
              (customer) =>
                customer.id === current
            )
              ? current
              : ""
        );

        setSelectedSessionId(
          (current) => {
            const stillOpen =
              bootstrap.openSessions.some(
                (session) =>
                  session.id === current
              );

            if (stillOpen) return current;

            return (
              bootstrap.openSessions[0]
                ?.id || ""
            );
          }
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
    loadRegisterData();
  }, [loadRegisterData]);

  useEffect(() => {
    function handleShortcuts(
      event: KeyboardEvent
    ) {
      if (event.key === "F2") {
        event.preventDefault();
        scannerRef.current?.focus();
        scannerRef.current?.select();
      }

      if (event.key === "F3") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }

      if (
        event.key === "F9" &&
        cart.length > 0 &&
        selectedSessionId &&
        !isPaymentOpen &&
        !isCharging
      ) {
        event.preventDefault();
        openPayment();
      }

      if (
        event.key === "Escape" &&
        isPaymentOpen &&
        !isCharging
      ) {
        event.preventDefault();
        closePayment();
      }
    }

    window.addEventListener(
      "keydown",
      handleShortcuts
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleShortcuts
      );
    };
  }, [
    cart.length,
    isCharging,
    isPaymentOpen,
    selectedSessionId,
  ]);

  const selectedSession =
    openSessions.find(
      (session) =>
        session.id ===
        selectedSessionId
    ) || null;

  const selectedLocation =
    locations.find(
      (location) =>
        location.id ===
        selectedSession?.location_id
    ) || null;

  const selectedCustomer =
    customers.find(
      (customer) =>
        customer.id ===
        selectedCustomerId
    ) || null;

  const loadCustomerLoyalty = useCallback(async (customerId: string) => {
    const requestId = loyaltyRequestRef.current + 1;
    loyaltyRequestRef.current = requestId;
    try {
      setIsLoadingRewards(true);
      setLoyaltyLoadError(null);
      const query = `brandSlug=${encodeURIComponent(brand.slug)}&customerId=${encodeURIComponent(customerId)}`;
      const results = await Promise.allSettled([
        apiRequest<AvailableRewardsResponse>(`/api/pos/loyalty?${query}&view=available_rewards`),
        apiRequest<VisitProgressResponse>(`/api/pos/loyalty?${query}&view=visit_progress`),
        apiRequest<RewardUnlocksResponse>(`/api/pos/loyalty?${query}&view=reward_unlocks`),
      ]);

      if (loyaltyRequestRef.current !== requestId) return;

      const [pointsResult, progressResult, unlocksResult] = results;
      if (pointsResult.status === "fulfilled") {
        setLoyaltyMember(pointsResult.value.member);
        setAvailableRewards(pointsResult.value.rewards || []);
      } else {
        setLoyaltyMember(null);
        setAvailableRewards([]);
      }
      setVisitProgress(progressResult.status === "fulfilled" ? progressResult.value.programs || [] : []);
      setRewardUnlocks(unlocksResult.status === "fulfilled" ? unlocksResult.value.unlocks || [] : []);

      const failures = results.filter((result) => result.status === "rejected");
      setLoyaltyLoadError(failures.length ? "Parte de la fidelización no pudo actualizarse." : null);
    } finally {
      if (loyaltyRequestRef.current === requestId) setIsLoadingRewards(false);
    }
  }, [brand.slug]);

  useEffect(() => {
    if (!selectedCustomerId) {
      loyaltyRequestRef.current += 1;
      setLoyaltyMember(null);
      setAvailableRewards([]);
      setVisitProgress([]);
      setRewardUnlocks([]);
      setSelectedPointRewardId(null);
      setSelectedRewardUnlockId(null);
      setLoyaltyLoadError(null);
      setIsLoadingRewards(false);
      return;
    }

    void loadCustomerLoyalty(selectedCustomerId);
  }, [loadCustomerLoyalty, selectedCustomerId]);

  const filteredCustomers =
    useMemo(() => {
      const query =
        customerSearch
          .trim()
          .toLowerCase();

      if (!query) {
        return customers.slice(0, 80);
      }

      return customers
        .filter((customer) =>
          [
            getCustomerName(customer),
            customer.phone || "",
            customer.email || "",
            normalizeMember(
              customer.loyalty_member
            )?.member_number || "",
          ].some((value) =>
            value
              .toLowerCase()
              .includes(query)
          )
        )
        .slice(0, 80);
    }, [
      customers,
      customerSearch,
    ]);

  const currency =
    selectedLocation?.currency || "MXN";

  const unitMap = useMemo(
    () =>
      new Map(
        units.map((unit) => [
          unit.code,
          unit,
        ])
      ),
    [units]
  );

  const sellableVariants =
    useMemo(
      () =>
        buildSellableVariants({
          products,
          locationId:
            selectedSession
              ?.location_id || "",
        }),
      [
        products,
        selectedSession?.location_id,
      ]
    );

  const categories = useMemo(() => {
    const map = new Map<
      string,
      string
    >();

    for (const variant of sellableVariants) {
      if (
        variant.categoryId &&
        variant.categoryName
      ) {
        map.set(
          variant.categoryId,
          variant.categoryName
        );
      }
    }

    return Array.from(
      map.entries()
    ).sort((left, right) =>
      left[1].localeCompare(
        right[1],
        "es"
      )
    );
  }, [sellableVariants]);

  const productGroups = useMemo<ProductGroup[]>(() => {
    const groups = new Map<string, ProductGroup>();
    for (const variant of sellableVariants) {
      const existing = groups.get(variant.productId);
      if (existing) {
        existing.variants.push(variant);
        continue;
      }
      groups.set(variant.productId, {
        productId: variant.productId,
        productName: variant.productName,
        productDescription: variant.productDescription,
        productImageUrl: variant.productImageUrl,
        categoryId: variant.categoryId,
        categoryName: variant.categoryName,
        variants: [variant],
      });
    }
    return Array.from(groups.values());
  }, [sellableVariants]);

  const filteredGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    return productGroups.filter((group) => {
      if (
        selectedCategory !== "all" &&
        group.categoryId !== selectedCategory
      ) {
        return false;
      }
      if (!query) return true;
      return [
          group.productName,
        group.variants[0]?.productCode || "",
        group.categoryName,
        ...group.variants.flatMap((variant) => [
          variant.variantName,
          variant.sku || "",
          variant.barcode || "",
          formatAttributes(variant.attributes),
        ]),
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [productGroups, search, selectedCategory]);

  const selectedProduct = selectedProductId
    ? productGroups.find((group) => group.productId === selectedProductId) || null
    : null;

  const baseTotals = useMemo(
    () =>
      calculateSaleTotals({
        cart,
        pricesIncludeTax:
          selectedLocation
            ?.prices_include_tax ??
          true,
      }),
    [
      cart,
      selectedLocation
        ?.prices_include_tax,
    ]
  );

  const selectedReward =
    availableRewards.find(
      (reward) =>
        reward.id === selectedPointRewardId
    ) || null;

  const selectedRewardUnlock = rewardUnlocks.find(
    (unlock) => unlock.id === selectedRewardUnlockId
  ) || null;

  const loyaltyDiscount =
    selectedRewardUnlock
      ? Math.min(Number(selectedRewardUnlock.rewardValue || 0), baseTotals.total)
      : selectedReward && selectedReward.available
      ? Math.min(
          Number(selectedReward.rewardValue || 0),
          baseTotals.total
        )
      : 0;

  const totals = useMemo(
    () => ({
      ...baseTotals,
      discount: roundMoney(
        baseTotals.discount + loyaltyDiscount
      ),
      total: roundMoney(
        Math.max(
          baseTotals.total - loyaltyDiscount,
          0
        )
      ),
    }),
    [baseTotals, loyaltyDiscount]
  );

  const checkoutTotalCents = moneyToCents(
    totals.total
  ) || 0;

  useEffect(() => {
    if (
      selectedReward &&
      selectedReward.rewardValue >= baseTotals.total
    ) {
      setSelectedPointRewardId(null);
    }
  }, [baseTotals.total, selectedReward]);

  useEffect(() => {
    if (selectedRewardUnlock && selectedRewardUnlock.rewardValue >= baseTotals.total) {
      setSelectedRewardUnlockId(null);
    }
  }, [baseTotals.total, selectedRewardUnlock]);

  const cartFingerprint = useMemo(
    () =>
      JSON.stringify(
        cart.map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
          discountAmount: item.discountAmount,
        }))
      ),
    [cart]
  );

  const splitPaymentFingerprint = useMemo(
    () => JSON.stringify(splitPayments),
    [splitPayments]
  );

  const splitPaymentSummary = useMemo(
    () => {
      let appliedCents = 0;
      let tenderedCents = 0;
      let changeCents = 0;
      let hasInvalidAmount = false;
      let hasInvalidTenderedAmount = false;

      for (const payment of splitPayments) {
        const amountCents = moneyToCents(
          payment.amount
        );

        if (
          amountCents === null ||
          amountCents <= 0
        ) {
          hasInvalidAmount = true;
          continue;
        }

        appliedCents += amountCents;

        if (payment.method === "cash") {
          const cashTenderedCents = moneyToCents(
            payment.tenderedAmount
          );

          if (
            cashTenderedCents === null ||
            cashTenderedCents < amountCents
          ) {
            hasInvalidTenderedAmount = true;
            continue;
          }

          tenderedCents += cashTenderedCents;
          changeCents +=
            cashTenderedCents - amountCents;
        } else {
          tenderedCents += amountCents;
        }
      }

      const pendingCents =
        checkoutTotalCents - appliedCents;

      return {
        appliedCents,
        tenderedCents,
        changeCents,
        pendingCents,
        isOverpaid: pendingCents < 0,
        isReady:
          splitPayments.length > 0 &&
          splitPayments.length <= 10 &&
          !hasInvalidAmount &&
          !hasInvalidTenderedAmount &&
          pendingCents === 0,
      };
    }, [checkoutTotalCents, splitPayments]);

  useEffect(() => {
    checkoutIdempotencyKeyRef.current = null;
  }, [
    cartFingerprint,
    selectedCustomerId,
    selectedPointRewardId,
    selectedRewardUnlockId,
    paymentMethod,
    tenderedAmount,
    paymentReference,
    isSplitPayment,
    splitPaymentFingerprint,
    saleNotes,
    selectedSessionId,
  ]);

  useEffect(() => {
    if (
      !isPaymentOpen ||
      isCharging ||
      checkoutTotalAtOpenRef.current === null ||
      checkoutTotalAtOpenRef.current ===
        checkoutTotalCents
    ) {
      return;
    }

    checkoutTotalAtOpenRef.current =
      checkoutTotalCents;
    setIsSplitPayment(false);
    setSplitPayments([]);
    setIsAddingSplitPayment(false);
    setPaymentMethod("cash");
    setTenderedAmount(
      centsToMoneyInput(checkoutTotalCents)
    );
    setPaymentReference("");
    setError(
      "El total de la venta cambió. Revisa el pago antes de cobrar."
    );
  }, [
    checkoutTotalCents,
    isCharging,
    isPaymentOpen,
  ]);

  const tenderedCents = moneyToCents(
    tenderedAmount
  );
  const tenderedNumber =
    tenderedCents === null
      ? 0
      : centsToMoney(tenderedCents);

  const changeDue =
    paymentMethod === "cash"
      ? centsToMoney(
          Math.max(
            (tenderedCents || 0) -
              checkoutTotalCents,
            0
          )
        )
      : 0;

  const simplePaymentReady =
    paymentMethod !== "cash" ||
    (
      tenderedCents !== null &&
      tenderedCents >= checkoutTotalCents
    );

  const canCharge =
    cart.length > 0 &&
    Boolean(selectedSession) &&
    checkoutTotalCents > 0 &&
    (isSplitPayment
      ? splitPaymentSummary.isReady
      : simplePaymentReady);

  function handleSessionChange(
    value: string
  ) {
    if (
      value !== selectedSessionId &&
      cart.length > 0
    ) {
      const accepted =
        window.confirm(
          "Cambiar de caja eliminará la venta actual. ¿Continuar?"
        );

      if (!accepted) return;

      setCart([]);
    }

    setSelectedSessionId(value);
    setError(null);
    setNotice(null);
    setSelectedCategory("all");
  }

  function addVariantToCart(
    variant: SellableVariant,
    quantity = 1
  ) {
    if (!selectedSession) {
      setError(
        "Abre una caja antes de agregar productos."
      );
      return;
    }

    if (
      variant.inventoryTracked &&
      variant.availableStock <= 0
    ) {
      setError(
        `${variant.productName} · ${variant.variantName} no tiene existencia disponible.`
      );
      return;
    }

    const precision =
      unitMap.get(
        variant.unitCode
      )?.decimal_precision || 0;

    const normalizedQuantity =
      normalizeQuantity(
        quantity,
        precision
      );

    setCart((current) => {
      const existing =
        current.find(
          (item) =>
            item.variantId ===
            variant.variantId
        );

      if (existing) {
        const nextQuantity =
          normalizeQuantity(
            existing.quantity +
              normalizedQuantity,
            precision
          );

        if (
          variant.inventoryTracked &&
          nextQuantity >
            variant.availableStock
        ) {
          setError(
            `Solo hay ${formatQuantity(
              variant.availableStock
            )} disponibles de ${variant.productName} · ${variant.variantName}.`
          );

          return current;
        }

        return current.map(
          (item) =>
            item.variantId ===
            variant.variantId
              ? {
                  ...item,
                  quantity:
                    nextQuantity,
                }
              : item
        );
      }

      if (
        variant.inventoryTracked &&
        normalizedQuantity >
          variant.availableStock
      ) {
        setError(
          `Solo hay ${formatQuantity(
            variant.availableStock
          )} disponibles.`
        );

        return current;
      }

      return [
        ...current,
        {
          ...variant,
          quantity:
            normalizedQuantity,
          discountAmount: 0,
        },
      ];
    });

    setError(null);
    setNotice(
      `${variant.productName} · ${variant.variantName} agregado.`
    );
  }

  function selectProduct(group: ProductGroup) {
    if (group.variants.length === 1) {
      addVariantToCart(group.variants[0]);
      return;
    }
    setError(null);
    setNotice(null);
    setSelectedProductId(group.productId);
  }

  function updateCartQuantity(
    variantId: string,
    rawQuantity: number
  ) {
    setCart((current) =>
      current.flatMap((item) => {
        if (
          item.variantId !==
          variantId
        ) {
          return [item];
        }

        const precision =
          unitMap.get(
            item.unitCode
          )?.decimal_precision || 0;

        const quantity =
          normalizeQuantity(
            rawQuantity,
            precision
          );

        if (quantity <= 0) {
          return [];
        }

        if (
          item.inventoryTracked &&
          quantity >
            item.availableStock
        ) {
          setError(
            `Solo hay ${formatQuantity(
              item.availableStock
            )} disponibles de ${item.productName}.`
          );

          return [item];
        }

        setError(null);

        return [
          {
            ...item,
            quantity,
          },
        ];
      })
    );
  }

  function removeCartItem(
    variantId: string
  ) {
    setCart((current) =>
      current.filter(
        (item) =>
          item.variantId !==
          variantId
      )
    );
  }

  function clearCart() {
    if (cart.length === 0) return;

    const accepted =
      window.confirm(
        "¿Eliminar todos los productos de la venta actual?"
      );

    if (accepted) {
      setCart([]);
      setNotice(null);
      setError(null);
    }
  }

  async function handleScan(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!selectedSession) {
      setError(
        "Primero abre o selecciona una caja."
      );
      return;
    }

    const code =
      scanCode.trim();

    if (!code) {
      scannerRef.current?.focus();
      return;
    }

    try {
      setIsScanning(true);
      setError(null);
      setNotice(null);

      const result =
        await apiRequest<ScanResponse>(
          `/api/pos/product-scan?brandSlug=${encodeURIComponent(
            brand.slug
          )}&code=${encodeURIComponent(
            code
          )}`
        );

      if (!result.found) {
        setError(
          `El código ${result.code} no está registrado.`
        );
        return;
      }

      const inventoryRecord =
        (
          result.variant.inventory ||
          []
        ).find(
          (record) =>
            record.location_id ===
            selectedSession
              .location_id
        );

      const inventoryTracked =
        result.variant.product
          .inventory_mode ===
        "direct";

      const availableStock =
        inventoryTracked
          ? Number(
              inventoryRecord
                ?.available_quantity ||
                (
                  Number(
                    inventoryRecord
                      ?.quantity || 0
                  ) -
                  Number(
                    inventoryRecord
                      ?.reserved_quantity ||
                      0
                  )
                )
            )
          : Number.POSITIVE_INFINITY;

      const variant:
        SellableVariant = {
          productId:
            result.variant.product.id,
          productName:
            result.variant.product.name,
          productCode: null,
          productDescription:
            result.variant.product
              .description,
          productImageUrl:
            result.variant.product
              .image_url,
          productType:
            result.variant.product
              .product_type,
          inventoryMode:
            result.variant.product
              .inventory_mode,
          taxRate: Number(
            result.variant.product
              .tax_rate || 0
          ),
          categoryId:
            result.variant.product
              .category?.id || null,
          categoryName:
            result.variant.product
              .category?.name ||
            "Sin categoría",
          variantId:
            result.variant.id,
          variantName:
            result.variant.name,
          variantImageUrl:
            result.variant.image_url,
          sku: result.variant.sku,
          barcode:
            result.variant.barcode,
          price: Number(
            result.variant.price || 0
          ),
          unitCode:
            result.variant.unit_code,
          attributes:
            result.variant.attributes ||
            {},
          availableStock,
          inventoryTracked,
        };

      addVariantToCart(
        variant,
        1
      );
    } catch (scanError) {
      setError(
        getErrorMessage(scanError)
      );
    } finally {
      setIsScanning(false);
      setScanCode("");

      window.setTimeout(() => {
        scannerRef.current?.focus();
      }, 60);
    }
  }

  function selectCustomer(
    customerId: string
  ) {
    loyaltyRequestRef.current += 1;
    setSelectedPointRewardId(null);
    setSelectedRewardUnlockId(null);
    setLoyaltyMember(null);
    setAvailableRewards([]);
    setVisitProgress([]);
    setRewardUnlocks([]);
    setLoyaltyLoadError(null);
    setSelectedCustomerId(
      customerId
    );
    setIsCustomerPickerOpen(false);
    setCustomerSearch("");
    setError(null);

    const customer =
      customers.find(
        (item) =>
          item.id === customerId
      );

    if (customer) {
      setNotice(
        `${getCustomerName(
          customer
        )} quedó asociado a la venta.`
      );
    }
  }

  function clearSelectedCustomer() {
    loyaltyRequestRef.current += 1;
    setSelectedPointRewardId(null);
    setSelectedRewardUnlockId(null);
    setAvailableRewards([]);
    setVisitProgress([]);
    setRewardUnlocks([]);
    setLoyaltyLoadError(null);
    setLoyaltyMember(null);
    setSelectedCustomerId("");
    setNotice(
      "La venta continuará como Público general."
    );
  }

  async function createQuickCustomer(firstName: string, phone: string) {
    if (isCreatingCustomer) return;
    try {
      setIsCreatingCustomer(true);
      setError(null);
      const response = await apiRequest<CreateCustomerResponse>("/api/pos/customers", {
        method: "POST",
        body: JSON.stringify({ brandSlug: brand.slug, firstName, phone }),
      });
      const createdCustomer: PosCustomer = {
        ...response.customer,
        loyalty_member: response.customer.loyalty_member || null,
      };
      setCustomers((current) => [
        createdCustomer,
        ...current.filter((customer) => customer.id !== createdCustomer.id),
      ]);
      setSelectedCustomerId(createdCustomer.id);
      setCustomerSearch("");
      setIsCustomerPickerOpen(false);
      setNotice(`${getCustomerName(createdCustomer)} fue creado y seleccionado.`);
    } catch (createError) {
      setError(getErrorMessage(createError));
      throw createError;
    } finally {
      setIsCreatingCustomer(false);
    }
  }

  function openPayment() {
    if (isCharging) return;

    if (!selectedSession) {
      setError(
        "No hay una sesión de caja abierta."
      );
      return;
    }

    if (cart.length === 0) {
      setError(
        "Agrega productos antes de cobrar."
      );
      return;
    }

    setPaymentMethod("cash");
    setTenderedAmount(
      centsToMoneyInput(checkoutTotalCents)
    );
    setPaymentReference("");
    setIsSplitPayment(false);
    setSplitPayments([]);
    setIsAddingSplitPayment(false);
    setSaleNotes("");
    setError(null);
    setNotice(null);
    checkoutTotalAtOpenRef.current =
      checkoutTotalCents;
    setIsPaymentOpen(true);
  }

  function closePayment() {
    if (isCharging) return;

    checkoutTotalAtOpenRef.current = null;
    setIsPaymentOpen(false);
    setIsSplitPayment(false);
    setSplitPayments([]);
    setIsAddingSplitPayment(false);
    setError(null);
  }

  function choosePaymentMethod(
    method: PaymentMethod
  ) {
    setPaymentMethod(method);
    setError(null);

    if (method === "cash") {
      setTenderedAmount(
        centsToMoneyInput(checkoutTotalCents)
      );
    } else {
      setTenderedAmount("");
    }
  }

  function beginSplitPayment() {
    if (isCharging) return;

    setIsSplitPayment(true);
    setSplitPayments([]);
    setIsAddingSplitPayment(false);
    setError(null);
  }

  function returnToSimplePayment() {
    if (isCharging) return;

    setIsSplitPayment(false);
    setSplitPayments([]);
    setIsAddingSplitPayment(false);
    setError(null);
  }

  function addSplitPayment(method: PaymentMethod) {
    if (isCharging) return;

    setSplitPayments((current) => {
      if (current.length >= 10) return current;

      const appliedCents = current.reduce(
        (total, payment) =>
          total +
          Math.max(
            moneyToCents(payment.amount) || 0,
            0
          ),
        0
      );
      const pendingCents = Math.max(
        checkoutTotalCents - appliedCents,
        0
      );

      if (pendingCents === 0) return current;

      const suggestedAmount =
        centsToMoneyInput(pendingCents);

      return [
        ...current,
        {
          id: crypto.randomUUID(),
          method,
          amount: suggestedAmount,
          tenderedAmount:
            method === "cash"
              ? suggestedAmount
              : "",
          reference: "",
        },
      ];
    });
    setIsAddingSplitPayment(false);
    setError(null);
  }

  function updateSplitPaymentAmount(
    paymentId: string,
    value: string
  ) {
    const rawValue = normalizeMoneyInput(value);

    if (rawValue === null) return;

    setSplitPayments((current) => {
      const requestedCents = moneyToCents(rawValue);

      return current.map((payment) => {
        if (payment.id !== paymentId) {
          return payment;
        }

        if (requestedCents === null) {
          return {
            ...payment,
            amount: rawValue,
          };
        }

        const otherAppliedCents = current.reduce(
          (total, item) =>
            item.id === paymentId
              ? total
              : total +
                Math.max(
                  moneyToCents(item.amount) || 0,
                  0
                ),
          0
        );
        const maximumCents = Math.max(
          checkoutTotalCents - otherAppliedCents,
          0
        );

        return {
          ...payment,
          amount:
            requestedCents > maximumCents
              ? centsToMoneyInput(maximumCents)
              : rawValue,
        };
      });
    });
    setError(null);
  }

  function updateSplitPaymentTendered(
    paymentId: string,
    value: string
  ) {
    const rawValue = normalizeMoneyInput(value);

    if (rawValue === null) return;

    setSplitPayments((current) =>
      current.map((payment) =>
        payment.id === paymentId
          ? {
              ...payment,
              tenderedAmount: rawValue,
            }
          : payment
      )
    );
    setError(null);
  }

  function updateSplitPaymentReference(
    paymentId: string,
    value: string
  ) {
    setSplitPayments((current) =>
      current.map((payment) =>
        payment.id === paymentId
          ? {
              ...payment,
              reference: value,
            }
          : payment
      )
    );
    setError(null);
  }

  function updateSplitPaymentMethod(
    paymentId: string,
    method: PaymentMethod
  ) {
    setSplitPayments((current) =>
      current.map((payment) => {
        if (payment.id !== paymentId) {
          return payment;
        }

        return {
          ...payment,
          method,
          tenderedAmount:
            method === "cash"
              ? payment.tenderedAmount ||
                payment.amount
              : "",
        };
      })
    );
    setError(null);
  }

  function removeSplitPayment(paymentId: string) {
    setSplitPayments((current) =>
      current.filter(
        (payment) => payment.id !== paymentId
      )
    );
    setError(null);
  }

  function buildCheckoutPayments(): CheckoutPaymentPayload[] {
    if (!isSplitPayment) {
      return [
        {
          method: paymentMethod,
          amount: centsToMoney(checkoutTotalCents),
          tenderedAmount:
            paymentMethod === "cash"
              ? tenderedNumber
              : centsToMoney(checkoutTotalCents),
          reference:
            paymentReference.trim() || null,
        },
      ];
    }

    return splitPayments.flatMap((payment) => {
      const amountCents = moneyToCents(
        payment.amount
      );

      if (
        amountCents === null ||
        amountCents <= 0
      ) {
        return [];
      }

      const payload: CheckoutPaymentPayload = {
        method: payment.method,
        amount: centsToMoney(amountCents),
      };

      if (payment.method === "cash") {
        const cashTenderedCents = moneyToCents(
          payment.tenderedAmount
        );

        if (cashTenderedCents !== null) {
          payload.tenderedAmount =
            centsToMoney(cashTenderedCents);
        }
      } else if (payment.reference.trim()) {
        payload.reference =
          payment.reference.trim();
      }

      return [payload];
    });
  }

  async function completeSale() {
    if (isCharging) return;

    if (
      !selectedSession ||
      !selectedLocation
    ) {
      setError(
        "No hay una caja válida seleccionada."
      );
      return;
    }

    if (!canCharge) {
      setError(
        !isSplitPayment && paymentMethod === "cash"
          ? "El efectivo recibido no cubre el total."
          : "La venta no está lista para cobrarse."
      );
      return;
    }

    try {
      setIsCharging(true);
      setError(null);
      setNotice(null);

      const idempotencyKey =
        checkoutIdempotencyKeyRef.current ||
        crypto.randomUUID();
      checkoutIdempotencyKeyRef.current =
        idempotencyKey;

      const response =
        await apiRequest<SaleResponse>(
          "/api/pos/sales",
          {
            method: "POST",
            body: JSON.stringify({
              brandSlug:
                brand.slug,
              locationId:
                selectedSession.location_id,
              registerId:
                selectedSession.register_id,
              cashSessionId:
                selectedSession.id,
              customerId:
                selectedCustomer?.id ||
                null,
              items: cart.map(
                (item) => ({
                  variantId:
                    item.variantId,
                  quantity:
                    item.quantity,
                  discountAmount:
                    item.discountAmount,
                })
              ),
              payments:
                buildCheckoutPayments(),
              notes:
                saleNotes || null,
              rewardId:
                selectedReward?.id ||
                null,
              rewardUnlockId:
                selectedRewardUnlock?.id ||
                null,
              idempotencyKey,
            }),
          }
        );

      setCompletedCustomerName(
        selectedCustomer
          ? getCustomerName(
              selectedCustomer
            )
          : null
      );

      setCompletedSale(
        normalizeSaleResult(
          response.sale,
          response.paymentSummary
        )
      );

      setCart([]);
      setIsPaymentOpen(false);
      setTenderedAmount("");
      setPaymentReference("");
      setIsSplitPayment(false);
      setSplitPayments([]);
      setIsAddingSplitPayment(false);
      setSaleNotes("");
      setSearch("");
      setSelectedCategory("all");
      setSelectedCustomerId("");
      setSelectedPointRewardId(null);
      setSelectedRewardUnlockId(null);
      setAvailableRewards([]);
      setVisitProgress([]);
      setRewardUnlocks([]);
      setLoyaltyMember(null);
      checkoutIdempotencyKeyRef.current = null;
      checkoutTotalAtOpenRef.current = null;

      await loadRegisterData();
    } catch (saleError) {
      setError(
        getErrorMessage(saleError)
      );
    } finally {
      setIsCharging(false);
    }
  }

  if (isLoading) {
    return (
      <PosPage width="full" density="compact" aria-busy="true">
        <div className="h-20 animate-pulse rounded-[var(--pos-radius-lg)] bg-white/[0.035]" />
        <div className="grid gap-4 min-[1180px]:grid-cols-[minmax(0,1fr)_400px]">
          <div className="h-[680px] animate-pulse rounded-[var(--pos-radius-lg)] bg-white/[0.035]" />
          <div className="h-[680px] animate-pulse rounded-[var(--pos-radius-lg)] bg-white/[0.035]" />
        </div>
      </PosPage>
    );
  }

  if (
    openSessions.length === 0
  ) {
    return (
      <NoOpenSession
        brandSlug={brand.slug}
      />
    );
  }

  return (
    <PosPage width="full" density="compact" className="pb-20 min-[1180px]:pb-0">
      <header className="border-b border-[var(--pos-line-subtle)] pb-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_460px] lg:items-end">
          <div>
            <div className="hidden">
              <span className="flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[0.07] px-4 py-2 text-[9px] font-black uppercase tracking-[0.18em] text-emerald-200">
                <span className="h-2 w-2 rounded-full bg-emerald-300" />
                Terminal activa
              </span>

              <span className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.07] px-4 py-2 text-[9px] font-black uppercase tracking-[0.18em] text-cyan-200">
                Venta de mostrador
              </span>
            </div>

            <h2 className="text-[22px] font-bold tracking-[-0.035em] text-[var(--pos-text-primary)] md:text-2xl">
              Nueva venta
            </h2>

            <p className="mt-1 text-sm text-[var(--pos-text-muted)]">
              {selectedSession?.location?.name || "Sucursal"} · {selectedSession?.register?.name || "Caja activa"}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
            <SelectField
              label="Caja activa"
              value={
                selectedSessionId
              }
              onChange={
                handleSessionChange
              }
              options={openSessions.map(
                (session) => [
                  session.id,
                  `${
                    session.register
                      ?.name ||
                    "Caja"
                  } · ${
                    session.location
                      ?.name ||
                    "Sucursal"
                  }`,
                ]
              )}
            />

            <div className="rounded-[var(--pos-radius-md)] bg-[var(--pos-panel)] px-4 py-3">
              <p className="text-[11px] font-medium text-[var(--pos-text-muted)]">
                Fondo inicial
              </p>
              <p className="mt-1 text-base font-bold text-[var(--pos-text-primary)]">
                {formatMoney(
                  Number(
                    selectedSession
                      ?.opening_amount ||
                      0
                  ),
                  currency
                )}
              </p>
            </div>
          </div>
        </div>
      </header>

      <FeedbackBanner
        error={error}
        notice={notice}
      />

      <section className="grid gap-4 min-[1180px]:grid-cols-[minmax(0,1fr)_400px] min-[1180px]:items-start">
        <div className="grid min-w-0 content-start gap-4">
          <article className="rounded-[var(--pos-radius-lg)] bg-[var(--pos-row-selected)] p-4">
            <form
              onSubmit={handleScan}
              className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_150px]"
            >
              <label className="relative">
                <span className="sr-only">
                  Escanear SKU o código de barras
                </span>

                <input
                  ref={scannerRef}
                  autoFocus
                  autoComplete="off"
                  value={scanCode}
                  onChange={(event) =>
                    setScanCode(
                      event.target.value
                    )
                  }
                  placeholder="Escanea SKU o código de barras"
                  className="pos-ui-focus h-12 w-full rounded-[var(--pos-radius-md)] border border-[var(--pos-primary-line)] bg-[var(--pos-canvas)] px-4 pr-24 font-mono text-sm font-semibold text-[var(--pos-text-primary)] outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-[var(--pos-text-muted)]"
                />

                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-cyan-300/[0.08] px-3 py-1 text-[8px] font-black uppercase tracking-[0.12em] text-cyan-300">
                  F2 Scanner
                </span>
              </label>

              <button
                type="submit"
                disabled={
                  isScanning ||
                  !scanCode.trim()
                }
                className="h-12 rounded-[var(--pos-radius-md)] bg-[var(--pos-primary)] px-5 text-sm font-semibold text-slate-950 disabled:opacity-45"
              >
                {isScanning
                  ? "Buscando..."
                  : "Agregar"}
              </button>
            </form>
          </article>

          <article className="rounded-[var(--pos-radius-lg)] bg-[var(--pos-panel)] p-4">
            <div className="flex flex-col gap-3 border-b border-[var(--pos-line-subtle)] pb-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-medium text-[var(--pos-text-muted)]">
                  Catálogo vendible
                </p>
                <h3 className="mt-1 text-base font-bold text-[var(--pos-text-primary)]">
                  Selecciona una variante
                </h3>
                <p className="mt-1 text-xs text-[var(--pos-text-muted)]">
                  La existencia corresponde a{" "}
                  {selectedSession
                    ?.location?.name ||
                    "la sucursal activa"}
                  .
                </p>
              </div>

              <label className="relative min-w-0 lg:w-80">
                <PosIcon
                  name="search"
                  className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600"
                />

                <input
                  ref={searchRef}
                  value={search}
                  onChange={(event) =>
                    setSearch(
                      event.target.value
                    )
                  }
                  placeholder="Buscar producto, talla, SKU..."
                  className="pos-ui-focus h-11 w-full rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] bg-[var(--pos-canvas)] pl-11 pr-12 text-sm font-medium text-[var(--pos-text-primary)] outline-none placeholder:text-[var(--pos-text-muted)]"
                />

                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[8px] font-black uppercase text-slate-700">
                  F3
                </span>
              </label>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-2 [scrollbar-width:thin]">
              <button
                type="button"
                onClick={() =>
                  setSelectedCategory(
                    "all"
                  )
                }
                className={`pos-ui-focus min-h-10 shrink-0 rounded-[var(--pos-radius-pill)] px-4 text-xs font-semibold ${
                  selectedCategory ===
                  "all"
                    ? "bg-[var(--pos-primary)] text-slate-950"
                    : "bg-white/[0.04] text-[var(--pos-text-secondary)]"
                }`}
              >
                Todos
              </button>

              {categories.map(
                ([id, name]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() =>
                      setSelectedCategory(
                        id
                      )
                    }
                    className={`shrink-0 rounded-full px-4 py-2 text-[9px] font-black uppercase tracking-[0.12em] ${
                      selectedCategory ===
                      id
                        ? "bg-cyan-300 text-slate-950"
                        : "border border-white/[0.08] bg-white/[0.025] text-slate-500"
                    }`}
                  >
                    {name}
                  </button>
                )
              )}
            </div>

            {filteredGroups.length >
            0 ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 min-[1180px]:grid-cols-2 min-[1500px]:grid-cols-3">
                {filteredGroups.map(
                  (group) => (
                    <ProductGroupCard
                      key={
                        group.productId
                      }
                      group={group}
                      currency={currency}
                      onAdd={() =>
                        selectProduct(group)
                      }
                    />
                  )
                )}
              </div>
            ) : (
              <EmptyCatalog
                brandSlug={
                  brand.slug
                }
                hasProducts={
                  sellableVariants.length >
                  0
                }
                hasSearch={
                  Boolean(
                    search.trim()
                  ) ||
                  selectedCategory !==
                    "all"
                }
              />
            )}
          </article>
        </div>

        {selectedProduct ? (
          <VariantSelectorModal
            group={selectedProduct}
            definitions={attributeDefinitions}
            currency={currency}
            onClose={() => setSelectedProductId(null)}
            onSelect={(variant) => {
              addVariantToCart(variant);
              setSelectedProductId(null);
            }}
          />
        ) : null}

        <CartPanel
          cart={cart}
          totals={totals}
          baseTotals={baseTotals}
          currency={currency}
          unitMap={unitMap}
          selectedCustomer={
            selectedCustomer
          }
          loyaltyMember={loyaltyMember}
          rewards={availableRewards}
          visitProgress={visitProgress}
          rewardUnlocks={rewardUnlocks}
          selectedPointRewardId={selectedPointRewardId}
          selectedRewardUnlockId={selectedRewardUnlockId}
          isLoadingRewards={isLoadingRewards}
          loyaltyLoadError={loyaltyLoadError}
          loyaltyDiscount={loyaltyDiscount}
          onPointRewardChange={(rewardId) => {
            setSelectedPointRewardId(rewardId);
            if (rewardId) setSelectedRewardUnlockId(null);
          }}
          onRewardUnlockChange={(unlockId) => {
            setSelectedRewardUnlockId(unlockId);
            if (unlockId) setSelectedPointRewardId(null);
          }}
          onChooseCustomer={() => {
            setCustomerSearch("");
            setIsCustomerPickerOpen(
              true
            );
          }}
          onClearCustomer={
            clearSelectedCustomer
          }
          onQuantityChange={
            updateCartQuantity
          }
          onRemove={removeCartItem}
          onClear={clearCart}
          onCharge={openPayment}
        />
      </section>

      {isCustomerPickerOpen ? (
        <CustomerPickerModal
          customers={
            filteredCustomers
          }
          search={customerSearch}
          selectedCustomerId={
            selectedCustomerId
          }
          brandSlug={brand.slug}
          onSearchChange={
            setCustomerSearch
          }
          isCreatingCustomer={isCreatingCustomer}
          onCreateCustomer={createQuickCustomer}
          onSelect={
            selectCustomer
          }
          onUseGeneral={() => {
            clearSelectedCustomer();
            setIsCustomerPickerOpen(
              false
            );
            setCustomerSearch("");
          }}
          onClose={() => {
            setIsCustomerPickerOpen(
              false
            );
            setCustomerSearch("");
          }}
        />
      ) : null}

      {isPaymentOpen ? (
        <PaymentModal
          totals={totals}
          currency={currency}
          isSplitPayment={isSplitPayment}
          splitPayments={splitPayments}
          splitPaymentSummary={splitPaymentSummary}
          isAddingSplitPayment={isAddingSplitPayment}
          method={paymentMethod}
          tenderedAmount={
            tenderedAmount
          }
          reference={
            paymentReference
          }
          notes={saleNotes}
          changeDue={changeDue}
          isCashTenderedShort={
            paymentMethod === "cash" &&
            (
              tenderedCents === null ||
              tenderedCents < checkoutTotalCents
            )
          }
          canCharge={canCharge}
          isCharging={isCharging}
          error={error}
          onBeginSplit={beginSplitPayment}
          onReturnToSimple={returnToSimplePayment}
          onAddSplitPayment={addSplitPayment}
          onToggleAddSplitPayment={() =>
            setIsAddingSplitPayment((current) => !current)
          }
          onSplitPaymentMethodChange={
            updateSplitPaymentMethod
          }
          onSplitPaymentAmountChange={
            updateSplitPaymentAmount
          }
          onSplitPaymentTenderedChange={
            updateSplitPaymentTendered
          }
          onSplitPaymentReferenceChange={
            updateSplitPaymentReference
          }
          onRemoveSplitPayment={removeSplitPayment}
          onMethodChange={
            choosePaymentMethod
          }
          onTenderedChange={
            (value) => {
              setTenderedAmount(value);
              setError(null);
            }
          }
          onReferenceChange={
            (value) => {
              setPaymentReference(value);
              setError(null);
            }
          }
          onNotesChange={
            (value) => {
              setSaleNotes(value);
              setError(null);
            }
          }
          onClose={closePayment}
          onComplete={
            completeSale
          }
        />
      ) : null}

      {completedSale ? (
        <SaleSuccessModal
          sale={completedSale}
          currency={currency}
          customerName={
            completedCustomerName
          }
          onPrint={() => {
            const printUrl = `${buildPosHref(brand.slug, "sales")}?saleId=${encodeURIComponent(completedSale.id)}&print=1`;
            window.open(printUrl, "_blank", "noopener,noreferrer");
          }}
          onClose={() => {
            setCompletedSale(null);
            setCompletedCustomerName(
              null
            );
            window.setTimeout(() => {
              scannerRef.current?.focus();
            }, 80);
          }}
        />
      ) : null}
    </PosPage>
  );
}

function ProductGroupCard({
  group,
  currency,
  onAdd,
}: {
  group: ProductGroup;
  currency: string;
  onAdd: () => void;
}) {
  const single = group.variants.length === 1;
  const variant = group.variants[0];
  const tracked = group.variants.some((item) => item.inventoryTracked);
  const totalStock = group.variants.reduce(
    (total, item) =>
      total + (item.inventoryTracked ? Math.max(item.availableStock, 0) : 0),
    0
  );
  const prices = group.variants.map((item) => item.price);
  const samePrice = prices.every((price) => price === prices[0]);
  const soldOut = single && Boolean(variant?.inventoryTracked && variant.availableStock <= 0);

  return (
    <button
      type="button"
      disabled={soldOut}
      onClick={onAdd}
      className="pos-ui-focus group flex min-h-36 flex-col rounded-[var(--pos-radius-md)] bg-[var(--pos-canvas)] p-3 text-left transition-colors duration-150 hover:bg-[var(--pos-panel-raised)] disabled:cursor-not-allowed disabled:opacity-45"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[var(--pos-radius-sm)] bg-white/[0.04]">
          <PosProductImage
            src={variant?.variantImageUrl || group.productImageUrl}
            alt={group.productName}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold leading-5 text-[var(--pos-text-primary)]">
            {group.productName}
          </p>
          <p className="mt-1 text-xs text-[var(--pos-text-secondary)]">
            {single ? variant?.variantName : `${group.variants.length} variantes`}
          </p>
        </div>
      </div>
      <div className="mt-auto flex items-end justify-between gap-3 pt-4">
        <div>
          <p className="text-base font-bold text-[var(--pos-text-primary)]">
            {samePrice ? formatMoney(prices[0] || 0, currency) : `Desde ${formatMoney(Math.min(...prices), currency)}`}
          </p>
          <p className={`mt-1 text-[9px] font-black uppercase tracking-[0.1em] ${soldOut ? "text-rose-300" : "text-cyan-300"}`}>
            {soldOut ? "Agotado" : tracked ? `${formatQuantity(totalStock)} disponibles` : "Venta sin inventario"}
          </p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--pos-radius-sm)] bg-[var(--pos-primary-soft)] text-lg font-bold text-[var(--pos-primary)] transition-colors group-hover:bg-[var(--pos-primary)] group-hover:text-slate-950">
          {single ? "+" : "›"}
        </span>
      </div>
    </button>
  );
}

function VariantSelectorModal({
  group,
  definitions,
  currency,
  onClose,
  onSelect,
}: {
  group: ProductGroup;
  definitions: ProductAttributeDefinition[];
  currency: string;
  onClose: () => void;
  onSelect: (variant: SellableVariant) => void;
}) {
  const [selection, setSelection] = useState<Record<string, string>>({});
  const attributeCodes = useMemo(() => {
    const keys = new Set(
      group.variants.flatMap((variant) => Object.keys(variant.attributes || {}))
    );
    return [
      ...definitions
        .filter((definition) => keys.has(definition.code))
        .sort((left, right) => left.sort_order - right.sort_order)
        .map((definition) => definition.code),
      ...Array.from(keys).filter(
        (key) => !definitions.some((definition) => definition.code === key)
      ).sort(),
    ];
  }, [definitions, group.variants]);

  const labelFor = (code: string) =>
    definitions.find((definition) => definition.code === code)?.name || code;

  const optionsFor = (code: string) =>
    Array.from(
      new Set(
        group.variants
          .map((variant) => String(variant.attributes[code] || "").trim())
          .filter(Boolean)
      )
    );

  useEffect(() => {
    setSelection((current) => {
      const next = { ...current };
      for (const code of attributeCodes) {
        const options = optionsFor(code);
        if (options.length === 1) next[code] = options[0];
      }
      return next;
    });
  }, [attributeCodes, group.variants]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key === "Enter") {
        const variant = resolveVariant(group.variants, attributeCodes, selection);
        if (variant && (!variant.inventoryTracked || variant.availableStock > 0)) {
          event.preventDefault();
          onSelect(variant);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [attributeCodes, group.variants, onClose, onSelect, selection]);

  const resolved = resolveVariant(group.variants, attributeCodes, selection);
  const resolvedStock = resolved?.inventoryTracked
    ? Math.max(resolved.availableStock, 0)
    : null;
  const resolvedDescriptor = resolved ? formatAttributes(resolved.attributes) : "Selecciona una combinación";

  return (
    <PosModal open onClose={onClose} size="medium" title={group.productName} description="Selecciona una combinación disponible.">
      <div className="grid gap-5">
        <div className="flex items-center gap-4 rounded-[var(--pos-radius-md)] bg-white/[0.035] p-3">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[var(--pos-radius-sm)] bg-white/[0.05]">
            <PosProductImage
              src={resolved?.variantImageUrl || group.productImageUrl}
              alt={group.productName}
              className="h-full w-full object-cover"
            />
          </div>
          <div>
            <p className="text-xl font-black text-[var(--pos-text-primary)]">
              {resolved ? formatMoney(resolved.price, currency) : "Selecciona una variante"}
            </p>
            <p className="mt-1 text-xs text-[var(--pos-text-secondary)]">
              {resolved ? (resolvedStock === null ? "Venta sin inventario" : `Stock: ${formatQuantity(resolvedStock)}`) : "La imagen y el precio se actualizarán al resolverla."}
            </p>
          </div>
        </div>

        {attributeCodes.map((code) => {
          const options = optionsFor(code);
          return (
            <div key={code}>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-[var(--pos-text-muted)]">
                {labelFor(code)}
              </p>
              <div className="flex flex-wrap gap-2">
                {options.map((option) => {
                  const candidate = { ...selection, [code]: option };
                  const matches = group.variants.filter((variant) =>
                    matchesSelection(variant, candidate)
                  );
                  const available = matches.some(
                    (variant) => !variant.inventoryTracked || variant.availableStock > 0
                  );
                  const active = selection[code] === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={matches.length === 0 || !available}
                      onClick={() => setSelection((current) => ({ ...current, [code]: option }))}
                      className={`pos-ui-focus min-h-10 rounded-[var(--pos-radius-sm)] border px-4 py-2 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${active ? "border-cyan-300 bg-cyan-300 text-slate-950" : "border-[var(--pos-line)] bg-white/[0.03] text-[var(--pos-text-primary)]"}`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div className="rounded-[var(--pos-radius-sm)] bg-white/[0.035] p-3 text-sm text-[var(--pos-text-secondary)]">
          <span className="font-semibold text-[var(--pos-text-primary)]">Seleccionado:</span>{" "}{resolvedDescriptor}
          {resolved && resolvedStock === 0 ? <span className="ml-2 font-bold text-rose-300">Agotado</span> : null}
        </div>

        <PosButton
          type="button"
          fullWidth
          disabled={!resolved || Boolean(resolved.inventoryTracked && resolved.availableStock <= 0)}
          onClick={() => resolved && onSelect(resolved)}
        >
          Agregar al carrito
        </PosButton>
      </div>
    </PosModal>
  );
}

function resolveVariant(
  variants: SellableVariant[],
  attributeCodes: string[],
  selection: Record<string, string>
) {
  if (attributeCodes.some((code) => !selection[code])) return null;
  return variants.find((variant) =>
    attributeCodes.every(
      (code) => String(variant.attributes[code] || "").trim() === selection[code]
    )
  ) || null;
}

function matchesSelection(
  variant: SellableVariant,
  selection: Record<string, string>
) {
  return Object.entries(selection).every(
    ([code, value]) => String(variant.attributes[code] || "").trim() === value
  );
}

function VariantCard({
  variant,
  currency,
  unit,
  onAdd,
}: {
  variant: SellableVariant;
  currency: string;
  unit: UnitOption | undefined;
  onAdd: () => void;
}) {
  const soldOut =
    variant.inventoryTracked &&
    variant.availableStock <= 0;

  return (
    <button
      type="button"
      disabled={soldOut}
      onClick={onAdd}
      className="pos-ui-focus group flex min-h-36 flex-col rounded-[var(--pos-radius-md)] bg-[var(--pos-canvas)] p-3 text-left transition-colors duration-150 hover:bg-[var(--pos-panel-raised)] disabled:cursor-not-allowed disabled:opacity-45"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[var(--pos-radius-sm)] bg-white/[0.04]">
          <PosProductImage
            src={variant.variantImageUrl || variant.productImageUrl}
            alt={variant.productName}
            className="h-full w-full object-cover"
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold leading-5 text-[var(--pos-text-primary)]">
            {variant.productName}
          </p>
          <p className="mt-0.5 truncate text-xs text-[var(--pos-text-secondary)]">
            {variant.variantName}
          </p>
        </div>
      </div>

      <p className="mt-2 line-clamp-1 text-[11px] text-[var(--pos-text-secondary)]">
        {formatAttributes(
          variant.attributes
        )}
        {variant.sku
          ? ` · ${variant.sku}`
          : ""}
      </p>

      <div className="mt-auto flex items-end justify-between gap-3 pt-3">
        <div>
          <p className="text-base font-bold text-[var(--pos-text-primary)]">
            {formatMoney(
              variant.price,
              currency
            )}
          </p>
          <p
            className={`mt-1 text-[9px] font-black uppercase tracking-[0.1em] ${
              soldOut
                ? "text-rose-300"
                : variant.inventoryTracked
                ? "text-emerald-300"
                : "text-cyan-300"
            }`}
          >
            {soldOut
              ? "Sin existencia"
              : variant.inventoryTracked
              ? `${formatQuantity(
                  variant.availableStock
                )} ${
                  unit?.symbol ||
                  variant.unitCode
                } disponibles`
              : "Venta sin inventario"}
          </p>
        </div>

        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--pos-radius-sm)] bg-[var(--pos-primary-soft)] text-lg font-bold text-[var(--pos-primary)] transition-colors group-hover:bg-[var(--pos-primary)] group-hover:text-slate-950">
          +
        </span>
      </div>
    </button>
  );
}

function CartPanel({
  cart,
  totals,
  baseTotals,
  currency,
  unitMap,
  selectedCustomer,
  loyaltyMember,
  rewards,
  visitProgress,
  rewardUnlocks,
  selectedPointRewardId,
  selectedRewardUnlockId,
  isLoadingRewards,
  loyaltyLoadError,
  loyaltyDiscount,
  onPointRewardChange,
  onRewardUnlockChange,
  onChooseCustomer,
  onClearCustomer,
  onQuantityChange,
  onRemove,
  onClear,
  onCharge,
}: {
  cart: CartItem[];
  totals: SaleTotals;
  baseTotals: SaleTotals;
  currency: string;
  unitMap: Map<
    string,
    UnitOption
  >;
  selectedCustomer: PosCustomer | null;
  loyaltyMember: AvailableRewardsResponse["member"];
  rewards: AvailableReward[];
  visitProgress: VisitProgressProgram[];
  rewardUnlocks: RewardUnlock[];
  selectedPointRewardId: string | null;
  selectedRewardUnlockId: string | null;
  isLoadingRewards: boolean;
  loyaltyLoadError: string | null;
  loyaltyDiscount: number;
  onPointRewardChange: (rewardId: string | null) => void;
  onRewardUnlockChange: (unlockId: string | null) => void;
  onChooseCustomer: () => void;
  onClearCustomer: () => void;
  onQuantityChange: (
    variantId: string,
    quantity: number
  ) => void;
  onRemove: (
    variantId: string
  ) => void;
  onClear: () => void;
  onCharge: () => void;
}) {
  return (
    <aside className="rounded-[var(--pos-radius-lg)] bg-[var(--pos-panel-raised)] p-4 min-[1180px]:sticky min-[1180px]:top-[80px] min-[1180px]:h-fit">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--pos-line-subtle)] pb-4">
        <div>
          <p className="text-xs font-medium text-[var(--pos-text-muted)]">
            Venta actual
          </p>
          <h3 className="mt-1 text-lg font-bold text-[var(--pos-text-primary)]">
            {cart.length > 0
              ? `${totals.articleCount} artículos`
              : "Carrito vacío"}
          </h3>
        </div>

        {cart.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="text-[10px] font-black uppercase tracking-[0.12em] text-rose-300"
          >
            Vaciar
          </button>
        ) : (
          <span className="rounded-full bg-white/[0.05] px-3 py-2 text-[9px] font-black text-slate-600">
            0
          </span>
        )}
      </div>

      <div className="mt-3 rounded-[var(--pos-radius-md)] bg-white/[0.035] p-3">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onChooseCustomer}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--pos-radius-sm)] ${
                selectedCustomer
                  ? "bg-emerald-300 text-slate-950"
                  : "bg-cyan-300/[0.08] text-cyan-300"
              }`}
            >
              <PosIcon
                name="customer"
                className="h-5 w-5"
              />
            </div>

            <div className="min-w-0">
              <p className="text-[11px] font-medium text-[var(--pos-text-muted)]">
                Cliente
              </p>
              <p className="mt-0.5 truncate text-sm font-semibold text-[var(--pos-text-primary)]">
                {selectedCustomer
                  ? getCustomerName(
                      selectedCustomer
                    )
                  : "Público general"}
              </p>

              {selectedCustomer ? (
                <p className="mt-1 truncate text-[9px] font-semibold text-emerald-300">
                  {normalizeMember(
                    selectedCustomer
                      .loyalty_member
                  )
                    ? `${formatInteger(
                        normalizeMember(
                          selectedCustomer
                            .loyalty_member
                        )?.points_balance ||
                          0
                      )} puntos actuales`
                    : "Acumulará puntos al comprar"}
                </p>
              ) : (
                <p className="mt-1 text-[9px] font-semibold text-slate-700">
                  Toca para identificarlo
                </p>
              )}
            </div>
          </button>

          {selectedCustomer ? (
            <button
              type="button"
              onClick={
                onClearCustomer
              }
              className="text-[9px] font-black uppercase tracking-[0.1em] text-rose-300"
            >
              Quitar
            </button>
          ) : (
            <button
              type="button"
              onClick={onChooseCustomer}
              className="rounded-[11px] border border-cyan-300/15 bg-cyan-300/[0.06] px-3 py-2 text-[9px] font-black uppercase tracking-[0.1em] text-cyan-300"
            >
              Elegir
            </button>
          )}
        </div>
      </div>

      {selectedCustomer ? (
        <div className="mt-3 rounded-[var(--pos-radius-md)] bg-[var(--pos-success-soft)] p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.14em] text-emerald-300">Fidelización</p>
              <p className="mt-1 text-xs font-black text-white">
                {loyaltyMember
                  ? `${formatInteger(loyaltyMember.pointsBalance)} puntos disponibles${loyaltyMember.tier ? ` · ${loyaltyMember.tier.name} ${loyaltyMember.tier.pointsMultiplier.toFixed(2)}x` : ""}`
                  : "Sin membresía activa"}
              </p>
            </div>
            {isLoadingRewards ? (
              <span className="text-[9px] font-bold text-slate-600">Cargando...</span>
            ) : null}
          </div>

          {!isLoadingRewards && rewards.length ? (
            <div className="mt-3 grid gap-2">
              {rewards.map((reward) => {
                const fitsSale = reward.rewardValue < baseTotals.total;
                const canUse = reward.available && fitsSale;
                const pointsMissing = loyaltyMember
                  ? Math.max(reward.pointsCost - loyaltyMember.pointsBalance, 0)
                  : 0;
                return (
                  <label
                    key={reward.id}
                    className={`flex items-start rounded-[var(--pos-radius-sm)] border ${
                      canUse ? "min-h-11 gap-3 p-3" : "gap-2 px-2.5 py-2"
                    } ${
                      selectedPointRewardId === reward.id
                        ? "border-emerald-300/30 bg-emerald-300/[0.08]"
                        : "border-white/[0.07] bg-white/[0.025]"
                    } ${canUse ? "cursor-pointer" : "opacity-70"}`}
                  >
                    <input
                      type="radio"
                      name="loyalty-reward"
                      value={reward.id}
                      checked={selectedPointRewardId === reward.id}
                      disabled={!canUse}
                      onChange={() => onPointRewardChange(reward.id)}
                      className={`${canUse ? "mt-1" : "mt-0.5"} accent-emerald-300`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-[var(--pos-text-primary)]">{reward.name}</span>
                      <span className="mt-0.5 block text-[10px] font-medium text-[var(--pos-text-secondary)]">
                        {formatInteger(reward.pointsCost)} pts · {formatMoney(reward.rewardValue, currency)}
                      </span>
                      {!canUse ? (
                        <span className="mt-0.5 block text-[9px] font-medium leading-4 text-amber-200">
                          {pointsMissing > 0
                            ? `Faltan ${formatInteger(pointsMissing)} pts · `
                            : ""}
                          {reward.unavailableReason || "El descuento debe ser menor que el total de la venta."}
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
              {selectedPointRewardId ? (
                <button type="button" onClick={() => onPointRewardChange(null)} className="justify-self-start text-[9px] font-black uppercase tracking-[0.1em] text-rose-300">
                  Quitar recompensa
                </button>
              ) : null}
            </div>
          ) : null}

          {visitProgress.some((program) => program.active) ? (
            <div className="mt-3 space-y-2 border-t border-white/[0.07] pt-3">
              {visitProgress.filter((program) => program.active).map((program) => (
                <div key={program.id}>
                  <div className="flex items-center justify-between gap-3 text-[10px]">
                    <span className="truncate font-semibold text-[var(--pos-text-secondary)]">{program.name}</span>
                    <span className="shrink-0 text-[var(--pos-text-muted)]">{program.currentProgress} / {program.requiredVisits}{program.cyclesCompleted > 0 ? ` · Ciclo ${program.cyclesCompleted + 1}` : ""}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                    <div className="h-full rounded-full bg-cyan-300 transition-[width] duration-150" style={{ width: `${Math.min((program.currentProgress / program.requiredVisits) * 100, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {rewardUnlocks.length ? (
            <div className="mt-3 grid gap-2 border-t border-white/[0.07] pt-3">
              <p className="text-[9px] font-bold text-[var(--pos-text-muted)]">Recompensas por visitas</p>
              {rewardUnlocks.map((unlock) => {
                const programName = visitProgress.find((program) => program.id === unlock.visitProgramId)?.name || "programa de visitas";
                const canUse = unlock.rewardValue < baseTotals.total;
                return (
                  <label key={unlock.id} className={`flex items-start gap-3 rounded-[var(--pos-radius-sm)] border p-3 ${selectedRewardUnlockId === unlock.id ? "border-cyan-300/30 bg-cyan-300/[0.08]" : "border-white/[0.07] bg-white/[0.025]"} ${canUse ? "cursor-pointer" : "opacity-70"}`}>
                    <input type="radio" name="loyalty-reward" checked={selectedRewardUnlockId === unlock.id} disabled={!canUse} onChange={() => onRewardUnlockChange(unlock.id)} className="mt-1 accent-cyan-300" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-[var(--pos-text-primary)]">{unlock.rewardName}</span>
                      <span className="mt-0.5 block text-[10px] text-[var(--pos-text-secondary)]">{formatMoney(unlock.rewardValue, currency)} · {programName} · Ciclo {unlock.cycleNumber}</span>
                    </span>
                  </label>
                );
              })}
              {selectedRewardUnlockId ? <button type="button" onClick={() => onRewardUnlockChange(null)} className="justify-self-start text-[9px] font-black uppercase tracking-[0.1em] text-rose-300">Quitar recompensa</button> : null}
            </div>
          ) : null}

          {loyaltyLoadError ? <p className="mt-2 text-[10px] font-medium text-amber-200">{loyaltyLoadError}</p> : null}
        </div>
      ) : null}

      <div className="pos-ui-scrollbar mt-3 grid max-h-[330px] gap-2 overflow-y-auto pr-1">
        {cart.length > 0 ? (
          cart.map((item) => {
            const unit =
              unitMap.get(
                item.unitCode
              );
            const precision =
              unit
                ?.decimal_precision ||
              0;
            const step =
              precision > 0
                ? 1 /
                  Math.pow(
                    10,
                    precision
                  )
                : 1;

            return (
              <div
                key={item.variantId}
                className="rounded-[var(--pos-radius-md)] bg-[var(--pos-canvas)] p-3"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--pos-text-primary)]">
                      {item.productName}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-[var(--pos-text-muted)]">
                      {formatCartVariantName(item)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      onRemove(
                        item.variantId
                      )
                    }
                    className="pos-ui-focus flex h-10 w-10 items-center justify-center rounded-[var(--pos-radius-sm)] text-rose-300 hover:bg-rose-300/[0.08]"
                    aria-label="Eliminar producto"
                  >
                    <PosIcon
                      name="close"
                      className="h-4 w-4"
                    />
                  </button>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="flex items-center rounded-[var(--pos-radius-sm)] bg-white/[0.04]">
                    <button
                      type="button"
                      onClick={() =>
                        onQuantityChange(
                          item.variantId,
                          item.quantity -
                            step
                        )
                      }
                      className="pos-ui-focus h-11 w-11 text-sm font-bold text-[var(--pos-text-secondary)]"
                    >
                      −
                    </button>

                    <input
                      type="number"
                      min={step}
                      step={step}
                      value={
                        item.quantity
                      }
                      onChange={(event) =>
                        onQuantityChange(
                          item.variantId,
                          Number(
                            event.target
                              .value
                          )
                        )
                      }
                      className="h-11 w-16 border-x border-[var(--pos-line-subtle)] bg-transparent text-center text-sm font-semibold text-[var(--pos-text-primary)] outline-none"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        onQuantityChange(
                          item.variantId,
                          item.quantity +
                            step
                        )
                      }
                      className="pos-ui-focus h-11 w-11 text-sm font-bold text-[var(--pos-primary)]"
                    >
                      +
                    </button>
                  </div>

                  <div className="text-right">
                    <p className="text-sm font-black text-white">
                      {formatMoney(
                        roundMoney(
                          item.price *
                            item.quantity
                        ),
                        currency
                      )}
                    </p>
                    <p className="mt-1 text-[10px] font-medium text-[var(--pos-text-muted)]">
                      {formatMoney(
                        item.price,
                        currency
                      )}{" "}
                      ×{" "}
                      {formatQuantity(
                        item.quantity
                      )}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex min-h-56 items-center justify-center rounded-[22px] border border-dashed border-white/[0.08] bg-white/[0.02] p-5 text-center">
            <div>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[16px] bg-cyan-300/[0.07] text-cyan-300">
                <PosIcon
                  name="sale"
                  className="h-5 w-5"
                />
              </div>
              <p className="mt-4 text-sm font-black text-white">
                Agrega productos
              </p>
              <p className="mt-2 text-xs font-medium leading-5 text-[var(--pos-text-muted)]">
                Escanea un código o selecciona una variante del catálogo.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-2.5 border-t border-[var(--pos-line-subtle)] pt-4">
        <TotalLine
          label="Subtotal"
          value={formatMoney(
            totals.subtotal,
            currency
          )}
        />
        <TotalLine
          label="Descuentos existentes"
          value={formatMoney(
            baseTotals.discount,
            currency
          )}
          muted
        />
        {loyaltyDiscount > 0 ? (
          <TotalLine
            label="Fidelización"
            value={`-${formatMoney(loyaltyDiscount, currency)}`}
            muted
          />
        ) : null}
        <TotalLine
          label="Impuestos"
          value={formatMoney(
            totals.tax,
            currency
          )}
          muted
        />

        <div className="mt-2 flex items-end justify-between gap-4 border-t border-[var(--pos-line)] pt-4">
          <p className="text-sm font-semibold text-[var(--pos-text-secondary)]">
            Total
          </p>
          <p className="text-[32px] font-bold tracking-[-0.055em] text-[var(--pos-text-primary)]">
            {formatMoney(
              totals.total,
              currency
            )}
          </p>
        </div>
      </div>

      <button
        type="button"
        disabled={cart.length === 0}
        onClick={onCharge}
        className="pos-ui-focus fixed bottom-[max(12px,env(safe-area-inset-bottom))] left-4 right-4 z-40 flex h-14 items-center justify-center rounded-[var(--pos-radius-md)] bg-[var(--pos-primary)] text-base font-bold text-slate-950 shadow-[var(--pos-shadow-overlay)] transition-colors hover:bg-[var(--pos-primary-hover)] disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 min-[1180px]:static min-[1180px]:mt-4 min-[1180px]:w-full min-[1180px]:shadow-none"
      >
        Cobrar{" "}
        {formatMoney(
          totals.total,
          currency
        )}
        <span className="ml-2 text-[9px] uppercase opacity-60">
          F9
        </span>
      </button>
    </aside>
  );
}


function CustomerPickerModal({
  customers,
  search,
  selectedCustomerId,
  brandSlug,
  onSearchChange,
  isCreatingCustomer,
  onCreateCustomer,
  onSelect,
  onUseGeneral,
  onClose,
}: {
  customers: PosCustomer[];
  search: string;
  selectedCustomerId: string;
  brandSlug: string;
  onSearchChange: (
    value: string
  ) => void;
  isCreatingCustomer: boolean;
  onCreateCustomer: (firstName: string, phone: string) => Promise<void>;
  onSelect: (
    customerId: string
  ) => void;
  onUseGeneral: () => void;
  onClose: () => void;
}) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [phone, setPhone] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  async function submitQuickCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!firstName.trim() || !phone.trim()) {
      setCreateError("Escribe nombre y teléfono.");
      return;
    }
    try {
      setCreateError(null);
      await onCreateCustomer(firstName.trim(), phone.trim());
    } catch (error) {
      setCreateError(getErrorMessage(error));
    }
  }

  return (
    <PosModal
      open
      onClose={onClose}
      size="medium"
      title="Identificar cliente"
      description="Asocia la venta con su historial y programa de fidelización."
    >
        <div>
          <label className="relative block">
            <PosIcon
              name="search"
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600"
            />

            <input
              autoFocus
              value={search}
              onChange={(event) =>
                onSearchChange(
                  event.target.value
                )
              }
              placeholder="Nombre, teléfono, correo o membresía"
              className="pos-ui-focus h-11 w-full rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] bg-[var(--pos-canvas)] pl-11 pr-4 text-sm text-[var(--pos-text-primary)] outline-none placeholder:text-[var(--pos-text-muted)]"
            />
          </label>
        </div>

        <div className="pos-ui-scrollbar mt-4 grid max-h-[52vh] gap-2 overflow-y-auto pr-1">
          <button
            type="button"
            onClick={onUseGeneral}
            className={`pos-ui-focus flex min-h-14 items-center gap-3 rounded-[var(--pos-radius-md)] p-3 text-left ${
              !selectedCustomerId
                ? "bg-[var(--pos-row-selected)]"
                : "bg-[var(--pos-canvas)]"
            }`}
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-cyan-300/[0.08] text-cyan-300">
              <PosIcon
                name="customer"
                className="h-5 w-5"
              />
            </div>

            <div>
              <p className="text-sm font-black text-white">
                Público general
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-600">
                No asociar esta venta con un cliente.
              </p>
            </div>
          </button>

          {customers.length > 0 ? (
            customers.map(
              (customer) => {
                const member =
                  normalizeMember(
                    customer.loyalty_member
                  );
                const active =
                  selectedCustomerId ===
                  customer.id;

                return (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() =>
                      onSelect(
                        customer.id
                      )
                    }
                    className={`pos-ui-focus flex min-h-14 items-center gap-3 rounded-[var(--pos-radius-md)] p-3 text-left transition-colors ${
                      active
                        ? "bg-[var(--pos-success-soft)]"
                        : "bg-[var(--pos-canvas)] hover:bg-white/[0.04]"
                    }`}
                  >
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] text-xs font-black ${
                        active
                          ? "bg-emerald-300 text-slate-950"
                          : "bg-white/[0.05] text-slate-300"
                      }`}
                    >
                      {getCustomerInitials(
                        customer
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-white">
                        {getCustomerName(
                          customer
                        )}
                      </p>
                      <p className="mt-1 truncate text-xs font-semibold text-slate-600">
                        {customer.phone ||
                          customer.email ||
                          "Sin contacto"}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-[8px] font-black uppercase tracking-[0.12em] text-slate-700">
                        Puntos
                      </p>
                      <p className="mt-1 text-sm font-black text-emerald-300">
                        {formatInteger(
                          member
                            ?.points_balance ||
                            0
                        )}
                      </p>
                    </div>
                  </button>
                );
              }
            )
          ) : (
            <div className="flex min-h-48 items-center justify-center rounded-[20px] border border-dashed border-white/[0.08] p-5 text-center">
              <div>
                <p className="text-sm font-black text-white">
                  No encontramos clientes
                </p>
                <p className="mt-2 text-xs font-semibold text-slate-600">
                  Puedes crearlo aquí sin abandonar la venta.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 border-t border-[var(--pos-line-subtle)] pt-4">
          {isCreateOpen ? (
            <form onSubmit={submitQuickCustomer} className="mb-3 grid gap-3 rounded-[var(--pos-radius-md)] bg-white/[0.035] p-4">
              <p className="text-sm font-semibold text-[var(--pos-text-primary)]">Crear cliente rápido</p>
              <input autoFocus value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="Nombre" maxLength={100} disabled={isCreatingCustomer} className="pos-ui-focus h-11 rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] bg-[var(--pos-canvas)] px-3 text-sm outline-none" />
              <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Teléfono" maxLength={40} disabled={isCreatingCustomer} className="pos-ui-focus h-11 rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] bg-[var(--pos-canvas)] px-3 text-sm outline-none" />
              {createError ? <p className="text-xs text-[var(--pos-danger)]">{createError}</p> : null}
              <div className="grid grid-cols-2 gap-2">
                <PosButton type="button" variant="secondary" disabled={isCreatingCustomer} onClick={() => setIsCreateOpen(false)}>Cancelar</PosButton>
                <PosButton type="submit" loading={isCreatingCustomer} disabled={isCreatingCustomer}>{isCreatingCustomer ? "Creando..." : "Crear y seleccionar"}</PosButton>
              </div>
            </form>
          ) : (
            <PosButton type="button" fullWidth onClick={() => setIsCreateOpen(true)}>Crear cliente</PosButton>
          )}
          <Link
            href={buildPosHref(
              brandSlug,
              "customers"
            )}
            className="pos-ui-focus flex h-11 w-full items-center justify-center rounded-[var(--pos-radius-sm)] bg-[var(--pos-primary-soft)] text-sm font-semibold text-[var(--pos-primary)]"
          >
            Abrir directorio de clientes
          </Link>
        </div>
    </PosModal>
  );
}

function PaymentModal({
  totals,
  currency,
  isSplitPayment,
  splitPayments,
  splitPaymentSummary,
  isAddingSplitPayment,
  method,
  tenderedAmount,
  reference,
  notes,
  changeDue,
  isCashTenderedShort,
  canCharge,
  isCharging,
  error,
  onBeginSplit,
  onReturnToSimple,
  onAddSplitPayment,
  onToggleAddSplitPayment,
  onSplitPaymentMethodChange,
  onSplitPaymentAmountChange,
  onSplitPaymentTenderedChange,
  onSplitPaymentReferenceChange,
  onRemoveSplitPayment,
  onMethodChange,
  onTenderedChange,
  onReferenceChange,
  onNotesChange,
  onClose,
  onComplete,
}: {
  totals: SaleTotals;
  currency: string;
  isSplitPayment: boolean;
  splitPayments: SplitPaymentLine[];
  splitPaymentSummary: SplitPaymentSummary;
  isAddingSplitPayment: boolean;
  method: PaymentMethod;
  tenderedAmount: string;
  reference: string;
  notes: string;
  changeDue: number;
  isCashTenderedShort: boolean;
  canCharge: boolean;
  isCharging: boolean;
  error: string | null;
  onBeginSplit: () => void;
  onReturnToSimple: () => void;
  onAddSplitPayment: (method: PaymentMethod) => void;
  onToggleAddSplitPayment: () => void;
  onSplitPaymentMethodChange: (
    paymentId: string,
    method: PaymentMethod
  ) => void;
  onSplitPaymentAmountChange: (
    paymentId: string,
    value: string
  ) => void;
  onSplitPaymentTenderedChange: (
    paymentId: string,
    value: string
  ) => void;
  onSplitPaymentReferenceChange: (
    paymentId: string,
    value: string
  ) => void;
  onRemoveSplitPayment: (paymentId: string) => void;
  onMethodChange: (
    method: PaymentMethod
  ) => void;
  onTenderedChange: (
    value: string
  ) => void;
  onReferenceChange: (
    value: string
  ) => void;
  onNotesChange: (
    value: string
  ) => void;
  onClose: () => void;
  onComplete: () => void;
}) {
  const quickCash =
    buildQuickCashOptions(
      totals.total
    );

  return (
    <PosModal
      open
      onClose={onClose}
      dismissible={!isCharging}
      size="medium"
      title={`Cobrar ${formatMoney(totals.total, currency)}`}
      description={`${totals.articleCount} artículos en la venta`}
    >
      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-[var(--pos-radius-sm)] bg-[var(--pos-danger-soft)] px-3 py-2 text-sm font-medium text-[var(--pos-danger)]"
        >
          {error}
        </p>
      ) : null}

      <fieldset disabled={isCharging} className="min-w-0">
        {isSplitPayment ? (
          <SplitPaymentComposer
            currency={currency}
            totalCents={moneyToCents(totals.total) || 0}
            payments={splitPayments}
            summary={splitPaymentSummary}
            isAddingPayment={isAddingSplitPayment}
            onReturnToSimple={onReturnToSimple}
            onAddPayment={onAddSplitPayment}
            onToggleAddPayment={onToggleAddSplitPayment}
            onMethodChange={onSplitPaymentMethodChange}
            onAmountChange={onSplitPaymentAmountChange}
            onTenderedChange={onSplitPaymentTenderedChange}
            onReferenceChange={onSplitPaymentReferenceChange}
            onRemove={onRemoveSplitPayment}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {PAYMENT_METHODS.map(
            (option) => {
              const active =
                method ===
                option.code;

              return (
                <button
                  key={option.code}
                  type="button"
                  onClick={() =>
                    onMethodChange(
                      option.code
                    )
                  }
                  className={`pos-ui-focus min-h-16 rounded-[var(--pos-radius-md)] p-3 text-left transition-colors ${
                    active
                      ? "bg-[var(--pos-row-selected)] text-[var(--pos-primary)]"
                      : "bg-[var(--pos-canvas)] text-[var(--pos-text-primary)]"
                  }`}
                >
                  <p
                    className={`text-sm font-black ${
                      active
                        ? "text-cyan-300"
                        : "text-white"
                    }`}
                  >
                    {option.label}
                  </p>
                  <p className="mt-1 hidden text-xs leading-5 text-[var(--pos-text-muted)] sm:block">
                    {option.description}
                  </p>
                </button>
              );
            }
          )}
        </div>

        <button
          type="button"
          onClick={onBeginSplit}
          className="pos-ui-focus mt-4 flex min-h-12 w-full items-center justify-center rounded-[var(--pos-radius-md)] border border-dashed border-[var(--pos-primary-line)] bg-[var(--pos-primary-soft)] px-4 text-sm font-semibold text-[var(--pos-primary)] hover:bg-[var(--pos-row-selected)]"
        >
          Dividir pago
        </button>

        {method === "cash" ? (
          <div className="mt-5 border-t border-[var(--pos-line-subtle)] pt-5">
            <NumberField
              label={`Efectivo recibido · ${currency}`}
              value={
                tenderedAmount
              }
              onChange={
                onTenderedChange
              }
              min="0"
              step="0.01"
              autoFocus
            />

            <div className="mt-3 flex flex-wrap gap-2">
              {quickCash.map(
                (amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() =>
                      onTenderedChange(
                        amount.toFixed(
                          2
                        )
                      )
                    }
                    className="pos-ui-focus h-10 rounded-[var(--pos-radius-sm)] bg-white/[0.05] px-3 text-xs font-semibold text-[var(--pos-text-secondary)] hover:bg-white/[0.08] hover:text-[var(--pos-text-primary)]"
                  >
                    {formatMoney(
                      amount,
                      currency
                    )}
                  </button>
                )
              )}
            </div>

            <div className="mt-4 flex items-end justify-between gap-4 rounded-[var(--pos-radius-md)] bg-[var(--pos-canvas)] p-4">
              <div>
                <p className="text-xs font-medium text-[var(--pos-text-muted)]">
                  Cambio
                </p>
                <p
                  className={`mt-1 text-[32px] font-bold tracking-[-0.05em] ${
                    changeDue > 0
                      ? "text-emerald-300"
                      : isCashTenderedShort
                      ? "text-rose-300"
                      : "text-[var(--pos-text-primary)]"
                  }`}
                >
                  {formatMoney(
                    changeDue,
                    currency
                  )}
                </p>
              </div>

              <p className="max-w-44 text-right text-xs leading-5 text-[var(--pos-text-muted)]">
                Solo el total de la venta contará como ingreso de caja.
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-6">
            <Field
              label="Referencia del pago"
              value={reference}
              onChange={
                onReferenceChange
              }
              placeholder="Folio, autorización o nota opcional"
            />
          </div>
        )}
          </>
        )}
      </fieldset>

        <fieldset disabled={isCharging} className="mt-5">
          <TextAreaField
            label="Notas de la venta"
            value={notes}
            onChange={onNotesChange}
            placeholder="Opcional"
          />
        </fieldset>

        <PosButton
          type="button"
          size="touch"
          fullWidth
          loading={isCharging}
          disabled={
            !canCharge ||
            isCharging
          }
          onClick={onComplete}
          className="mt-5 h-14 text-base"
        >
          {isCharging
            ? "Procesando venta..."
            : `Cobrar ${formatMoney(
                totals.total,
                currency
              )}`}
        </PosButton>
    </PosModal>
  );
}

function SplitPaymentComposer({
  currency,
  totalCents,
  payments,
  summary,
  isAddingPayment,
  onReturnToSimple,
  onAddPayment,
  onToggleAddPayment,
  onMethodChange,
  onAmountChange,
  onTenderedChange,
  onReferenceChange,
  onRemove,
}: {
  currency: string;
  totalCents: number;
  payments: SplitPaymentLine[];
  summary: SplitPaymentSummary;
  isAddingPayment: boolean;
  onReturnToSimple: () => void;
  onAddPayment: (method: PaymentMethod) => void;
  onToggleAddPayment: () => void;
  onMethodChange: (
    paymentId: string,
    method: PaymentMethod
  ) => void;
  onAmountChange: (
    paymentId: string,
    value: string
  ) => void;
  onTenderedChange: (
    paymentId: string,
    value: string
  ) => void;
  onReferenceChange: (
    paymentId: string,
    value: string
  ) => void;
  onRemove: (paymentId: string) => void;
}) {
  const canAddPayment =
    summary.pendingCents > 0 &&
    payments.length < 10;
  const pendingTone =
    summary.pendingCents === 0
      ? "text-emerald-300"
      : "text-amber-200";

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--pos-primary)]">
            Pago dividido
          </p>
          <p className="mt-1 text-sm text-[var(--pos-text-muted)]">
            Registra lo que paga con cada método hasta completar la venta.
          </p>
        </div>
        <button
          type="button"
          onClick={onReturnToSimple}
          className="pos-ui-focus min-h-11 rounded-[var(--pos-radius-sm)] px-3 text-xs font-semibold text-[var(--pos-text-secondary)] hover:bg-white/[0.05] hover:text-[var(--pos-text-primary)]"
        >
          Volver a pago simple
        </button>
      </div>

      <div className="mt-4 grid gap-2 rounded-[var(--pos-radius-md)] bg-[var(--pos-canvas)] p-3 sm:grid-cols-3 sm:p-4">
        <SplitPaymentMetric
          label="TOTAL"
          value={formatMoney(
            centsToMoney(totalCents),
            currency
          )}
        />
        <SplitPaymentMetric
          label="PAGADO"
          value={formatMoney(
            centsToMoney(summary.appliedCents),
            currency
          )}
        />
        <SplitPaymentMetric
          label="FALTA"
          value={formatMoney(
            centsToMoney(
              Math.max(summary.pendingCents, 0)
            ),
            currency
          )}
          tone={pendingTone}
          emphasis
        />
      </div>

      {payments.length === 0 ? (
        <div className="mt-5 rounded-[var(--pos-radius-md)] border border-dashed border-[var(--pos-line-strong)] bg-white/[0.025] p-4">
          <p className="text-sm font-semibold text-[var(--pos-text-primary)]">
            Elige el primer método de pago
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {PAYMENT_METHODS.map((option) => (
              <button
                key={option.code}
                type="button"
                onClick={() => onAddPayment(option.code)}
                className="pos-ui-focus min-h-14 rounded-[var(--pos-radius-sm)] bg-[var(--pos-panel-raised)] px-3 text-left text-sm font-semibold text-[var(--pos-text-primary)] hover:bg-[var(--pos-row-selected)]"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {payments.map((payment, index) => {
            const amountCents = moneyToCents(
              payment.amount
            );
            const tenderedCents = moneyToCents(
              payment.tenderedAmount
            );
            const isCash = payment.method === "cash";
            const changeCents =
              isCash &&
              amountCents !== null &&
              tenderedCents !== null
                ? Math.max(
                    tenderedCents - amountCents,
                    0
                  )
                : 0;
            const paymentMethodLabel =
              PAYMENT_METHODS.find(
                (option) => option.code === payment.method
              )?.label || "Otro";
            const remainingForThisPaymentCents = Math.max(
              totalCents -
                payments.reduce(
                  (total, item) =>
                    item.id === payment.id
                      ? total
                      : total +
                        Math.max(
                          moneyToCents(item.amount) || 0,
                          0
                        ),
                  0
                ),
              0
            );
            const cashIsShort =
              isCash &&
              amountCents !== null &&
              (tenderedCents === null ||
                tenderedCents < amountCents);

            return (
              <article
                key={payment.id}
                className="min-w-0 rounded-[var(--pos-radius-md)] border border-[var(--pos-line)] bg-[var(--pos-panel)] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="grid min-w-0 flex-1 gap-1.5">
                    <span className="text-[11px] font-medium text-[var(--pos-text-muted)]">
                      {paymentMethodLabel.toUpperCase()} · Pago {index + 1}
                    </span>
                    <select
                      value={payment.method}
                      onChange={(event) =>
                        onMethodChange(
                          payment.id,
                          event.target.value as PaymentMethod
                        )
                      }
                      className="pos-ui-focus h-11 rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] bg-[var(--pos-canvas)] px-3 text-sm font-semibold text-[var(--pos-text-primary)] outline-none"
                    >
                      {PAYMENT_METHODS.map((option) => (
                        <option
                          key={option.code}
                          value={option.code}
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={() => onRemove(payment.id)}
                    className="pos-ui-focus min-h-11 rounded-[var(--pos-radius-sm)] px-3 text-xs font-semibold text-[var(--pos-danger)] hover:bg-[var(--pos-danger-soft)]"
                    aria-label={`Eliminar ${PAYMENT_METHODS.find((option) => option.code === payment.method)?.label || "pago"}`}
                  >
                    Eliminar
                  </button>
                </div>

                <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="grid min-w-0 gap-2">
                    <SplitMoneyField
                      label={
                        isCash
                          ? `¿Cuánto pagará en efectivo? · ${currency}`
                          : `¿Cuánto pagará con ${paymentMethodLabel.toLowerCase()}? · ${currency}`
                      }
                      value={payment.amount}
                      onChange={(value) =>
                        onAmountChange(payment.id, value)
                      }
                      autoFocus={index === 0}
                    />

                    {isCash ? (
                      <button
                        type="button"
                        onClick={() =>
                          onAmountChange(
                            payment.id,
                            centsToMoneyInput(
                              remainingForThisPaymentCents
                            )
                          )
                        }
                        className="pos-ui-focus inline-flex min-h-9 items-center justify-self-start rounded-[var(--pos-radius-sm)] px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-primary)] hover:bg-[var(--pos-primary-soft)]"
                      >
                        Restante
                      </button>
                    ) : null}
                  </div>

                  {isCash ? (
                    <div className="grid min-w-0 gap-2">
                      <SplitMoneyField
                        label={`¿Con cuánto paga? · ${currency}`}
                        value={payment.tenderedAmount}
                        onChange={(value) =>
                          onTenderedChange(payment.id, value)
                        }
                      />

                      <button
                        type="button"
                        onClick={() =>
                          onTenderedChange(
                            payment.id,
                            centsToMoneyInput(
                              Math.max(amountCents || 0, 0)
                            )
                          )
                        }
                        className="pos-ui-focus inline-flex min-h-9 items-center justify-self-start rounded-[var(--pos-radius-sm)] px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-primary)] hover:bg-[var(--pos-primary-soft)]"
                      >
                        Exacto
                      </button>
                    </div>
                  ) : (
                    <div className="min-w-0 [&_input]:box-border [&_input]:max-w-full [&_input]:min-w-0 [&_input]:w-full [&_label]:min-w-0">
                      <Field
                        label="Referencia del pago"
                        value={payment.reference}
                        onChange={(value) =>
                          onReferenceChange(payment.id, value)
                        }
                        placeholder="Folio, autorización o nota opcional"
                      />
                    </div>
                  )}
                </div>

                {isCash ? (
                  <div className="mt-3 flex items-end justify-between gap-4 rounded-[var(--pos-radius-sm)] bg-[var(--pos-canvas)] p-3">
                    <div>
                      <p className="text-[11px] font-medium text-[var(--pos-text-muted)]">
                        Cambio
                      </p>
                      <p
                        className={`mt-1 text-xl font-bold tabular-nums ${
                          cashIsShort
                            ? "text-rose-300"
                            : changeCents > 0
                            ? "text-emerald-300"
                            : "text-[var(--pos-text-primary)]"
                        }`}
                      >
                        {formatMoney(
                          centsToMoney(changeCents),
                          currency
                        )}
                      </p>
                    </div>
                    <p className="max-w-52 text-right text-[11px] leading-5 text-[var(--pos-text-muted)]">
                      El cambio se calcula para este efectivo y no aumenta la venta.
                    </p>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {payments.length > 0 && canAddPayment ? (
        <div className="mt-4">
          {isAddingPayment ? (
            <div className="grid grid-cols-2 gap-2 rounded-[var(--pos-radius-md)] bg-[var(--pos-canvas)] p-3 sm:grid-cols-5">
              {PAYMENT_METHODS.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  onClick={() => onAddPayment(option.code)}
                  className="pos-ui-focus min-h-12 rounded-[var(--pos-radius-sm)] bg-[var(--pos-panel-raised)] px-3 text-sm font-semibold text-[var(--pos-text-primary)] hover:bg-[var(--pos-row-selected)]"
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={onToggleAddPayment}
              className="pos-ui-focus flex min-h-12 w-full items-center justify-center rounded-[var(--pos-radius-md)] border border-dashed border-[var(--pos-primary-line)] bg-[var(--pos-primary-soft)] px-4 text-sm font-semibold text-[var(--pos-primary)] hover:bg-[var(--pos-row-selected)]"
            >
              + Agregar método
            </button>
          )}
        </div>
      ) : null}

      {payments.length >= 10 ? (
        <p className="mt-3 text-xs font-medium text-[var(--pos-warning)]">
          Esta venta ya alcanzó el máximo de 10 componentes de pago.
        </p>
      ) : null}
    </div>
  );
}

function SplitPaymentMetric({
  label,
  value,
  tone = "text-[var(--pos-text-primary)]",
  emphasis = false,
}: {
  label: string;
  value: string;
  tone?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={
        emphasis
          ? "rounded-[var(--pos-radius-sm)] border border-[var(--pos-primary-line)] bg-[var(--pos-primary-soft)] px-3 py-2 sm:px-4"
          : "px-1 py-2"
      }
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--pos-text-muted)]">
        {label}
      </p>
      <p
        className={`mt-1 font-bold tracking-[-0.04em] tabular-nums ${
          emphasis ? "text-3xl" : "text-2xl"
        } ${tone}`}
      >
        {value}
      </p>
    </div>
  );
}

function SplitMoneyField({
  label,
  value,
  onChange,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <label className="grid min-w-0 w-full gap-2">
      <span className="text-xs font-medium text-[var(--pos-text-muted)]">
        {label}
      </span>

      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => {
          const rawValue = normalizeMoneyInput(event.target.value);

          if (rawValue !== null) {
            onChange(rawValue);
          }
        }}
        onBlur={() => {
          const cents = moneyToCents(value);

          if (cents !== null && value !== "") {
            onChange(centsToMoneyInput(cents));
          }
        }}
        pattern="[0-9]*[.,]?[0-9]{0,2}"
        className="pos-ui-focus box-border h-14 w-full min-w-0 max-w-full rounded-[var(--pos-radius-md)] border border-[var(--pos-line)] bg-[var(--pos-canvas)] px-4 text-2xl font-bold text-[var(--pos-text-primary)] outline-none"
      />
    </label>
  );
}

function SaleSuccessModal({
  sale,
  currency,
  customerName,
  onPrint,
  onClose,
}: {
  sale: SaleResult;
  currency: string;
  customerName: string | null;
  onPrint: () => void;
  onClose: () => void;
}) {
  return (
    <PosModal
      open
      onClose={onClose}
      size="small"
      title="Venta completada"
      description={sale.sale_number}
      dismissible={false}
    >
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--pos-success)] text-2xl font-bold text-slate-950">
          ✓
        </div>

        <h3 className="mt-4 text-[32px] font-bold tracking-[-0.055em] text-[var(--pos-text-primary)]">
          {formatMoney(
            sale.total,
            currency
          )}
        </h3>

        {customerName ? (
          <div
            className={`mt-4 rounded-[var(--pos-radius-md)] p-4 ${
              sale.points_redeemed > 0
                ? "bg-[var(--pos-success-soft)]"
                : "bg-white/[0.035] text-left"
            }`}
          >
            <p className={`text-xs font-medium ${sale.points_redeemed > 0 ? "text-[var(--pos-success)]" : "text-[var(--pos-text-muted)]"}`}>
              Cliente identificado
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--pos-text-primary)]">
              {customerName}
            </p>

            {sale.points_earned > 0 ? (
              <p className={`mt-2 text-xs ${sale.points_redeemed > 0 ? "font-semibold text-emerald-300" : "font-medium text-[var(--pos-text-secondary)]"}`}>
                +{formatInteger(
                  sale.points_earned
                )} puntos por esta compra
              </p>
            ) : null}
            {sale.tier_multiplier !== 1 ? (
              <p className="mt-1 text-xs font-medium text-[var(--pos-text-secondary)]">
                Multiplicador aplicado: {sale.tier_multiplier.toFixed(2)}x
              </p>
            ) : null}
            {sale.tier_promoted && sale.tier_after ? (
              <p className="mt-2 text-xs font-bold text-cyan-300">
                Nuevo nivel: {sale.tier_after.name}
              </p>
            ) : null}
            {sale.points_redeemed > 0 ? (
              <p className="mt-2 text-xs font-bold text-cyan-300">
                -{formatInteger(sale.points_redeemed)} puntos utilizados · {formatMoney(sale.loyalty_discount, currency)} de descuento
              </p>
            ) : null}
            {sale.reward_source === "visits" && sale.loyalty_discount > 0 ? (
              <p className="mt-2 text-xs font-bold text-cyan-300">
                Recompensa por visitas aplicada · {formatMoney(sale.loyalty_discount, currency)} de descuento
              </p>
            ) : null}
            {sale.visits_earned === 1 ? (
              <p className="mt-2 text-xs font-semibold text-emerald-300">Esta compra sumó una visita.</p>
            ) : sale.visits_earned > 1 ? (
              <p className="mt-2 text-xs font-semibold text-emerald-300">Esta compra avanzó en {sale.visits_earned} programas de fidelización.</p>
            ) : null}
            {sale.loyalty_balance !== null ? (
              <p className={`mt-2 text-xs ${sale.points_redeemed > 0 ? "font-semibold text-white" : "font-medium text-[var(--pos-text-secondary)]"}`}>
                Saldo final: {formatInteger(sale.loyalty_balance)} puntos
              </p>
            ) : null}
          </div>
        ) : null}

        {sale.visit_unlocks_created.length > 0 ? (
          <div className="mt-4 rounded-[var(--pos-radius-md)] border border-cyan-300/20 bg-cyan-300/[0.07] p-4 text-left">
            <p className="text-sm font-bold text-cyan-200">¡Nueva recompensa desbloqueada!</p>
            <div className="mt-2 space-y-1.5">
              {sale.visit_unlocks_created.map((unlock) => (
                <p key={unlock.id} className="text-xs font-medium text-[var(--pos-text-secondary)]">
                  Completaste {unlock.visitProgramName} y desbloqueaste {unlock.rewardName}.
                </p>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-2 text-left">
          <SuccessMetric
            label="Monto aplicado"
            value={formatMoney(
              sale.payment_applied,
              currency
            )}
          />
          <SuccessMetric
            label="Recibido"
            value={formatMoney(
              sale.payment_received,
              currency
            )}
          />
          <SuccessMetric
            label="Cambio"
            value={formatMoney(
              sale.change_due,
              currency
            )}
            accent
          />
          <SuccessMetric
            label="Impuestos"
            value={formatMoney(
              sale.tax_total,
              currency
            )}
          />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <PosButton type="button" size="touch" variant="secondary" fullWidth onClick={onPrint} className="h-14 text-base">
            Imprimir ticket
          </PosButton>
          <PosButton type="button" size="touch" fullWidth onClick={onClose} className="h-14 text-base">
            Nueva venta
          </PosButton>
        </div>
      </div>
    </PosModal>
  );
}

function NoOpenSession({
  brandSlug,
}: {
  brandSlug: string;
}) {
  return (
    <PosPage width="narrow">
      <PosCard className="py-10 text-center md:py-14">
      <div className="max-w-xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[var(--pos-radius-md)] bg-[var(--pos-warning-soft)] text-[var(--pos-warning)]">
          <PosIcon
            name="cash"
            className="h-10 w-10"
          />
        </div>

        <p className="mt-5 text-xs font-semibold text-[var(--pos-warning)]">
          Terminal bloqueada
        </p>

        <h2 className="mt-2 text-2xl font-bold tracking-[-0.035em] text-[var(--pos-text-primary)]">
          Primero abre una caja.
        </h2>

        <p className="mt-3 text-sm leading-6 text-[var(--pos-text-muted)]">
          Cada venta de mostrador necesita una sesión abierta para registrar
          pagos, responsable y efectivo esperado correctamente.
        </p>

        <Link
          href={buildPosHref(
            brandSlug,
            "cash"
          )}
          className="pos-ui-focus mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-[var(--pos-radius-md)] bg-[var(--pos-warning)] px-6 text-sm font-semibold text-slate-950"
        >
          <PosIcon
            name="cash"
            className="h-5 w-5"
          />
          Abrir caja
        </Link>
      </div>
      </PosCard>
    </PosPage>
  );
}

function EmptyCatalog({
  brandSlug,
  hasProducts,
  hasSearch,
}: {
  brandSlug: string;
  hasProducts: boolean;
  hasSearch: boolean;
}) {
  return (
    <div className="mt-4 flex min-h-60 items-center justify-center rounded-[var(--pos-radius-md)] border border-dashed border-[var(--pos-line)] bg-[var(--pos-canvas)] p-5 text-center">
      <div className="max-w-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[var(--pos-radius-sm)] bg-[var(--pos-primary-soft)] text-[var(--pos-primary)]">
          <PosIcon
            name="product"
            className="h-7 w-7"
          />
        </div>

        <h4 className="mt-4 text-base font-bold text-[var(--pos-text-primary)]">
          {hasSearch
            ? "No encontramos coincidencias"
            : hasProducts
            ? "No hay variantes vendibles"
            : "El catálogo está vacío"}
        </h4>

        <p className="mt-2 text-sm leading-6 text-[var(--pos-text-muted)]">
          {hasSearch
            ? "Cambia la búsqueda o selecciona otra categoría."
            : "Configura productos, precios e inventario para vender."}
        </p>

        {!hasSearch ? (
          <Link
            href={buildPosHref(
              brandSlug,
              "products"
            )}
            className="mt-5 inline-flex h-12 items-center justify-center rounded-[15px] bg-cyan-300 px-6 text-sm font-black text-slate-950"
          >
            Abrir Productos
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function TotalLine({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <p
        className={`text-xs font-medium ${
          muted
            ? "text-[var(--pos-text-muted)]"
            : "text-[var(--pos-text-secondary)]"
        }`}
      >
        {label}
      </p>

      <p
        className={`text-sm font-semibold ${
          muted
            ? "text-[var(--pos-text-secondary)]"
            : "text-[var(--pos-text-primary)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function SuccessMetric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-[var(--pos-radius-sm)] bg-white/[0.035] p-3">
      <p className="text-[11px] font-medium text-[var(--pos-text-muted)]">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-semibold ${
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

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  options: [string, string][];
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-medium text-[var(--pos-text-muted)]">
        {label}
      </span>

      <select
        value={value}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
        className="pos-ui-focus h-11 rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] bg-[var(--pos-canvas)] px-3 text-sm font-medium text-[var(--pos-text-primary)] outline-none"
      >
        {options.map(
          ([
            optionValue,
            optionLabel,
          ]) => (
            <option
              key={optionValue}
              value={optionValue}
            >
              {optionLabel}
            </option>
          )
        )}
      </select>
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-medium text-[var(--pos-text-muted)]">
        {label}
      </span>

      <input
        value={value}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
        placeholder={placeholder}
        className="pos-ui-focus h-11 rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] bg-[var(--pos-canvas)] px-3 text-sm font-medium text-[var(--pos-text-primary)] outline-none placeholder:text-[var(--pos-text-muted)]"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  step,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  min?: string;
  step?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-medium text-[var(--pos-text-muted)]">
        {label}
      </span>

      <input
        type="number"
        autoFocus={autoFocus}
        min={min}
        step={step}
        value={value}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
        className="pos-ui-focus h-14 rounded-[var(--pos-radius-md)] border border-[var(--pos-line)] bg-[var(--pos-canvas)] px-4 text-2xl font-bold text-[var(--pos-text-primary)] outline-none"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-medium text-[var(--pos-text-muted)]">
        {label}
      </span>

      <textarea
        rows={3}
        value={value}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
        placeholder={placeholder}
        className="pos-ui-focus rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] bg-[var(--pos-canvas)] px-3 py-3 text-sm text-[var(--pos-text-primary)] outline-none placeholder:text-[var(--pos-text-muted)]"
      />
    </label>
  );
}

function FeedbackBanner({
  error,
  notice,
}: {
  error: string | null;
  notice: string | null;
}) {
  if (!error && !notice) {
    return null;
  }

  return (
    <div
      className={`rounded-[20px] border px-5 py-4 text-sm font-bold ${
        error
          ? "border-rose-300/20 bg-rose-300/[0.08] text-rose-200"
          : "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-200"
      }`}
    >
      {error || notice}
    </div>
  );
}

function buildSellableVariants({
  products,
  locationId,
}: {
  products: Product[];
  locationId: string;
}): SellableVariant[] {
  return products
    .filter(
      (product) =>
        product.active &&
        product.sellable
    )
    .flatMap((product) =>
      (product.variants || [])
        .filter(
          (variant) =>
            variant.active
        )
        .map((variant) => {
          const inventoryRecord =
            (
              variant.inventory || []
            ).find(
              (record) =>
                record.location_id ===
                locationId
            );

          const inventoryTracked =
            product.inventory_mode ===
              "direct" &&
            product.track_inventory;

          const availableStock =
            inventoryTracked
              ? Number(
                  inventoryRecord
                    ?.available_quantity ||
                    (
                      Number(
                        inventoryRecord
                          ?.quantity || 0
                      ) -
                      Number(
                        inventoryRecord
                          ?.reserved_quantity ||
                          0
                      )
                    )
                )
              : Number.POSITIVE_INFINITY;

          return {
            productId: product.id,
            productName:
              product.name,
            productCode:
              product.product_code || null,
            productDescription:
              product.description,
            productImageUrl:
              product.image_url,
            productType:
              product.product_type,
            inventoryMode:
              product.inventory_mode,
            taxRate: Number(
              product.tax_rate || 0
            ),
            categoryId:
              product.category?.id ||
              null,
            categoryName:
              product.category?.name ||
              "Sin categoría",
            variantId:
              variant.id,
            variantName:
              variant.name,
            variantImageUrl:
              variant.image_url,
            sku: variant.sku,
            barcode:
              variant.barcode,
            price: Number(
              variant.price || 0
            ),
            unitCode:
              variant.unit_code,
            attributes:
              variant.attributes || {},
            availableStock,
            inventoryTracked,
          };
        })
    )
    .sort((left, right) => {
      const byProduct =
        left.productName.localeCompare(
          right.productName,
          "es"
        );

      if (byProduct !== 0) {
        return byProduct;
      }

      return left.variantName.localeCompare(
        right.variantName,
        "es"
      );
    });
}

function calculateSaleTotals({
  cart,
  pricesIncludeTax,
}: {
  cart: CartItem[];
  pricesIncludeTax: boolean;
}): SaleTotals {
  let subtotal = 0;
  let discount = 0;
  let tax = 0;
  let total = 0;
  let articleCount = 0;

  for (const item of cart) {
    const lineSubtotal =
      roundMoney(
        item.price *
          item.quantity
      );

    const lineDiscount =
      roundMoney(
        Math.max(
          item.discountAmount,
          0
        )
      );

    const taxableBase =
      roundMoney(
        lineSubtotal -
          lineDiscount
      );

    const lineTax =
      pricesIncludeTax
        ? item.taxRate > 0
          ? roundMoney(
              taxableBase -
                taxableBase /
                  (
                    1 +
                    item.taxRate /
                      100
                  )
            )
          : 0
        : roundMoney(
            taxableBase *
              item.taxRate /
              100
          );

    const lineTotal =
      pricesIncludeTax
        ? taxableBase
        : roundMoney(
            taxableBase +
              lineTax
          );

    subtotal =
      roundMoney(
        subtotal +
          lineSubtotal
      );

    discount =
      roundMoney(
        discount +
          lineDiscount
      );

    tax =
      roundMoney(
        tax +
          lineTax
      );

    total =
      roundMoney(
        total +
          lineTotal
      );

    articleCount +=
      item.quantity;
  }

  return {
    subtotal,
    discount,
    tax,
    total,
    articleCount,
  };
}

function buildQuickCashOptions(
  total: number
) {
  const options = new Set<number>();

  options.add(
    roundMoney(total)
  );

  for (const increment of [
    10,
    20,
    50,
    100,
    200,
    500,
    1000,
  ]) {
    const rounded =
      Math.ceil(
        total / increment
      ) * increment;

    if (rounded >= total) {
      options.add(
        roundMoney(rounded)
      );
    }
  }

  return Array.from(options)
    .sort(
      (left, right) =>
        left - right
    )
    .slice(0, 6);
}


function normalizeMember(
  value:
    | LoyaltyMember
    | LoyaltyMember[]
    | null
    | undefined
) {
  if (Array.isArray(value)) {
    return value[0] || null;
  }

  return value || null;
}

function getCustomerName(
  customer: Pick<
    PosCustomer,
    "first_name" | "last_name"
  >
) {
  return [
    customer.first_name,
    customer.last_name,
  ]
    .filter(Boolean)
    .join(" ");
}

function getCustomerInitials(
  customer: Pick<
    PosCustomer,
    "first_name" | "last_name"
  >
) {
  const first =
    customer.first_name
      ?.trim()
      .charAt(0) || "C";

  const last =
    customer.last_name
      ?.trim()
      .charAt(0) || "";

  return `${first}${last}`.toUpperCase();
}

function formatInteger(
  value: number
) {
  return new Intl.NumberFormat(
    "es-MX",
    {
      maximumFractionDigits: 0,
    }
  ).format(Number(value || 0));
}

function normalizeSaleResult(
  sale: SaleResult,
  paymentSummary: SaleResponse["paymentSummary"]
): SaleResult {
  return {
    ...sale,
    subtotal: Number(
      sale.subtotal || 0
    ),
    discount_total: Number(
      sale.discount_total || 0
    ),
    tax_total: Number(
      sale.tax_total || 0
    ),
    total: Number(
      sale.total || 0
    ),
    payment_applied: Number(
      sale.payment_applied ??
        paymentSummary.appliedTotal ??
        sale.total ??
        0
    ),
    payment_received: Number(
      sale.payment_received ??
        paymentSummary.tenderedTotal ??
        sale.total ??
        0
    ),
    change_due: Number(
      sale.change_due ??
        paymentSummary.expectedChange ??
        0
    ),
    points_earned: Number(
      sale.points_earned || 0
    ),
    points_redeemed: Number(
      sale.points_redeemed || 0
    ),
    loyalty_discount: Number(
      sale.loyalty_discount || 0
    ),
    redemption_id:
      sale.redemption_id || null,
    reward_id:
      sale.reward_id || null,
    loyalty_balance:
      sale.loyalty_balance === null ||
      sale.loyalty_balance === undefined
        ? null
        : Number(sale.loyalty_balance),
    idempotent_replay: Boolean(
      sale.idempotent_replay
    ),
    base_points: Number(sale.base_points || 0),
    tier_multiplier: Number(sale.tier_multiplier || 1),
    tier_before: sale.tier_before || null,
    tier_after: sale.tier_after || null,
    tier_promoted: Boolean(sale.tier_promoted),
    reward_source: sale.reward_source || null,
    reward_unlock_id: sale.reward_unlock_id || null,
    visits_earned: Number(sale.visits_earned || 0),
    visit_progress: Array.isArray(sale.visit_progress) ? sale.visit_progress : [],
    visit_unlocks_created: Array.isArray(sale.visit_unlocks_created) ? sale.visit_unlocks_created : [],
  };
}

function normalizeQuantity(
  value: number,
  precision: number
) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor =
    Math.pow(
      10,
      Math.max(
        0,
        precision
      )
    );

  return (
    Math.round(
      (
        value +
        Number.EPSILON
      ) * factor
    ) / factor
  );
}

function formatAttributes(
  attributes: Record<
    string,
    unknown
  >
) {
  const values =
    Object.values(
      attributes || {}
    )
      .map((value) =>
        String(
          value || ""
        ).trim()
      )
      .filter(Boolean);

  return values.length > 0
    ? values.join(" · ")
    : "Presentación única";
}

function formatCartVariantName(variant: SellableVariant) {
  const values = Object.values(variant.attributes || {})
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (values.length > 1) {
    const generatedName = variant.variantName.trim();
    if (
      generatedName &&
      generatedName !== "Única" &&
      (generatedName.includes("/") || generatedName.includes("·"))
    ) {
      return generatedName.replace(/\s*\/\s*/g, " · ");
    }
    return values.join(" · ");
  }
  return variant.variantName || values[0] || "Presentación única";
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

function roundMoney(
  value: number
) {
  return (
    Math.round(
      (
        Number(value || 0) +
        Number.EPSILON
      ) * 100
    ) / 100
  );
}

function moneyToCents(
  value: string | number
) {
  const source =
    typeof value === "number"
      ? value.toFixed(2)
      : value.trim();

  if (!/^\d+(?:\.\d{0,2})?$/.test(source)) {
    return null;
  }

  const [whole, fraction = ""] = source.split(".");
  const wholeCents = Number(whole) * 100;
  const fractionCents = Number(
    fraction.padEnd(2, "0")
  );
  const cents = wholeCents + fractionCents;

  return Number.isSafeInteger(cents)
    ? cents
    : null;
}

function normalizeMoneyInput(value: string) {
  const normalized = value.replace(",", ".");

  if (normalized === "") return "";

  return /^\d+(?:\.\d{0,2})?$/.test(normalized)
    ? normalized
    : null;
}

function centsToMoney(
  cents: number
) {
  return cents / 100;
}

function centsToMoneyInput(
  cents: number
) {
  const normalized = Math.max(
    Math.round(cents),
    0
  );

  return `${Math.floor(normalized / 100)}.${String(
    normalized % 100
  ).padStart(2, "0")}`;
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
