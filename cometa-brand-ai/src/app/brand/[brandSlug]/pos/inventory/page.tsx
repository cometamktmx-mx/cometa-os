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
  PosBadge,
  PosButton,
  PosCard,
  PosDataTable,
  PosPage,
  PosPageHeader,
  PosSection,
} from "../../components/pos-ui";

type QuantityMode =
  | "direct"
  | "fixed_package"
  | "variable_quantity";

type Location = {
  id: string;
  name: string;
  code: string;
  currency: string;
};

type BootstrapResponse = {
  ok: true;
  locations: Location[];
  branding: {
    display_name: string;
    primary_color: string;
    accent_color: string;
  };
};

type UnitOption = {
  code: string;
  name: string;
  symbol: string;
  unit_type: string;
  decimal_precision: number;
};

type ProductConfigResponse = {
  ok: true;
  units: UnitOption[];
};

type CatalogVariant = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit_code: string;
  active: boolean;
  image_url: string | null;
  inventory: Array<{
    location_id: string;
    quantity: number;
    reserved_quantity: number;
    minimum_quantity: number;
    available_quantity: number;
  }>;
};

type CatalogProduct = {
  id: string;
  name: string;
  inventory_mode: string;
  track_inventory: boolean;
  active: boolean;
  image_url: string | null;
  variants: CatalogVariant[];
};

type ProductsResponse = {
  ok: true;
  products: CatalogProduct[];
};

type ReceivingOption = {
  key: string;
  presentationId: string | null;
  name: string;
  source:
    | "saved_presentation"
    | "unit_conversion";
  quantityMode: QuantityMode;
  inputUnitCode: string;
  inputUnitName: string;
  inputUnitSymbol: string;
  baseUnitCode: string;
  baseUnitName: string;
  baseUnitSymbol: string;
  conversionFactor: number;
  defaultInputQuantity: number;
  allowFraction: boolean;
  promptLabel: string;
  example: string;
  matched: boolean;
};

type ReceivingVariant = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: number;
  cost: number;
  attributes: Record<string, unknown>;
  unit_code: string;
  image_url: string | null;
  product: {
    id: string;
    name: string;
    description: string | null;
    product_type: string;
    inventory_mode: string;
    image_url: string | null;
    category?: {
      id: string;
      name: string;
    } | null;
  };
  selectedLocationStock: {
    quantity: number;
    reserved: number;
    available: number;
    minimum: number;
  } | null;
  stock: {
    quantity: number;
    reserved: number;
    available: number;
  };
};

type ReceivingScanFound = {
  ok: true;
  found: true;
  code: string;
  source:
    | "purchase_presentation"
    | "variant";
  matchType: string;
  canReceive: boolean;
  reason?: string;
  variant: ReceivingVariant;
  matchedPresentation: {
    id: string;
    name: string;
  } | null;
  receivingOptions: ReceivingOption[];
  defaultOptionKey: string | null;
};

type ReceivingScanNotFound = {
  ok: true;
  found: false;
  code: string;
  canCreateProduct: boolean;
  suggestedField: "sku" | "barcode";
  prefill: {
    sku: string | null;
    barcode: string | null;
  };
};

type ReceivingScanResponse =
  | ReceivingScanFound
  | ReceivingScanNotFound;

type ReceiptItem = {
  id: string;
  variant_id: string;
  scanned_code: string | null;
  quantity_mode: QuantityMode;
  input_quantity: number;
  input_unit_code: string;
  conversion_factor: number;
  base_quantity: number;
  base_unit_code: string;
  total_cost: number;
  base_unit_cost: number;
  quantity_before: number;
  quantity_after: number;
  variant?: {
    id: string;
    name: string;
    sku: string | null;
    barcode: string | null;
    product?: {
      id: string;
      name: string;
      image_url: string | null;
    } | null;
  } | null;
};

type Receipt = {
  id: string;
  receipt_number: string;
  status: string;
  supplier_name: string | null;
  supplier_reference: string | null;
  received_at: string;
  total_base_quantity: number;
  total_cost: number;
  notes: string | null;
  location?: {
    id: string;
    name: string;
    code: string;
  } | null;
  items: ReceiptItem[];
};

type HistoryResponse = {
  ok: true;
  receipts: Receipt[];
};

type QueueItem = {
  localId: string;
  variantId: string;
  purchasePresentationId: string | null;
  scannedCode: string;
  quantityMode: QuantityMode;
  inputQuantity: number;
  inputUnitCode: string;
  inputUnitSymbol: string;
  conversionFactor: number;
  baseQuantity: number;
  baseUnitCode: string;
  baseUnitSymbol: string;
  totalCost: number;
  productName: string;
  variantName: string;
  optionName: string;
};

type PresentationDraft = {
  name: string;
  barcode: string;
  supplierSku: string;
  quantityMode: QuantityMode;
  inputUnitCode: string;
  baseUnitCode: string;
  conversionFactor: string;
  defaultInputQuantity: string;
  promptLabel: string;
  allowFraction: boolean;
};

type CompleteReceiptResponse = {
  ok: true;
  receipt: {
    receipt: {
      id: string;
      receipt_number: string;
      total_base_quantity: number;
      total_cost: number;
    };
    items: unknown[];
  };
};

type InventoryStockRow = {
  id: string;
  productName: string;
  productImageUrl: string | null;
  variantName: string;
  variantImageUrl: string | null;
  sku: string | null;
  barcode: string | null;
  unitCode: string;
  quantity: number;
  reserved: number;
  available: number;
  minimum: number;
};

export default function PosInventoryPage() {
  const { brand } = usePosContext();

  const [locations, setLocations] = useState<
    Location[]
  >([]);
  const [units, setUnits] = useState<
    UnitOption[]
  >([]);
  const [catalog, setCatalog] = useState<
    CatalogProduct[]
  >([]);
  const [history, setHistory] = useState<
    Receipt[]
  >([]);

  const [
    selectedLocationId,
    setSelectedLocationId,
  ] = useState("");

  const [scanCode, setScanCode] = useState("");
  const [stockSearch, setStockSearch] = useState("");
  const [scanResult, setScanResult] =
    useState<ReceivingScanResponse | null>(
      null
    );
  const [
    selectedOptionKey,
    setSelectedOptionKey,
  ] = useState("");
  const [inputQuantity, setInputQuantity] =
    useState("1");
  const [lineTotalCost, setLineTotalCost] =
    useState("");

  const [queue, setQueue] = useState<
    QueueItem[]
  >([]);
  const receiptIdempotencyKeyRef =
    useRef<string | null>(null);

  const [supplierName, setSupplierName] =
    useState("");
  const [
    supplierReference,
    setSupplierReference,
  ] = useState("");
  const [notes, setNotes] = useState("");

  const [
    associationSearch,
    setAssociationSearch,
  ] = useState("");
  const [
    selectedAssociationVariantId,
    setSelectedAssociationVariantId,
  ] = useState("");

  const [
    presentationDraft,
    setPresentationDraft,
  ] = useState<PresentationDraft>({
    name: "",
    barcode: "",
    supplierSku: "",
    quantityMode: "fixed_package",
    inputUnitCode: "package",
    baseUnitCode: "piece",
    conversionFactor: "1",
    defaultInputQuantity: "1",
    promptLabel: "",
    allowFraction: false,
  });

  const [isLoading, setIsLoading] =
    useState(true);
  const [isScanning, setIsScanning] =
    useState(false);
  const [
    isCompletingReceipt,
    setIsCompletingReceipt,
  ] = useState(false);
  const [
    isSavingPresentation,
    setIsSavingPresentation,
  ] = useState(false);

  const [error, setError] = useState<
    string | null
  >(null);
  const [notice, setNotice] = useState<
    string | null
  >(null);

  const scanInputRef =
    useRef<HTMLInputElement>(null);

  const selectedLocation = locations.find(
    (location) =>
      location.id === selectedLocationId
  );

  const currency =
    selectedLocation?.currency || "MXN";

  const loadInitialData =
    useCallback(async () => {
      try {
        setIsLoading(true);
        setError(null);

        const [
          bootstrap,
          productConfig,
          products,
          receiptHistory,
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
            )}&pageSize=200&active=true`
          ),
          apiRequest<HistoryResponse>(
            `/api/pos/inventory-receiving?brandSlug=${encodeURIComponent(
              brand.slug
            )}&mode=history`
          ),
        ]);

        setLocations(
          bootstrap.locations || []
        );
        setUnits(
          productConfig.units || []
        );
        setCatalog(
          products.products || []
        );
        setHistory(
          receiptHistory.receipts || []
        );

        setSelectedLocationId(
          (current) =>
            current ||
            bootstrap.locations?.[0]?.id ||
            ""
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
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    function focusScanner(
      event: KeyboardEvent
    ) {
      if (event.key !== "F2") return;

      event.preventDefault();
      scanInputRef.current?.focus();
      scanInputRef.current?.select();
    }

    window.addEventListener(
      "keydown",
      focusScanner
    );

    return () => {
      window.removeEventListener(
        "keydown",
        focusScanner
      );
    };
  }, []);

  const directInventoryVariants =
    useMemo(() => {
      const rows = catalog
        .filter(
          (product) =>
            product.active &&
            product.track_inventory &&
            product.inventory_mode ===
              "direct"
        )
        .flatMap((product) =>
          (product.variants || [])
            .filter(
              (variant) => variant.active
            )
            .map((variant) => ({
              ...variant,
              productId: product.id,
              productName: product.name,
            }))
        );

      const query =
        associationSearch
          .trim()
          .toLowerCase();

      if (!query) return rows;

      return rows.filter((row) =>
        [
          row.productName,
          row.name,
          row.sku || "",
          row.barcode || "",
        ].some((value) =>
          value
            .toLowerCase()
            .includes(query)
        )
      );
    }, [catalog, associationSearch]);

  const allStockRows = useMemo(() => {
    return catalog
      .filter(
        (product) =>
          product.active &&
          product.track_inventory &&
          product.inventory_mode === "direct"
      )
      .flatMap((product) =>
        (product.variants || [])
          .filter((variant) => variant.active)
          .map((variant) => {
            const inventory = (variant.inventory || []).find(
              (record) => record.location_id === selectedLocationId
            );
            const quantity = Number(inventory?.quantity || 0);
            const reserved = Number(inventory?.reserved_quantity || 0);
            const available = Number(
              inventory?.available_quantity ?? quantity - reserved
            );
            const minimum = Number(inventory?.minimum_quantity || 0);

            return {
              id: variant.id,
              productName: product.name,
              productImageUrl: product.image_url,
              variantName: variant.name,
              variantImageUrl: variant.image_url,
              sku: variant.sku,
              barcode: variant.barcode,
              unitCode: variant.unit_code,
              quantity,
              reserved,
              available,
              minimum,
            };
          })
      );
  }, [catalog, selectedLocationId]);

  const stockRows = useMemo(() => {
    const query = stockSearch.trim().toLowerCase();

    if (!query) return allStockRows;

    return allStockRows.filter((row) =>
      [
        row.productName,
        row.variantName,
        row.sku || "",
        row.barcode || "",
      ].some((value) => value.toLowerCase().includes(query))
    );
  }, [allStockRows, stockSearch]);

  const inventoryMetrics = useMemo(() => {
    const available = allStockRows.reduce(
      (total, row) => total + row.available,
      0
    );
    const stocked = allStockRows.filter((row) => row.available > 0).length;
    const low = allStockRows.filter(
      (row) => row.available > 0 && row.minimum > 0 && row.available <= row.minimum
    ).length;
    const out = allStockRows.filter((row) => row.available <= 0).length;

    return { available, stocked, low, out };
  }, [allStockRows]);

  const selectedAssociationVariant =
    useMemo(
      () =>
        directInventoryVariants.find(
          (variant) =>
            variant.id ===
            selectedAssociationVariantId
        ) || null,
      [
        directInventoryVariants,
        selectedAssociationVariantId,
      ]
    );

  const selectedOption =
    useMemo(() => {
      if (
        !scanResult ||
        !scanResult.found ||
        !scanResult.canReceive
      ) {
        return null;
      }

      return (
        scanResult.receivingOptions.find(
          (option) =>
            option.key ===
            selectedOptionKey
        ) || null
      );
    }, [
      scanResult,
      selectedOptionKey,
    ]);

  const calculatedBaseQuantity =
    useMemo(() => {
      if (!selectedOption) return 0;

      return (
        Number(inputQuantity || 0) *
        Number(
          selectedOption.conversionFactor ||
            0
        )
      );
    }, [
      inputQuantity,
      selectedOption,
    ]);

  const queueTotalCost = useMemo(
    () =>
      queue.reduce(
        (total, item) =>
          total + item.totalCost,
        0
      ),
    [queue]
  );

  const queueTotalBaseQuantity =
    useMemo(
      () =>
        queue.reduce(
          (total, item) =>
            total + item.baseQuantity,
          0
        ),
      [queue]
    );

  async function runScan(
    rawCode?: string
  ) {
    const normalizedCode = (
      rawCode ?? scanCode
    ).trim();

    if (!selectedLocationId) {
      setError(
        "Primero selecciona una sucursal."
      );
      return;
    }

    if (!normalizedCode) {
      setError(
        "Escanea o escribe un código."
      );
      scanInputRef.current?.focus();
      return;
    }

    try {
      setIsScanning(true);
      setError(null);
      setNotice(null);
      setScanResult(null);

      const result =
        await apiRequest<ReceivingScanResponse>(
          `/api/pos/inventory-receiving?brandSlug=${encodeURIComponent(
            brand.slug
          )}&locationId=${encodeURIComponent(
            selectedLocationId
          )}&code=${encodeURIComponent(
            normalizedCode
          )}`
        );

      setScanResult(result);

      if (result.found) {
        const defaultKey =
          result.defaultOptionKey ||
          result.receivingOptions?.[0]
            ?.key ||
          "";

        setSelectedOptionKey(
          defaultKey
        );

        const defaultOption =
          result.receivingOptions.find(
            (option) =>
              option.key === defaultKey
          );

        setInputQuantity(
          String(
            defaultOption
              ?.defaultInputQuantity ?? 1
          )
        );
        setLineTotalCost("");
      } else {
        preparePresentationAssociation(
          result
        );
      }

      setScanCode("");
    } catch (scanError) {
      setError(
        getErrorMessage(scanError)
      );
    } finally {
      setIsScanning(false);
    }
  }

  function handleScanSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    runScan();
  }

  function preparePresentationAssociation(
    result: ReceivingScanNotFound
  ) {
    setAssociationSearch("");
    setSelectedAssociationVariantId(
      ""
    );

    setPresentationDraft((current) => ({
      ...current,
      name: "",
      barcode:
        result.suggestedField ===
        "barcode"
          ? result.code
          : "",
      supplierSku:
        result.suggestedField ===
        "sku"
          ? result.code
          : "",
      quantityMode:
        "fixed_package",
      inputUnitCode: "package",
      baseUnitCode: "piece",
      conversionFactor: "1",
      defaultInputQuantity: "1",
      promptLabel: "",
      allowFraction: false,
    }));
  }

  function chooseReceivingOption(
    optionKey: string
  ) {
    setSelectedOptionKey(
      optionKey
    );

    if (
      !scanResult ||
      !scanResult.found
    ) {
      return;
    }

    const option =
      scanResult.receivingOptions.find(
        (item) =>
          item.key === optionKey
      );

    if (!option) return;

    setInputQuantity(
      String(
        option.defaultInputQuantity || 1
      )
    );
  }

  function addCurrentItemToQueue() {
    if (
      !scanResult ||
      !scanResult.found ||
      !scanResult.canReceive
    ) {
      setError(
        "Escanea un producto válido antes de agregarlo."
      );
      return;
    }

    if (!selectedOption) {
      setError(
        "Selecciona cómo recibirás la mercancía."
      );
      return;
    }

    const quantity = Number(
      inputQuantity
    );
    const totalCost = Number(
      lineTotalCost || 0
    );

    if (
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      setError(
        "La cantidad recibida debe ser mayor a cero."
      );
      return;
    }

    if (
      !Number.isFinite(totalCost) ||
      totalCost < 0
    ) {
      setError(
        "El costo total no es válido."
      );
      return;
    }

    const baseQuantity =
      quantity *
      selectedOption.conversionFactor;

    setQueue((current) => [
      ...current,
      {
        localId: `${Date.now()}-${Math.random()}`,
        variantId:
          scanResult.variant.id,
        purchasePresentationId:
          selectedOption.presentationId,
        scannedCode:
          scanResult.code,
        quantityMode:
          selectedOption.quantityMode,
        inputQuantity: quantity,
        inputUnitCode:
          selectedOption.inputUnitCode,
        inputUnitSymbol:
          selectedOption.inputUnitSymbol,
        conversionFactor:
          selectedOption.conversionFactor,
        baseQuantity,
        baseUnitCode:
          selectedOption.baseUnitCode,
        baseUnitSymbol:
          selectedOption.baseUnitSymbol,
        totalCost,
        productName:
          scanResult.variant.product.name,
        variantName:
          scanResult.variant.name,
        optionName:
          selectedOption.name,
      },
    ]);

    setNotice(
      `${scanResult.variant.product.name} agregado a la recepción.`
    );

    clearCurrentScan(false);
  }

  function removeQueueItem(
    localId: string
  ) {
    setQueue((current) =>
      current.filter(
        (item) =>
          item.localId !== localId
      )
    );
  }

  function clearCurrentScan(
    clearMessages = true
  ) {
    setScanResult(null);
    setSelectedOptionKey("");
    setInputQuantity("1");
    setLineTotalCost("");
    setScanCode("");
    setSelectedAssociationVariantId(
      ""
    );

    if (clearMessages) {
      setError(null);
      setNotice(null);
    }

    window.setTimeout(() => {
      scanInputRef.current?.focus();
    }, 60);
  }

  async function completeReceipt() {
    if (!selectedLocationId) {
      setError(
        "Selecciona una sucursal."
      );
      return;
    }

    if (queue.length === 0) {
      setError(
        "Agrega al menos una partida."
      );
      return;
    }

    try {
      setIsCompletingReceipt(true);
      setError(null);
      setNotice(null);

      const receiptIdempotencyKey =
        receiptIdempotencyKeyRef.current ||
        crypto.randomUUID();
      receiptIdempotencyKeyRef.current =
        receiptIdempotencyKey;

      const response =
        await apiRequest<CompleteReceiptResponse>(
          "/api/pos/inventory-receiving",
          {
            method: "POST",
            body: JSON.stringify({
              brandSlug: brand.slug,
              action:
                "complete_receipt",
              idempotencyKey:
                receiptIdempotencyKey,
              locationId:
                selectedLocationId,
              supplierName:
                supplierName || null,
              supplierReference:
                supplierReference || null,
              notes: notes || null,
              items: queue.map(
                (item) => ({
                  variantId:
                    item.variantId,
                  purchasePresentationId:
                    item.purchasePresentationId,
                  scannedCode:
                    item.scannedCode,
                  quantityMode:
                    item.quantityMode,
                  inputQuantity:
                    item.inputQuantity,
                  inputUnitCode:
                    item.inputUnitCode,
                  conversionFactor:
                    item.conversionFactor,
                  totalCost:
                    item.totalCost,
                })
              ),
            }),
          }
        );

      const receiptNumber =
        response.receipt.receipt
          .receipt_number;

      setQueue([]);
      receiptIdempotencyKeyRef.current =
        null;
      setSupplierName("");
      setSupplierReference("");
      setNotes("");
      clearCurrentScan(false);

      setNotice(
        `Recepción ${receiptNumber} completada correctamente.`
      );

      await loadInitialData();
    } catch (receiptError) {
      setError(
        getErrorMessage(receiptError)
      );
    } finally {
      setIsCompletingReceipt(false);
    }
  }

  function selectAssociationVariant(
    variantId: string
  ) {
    setSelectedAssociationVariantId(
      variantId
    );

    const variant =
      directInventoryVariants.find(
        (item) =>
          item.id === variantId
      );

    if (!variant) return;

    const baseUnitCode =
      variant.unit_code;
    const suggested =
      getSuggestedPresentation(
        baseUnitCode
      );

    setPresentationDraft(
      (current) => ({
        ...current,
        name:
          current.name ||
          `Presentación de ${variant.productName}`,
        quantityMode:
          suggested.quantityMode,
        inputUnitCode:
          suggested.inputUnitCode,
        baseUnitCode,
        conversionFactor:
          suggested.conversionFactor,
        promptLabel:
          suggested.promptLabel,
        allowFraction:
          suggested.allowFraction,
      })
    );
  }

  async function savePresentation() {
    if (
      !scanResult ||
      scanResult.found
    ) {
      return;
    }

    if (
      !selectedAssociationVariant
    ) {
      setError(
        "Selecciona la variante que corresponde al código."
      );
      return;
    }

    if (
      !presentationDraft.name.trim()
    ) {
      setError(
        "Escribe el nombre de la presentación."
      );
      return;
    }

    const factor = Number(
      presentationDraft.conversionFactor
    );

    if (
      !Number.isFinite(factor) ||
      factor <= 0
    ) {
      setError(
        "El factor de conversión debe ser mayor a cero."
      );
      return;
    }

    try {
      setIsSavingPresentation(
        true
      );
      setError(null);
      setNotice(null);

      await apiRequest(
        "/api/pos/inventory-receiving",
        {
          method: "POST",
          body: JSON.stringify({
            brandSlug: brand.slug,
            action:
              "save_presentation",
            variantId:
              selectedAssociationVariant.id,
            name:
              presentationDraft.name,
            barcode:
              presentationDraft.barcode ||
              null,
            supplierSku:
              presentationDraft.supplierSku ||
              null,
            quantityMode:
              presentationDraft.quantityMode,
            inputUnitCode:
              presentationDraft.inputUnitCode,
            baseUnitCode:
              selectedAssociationVariant.unit_code,
            conversionFactor:
              factor,
            defaultInputQuantity:
              Number(
                presentationDraft
                  .defaultInputQuantity ||
                  1
              ),
            promptLabel:
              presentationDraft.promptLabel ||
              null,
            allowFraction:
              presentationDraft.allowFraction,
          }),
        }
      );

      const codeToRescan =
        scanResult.code;

      setNotice(
        "Presentación guardada. Cometa reconocerá este código en futuras recepciones."
      );

      await runScan(codeToRescan);
    } catch (presentationError) {
      setError(
        getErrorMessage(
          presentationError
        )
      );
    } finally {
      setIsSavingPresentation(
        false
      );
    }
  }

  if (isLoading) {
    return (
      <PosPage width="wide" density="compact" aria-busy="true">
        <div className="h-20 animate-pulse border-b border-[var(--pos-line-subtle)]" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-20 animate-pulse rounded-[var(--pos-radius-md)] bg-white/[0.035]" />
          ))}
        </div>
        <div className="h-12 animate-pulse rounded-[var(--pos-radius-md)] bg-white/[0.035]" />
        <div className="h-[480px] animate-pulse rounded-[var(--pos-radius-md)] bg-white/[0.035]" />
      </PosPage>
    );
  }

  return (
    <PosPage width="wide" density="compact">
      <PosPageHeader
        compact
        title="Inventario"
        description="Existencias, movimientos y recepción por sucursal."
        meta={selectedLocation ? `Existencias en ${selectedLocation.name}` : "Selecciona una sucursal"}
      />

      <section aria-label="Resumen de inventario" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <InventoryMetric label="Unidades disponibles" value={formatQuantity(inventoryMetrics.available)} />
        <InventoryMetric label="Variantes con stock" value={String(inventoryMetrics.stocked)} />
        <InventoryMetric label="Stock bajo" value={String(inventoryMetrics.low)} tone={inventoryMetrics.low > 0 ? "warning" : "neutral"} />
        <InventoryMetric label="Agotados" value={String(inventoryMetrics.out)} tone={inventoryMetrics.out > 0 ? "danger" : "neutral"} />
      </section>

      <FeedbackBanner
        error={error}
        notice={notice}
      />

      {locations.length === 0 ? (
        <RequiredConfiguration
          brandSlug={brand.slug}
        />
      ) : (
        <>
          <PosCard padding="compact">
            <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-end">
              <SelectField
                label="Sucursal de recepción"
                value={selectedLocationId}
                onChange={(value) => {
                  setSelectedLocationId(
                    value
                  );
                  clearCurrentScan();
                }}
                options={locations.map(
                  (location) => [
                    location.id,
                    `${location.name} · ${location.code}`,
                  ]
                )}
                required
              />

              <form
                onSubmit={
                  handleScanSubmit
                }
                className="grid gap-2"
              >
                <span className="text-xs font-medium text-[var(--pos-text-secondary)]">
                  Escanea SKU, código de barras o presentación
                </span>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="relative min-w-0 flex-1">
                    <input
                      ref={scanInputRef}
                      autoFocus
                      autoComplete="off"
                      value={scanCode}
                      onChange={(
                        event
                      ) =>
                        setScanCode(
                          event.target.value
                        )
                      }
                      placeholder="Escanea y presiona Enter"
                      className="pos-ui-focus h-11 w-full rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] bg-[var(--pos-canvas)] px-4 pr-12 font-mono text-sm font-semibold text-[var(--pos-text-primary)] outline-none placeholder:font-sans placeholder:font-normal placeholder:text-[var(--pos-text-muted)]"
                    />

                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--pos-primary)]">
                      <PosIcon
                        name="inventory"
                        className="h-5 w-5"
                      />
                    </span>
                  </div>

                  <PosButton
                    type="submit"
                    disabled={
                      isScanning ||
                      !scanCode.trim() ||
                      !selectedLocationId
                    }
                    size="normal"
                  >
                    {isScanning
                      ? "Identificando..."
                      : "Identificar"}
                  </PosButton>
                </div>

                <p className="text-[11px] text-[var(--pos-text-muted)]">
                  Presiona F2 desde cualquier parte para volver
                  al scanner.
                </p>
              </form>
            </div>
          </PosCard>

          <InventoryStockTable
            rows={stockRows}
            search={stockSearch}
            onSearchChange={setStockSearch}
            locationName={selectedLocation?.name || "Sucursal"}
            units={units}
          />

          <PosSection
            title="Recepción de mercancía"
            description="Escanea, convierte y confirma entradas en la sucursal seleccionada."
          >
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
            <div className="grid content-start gap-5">
              {!scanResult ? (
                <ScannerWaiting />
              ) : scanResult.found ? (
                <FoundReceivingPanel
                  result={scanResult}
                  selectedOptionKey={
                    selectedOptionKey
                  }
                  selectedOption={
                    selectedOption
                  }
                  inputQuantity={
                    inputQuantity
                  }
                  totalCost={
                    lineTotalCost
                  }
                  calculatedBaseQuantity={
                    calculatedBaseQuantity
                  }
                  currency={currency}
                  onOptionChange={
                    chooseReceivingOption
                  }
                  onQuantityChange={
                    setInputQuantity
                  }
                  onCostChange={
                    setLineTotalCost
                  }
                  onAdd={
                    addCurrentItemToQueue
                  }
                  onClear={() =>
                    clearCurrentScan()
                  }
                />
              ) : (
                <UnknownCodePanel
                  result={scanResult}
                  units={units}
                  filteredVariants={
                    directInventoryVariants
                  }
                  associationSearch={
                    associationSearch
                  }
                  selectedVariantId={
                    selectedAssociationVariantId
                  }
                  selectedVariant={
                    selectedAssociationVariant
                  }
                  draft={
                    presentationDraft
                  }
                  isSaving={
                    isSavingPresentation
                  }
                  brandSlug={brand.slug}
                  onSearchChange={
                    setAssociationSearch
                  }
                  onVariantChange={
                    selectAssociationVariant
                  }
                  onDraftChange={(
                    field,
                    value
                  ) =>
                    setPresentationDraft(
                      (current) => ({
                        ...current,
                        [field]: value,
                      })
                    )
                  }
                  onSave={
                    savePresentation
                  }
                  onClear={() =>
                    clearCurrentScan()
                  }
                />
              )}

              <ReceiptHistory
                history={history}
                currency={currency}
              />
            </div>

            <aside className="grid content-start gap-5">
              <ReceiptQueue
                queue={queue}
                currency={currency}
                totalCost={
                  queueTotalCost
                }
                totalBaseQuantity={
                  queueTotalBaseQuantity
                }
                supplierName={
                  supplierName
                }
                supplierReference={
                  supplierReference
                }
                notes={notes}
                isCompleting={
                  isCompletingReceipt
                }
                onSupplierNameChange={
                  setSupplierName
                }
                onSupplierReferenceChange={
                  setSupplierReference
                }
                onNotesChange={
                  setNotes
                }
                onRemove={
                  removeQueueItem
                }
                onComplete={
                  completeReceipt
                }
              />
            </aside>
          </section>
          </PosSection>
        </>
      )}
    </PosPage>
  );
}

function InventoryMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "warning" | "danger";
}) {
  const valueClass =
    tone === "danger"
      ? "text-[var(--pos-danger)]"
      : tone === "warning"
      ? "text-[var(--pos-warning)]"
      : "text-[var(--pos-text-primary)]";

  return (
    <PosCard padding="compact" variant="muted">
      <p className="text-[11px] font-medium text-[var(--pos-text-muted)]">
        {label}
      </p>
      <p className={`mt-2 text-xl font-semibold tabular-nums ${valueClass}`}>
        {value}
      </p>
    </PosCard>
  );
}

function InventoryStockTable({
  rows,
  search,
  onSearchChange,
  locationName,
  units,
}: {
  rows: InventoryStockRow[];
  search: string;
  onSearchChange: (value: string) => void;
  locationName: string;
  units: UnitOption[];
}) {
  return (
    <PosSection
      title={`Existencias en ${locationName}`}
      description={`${rows.length} variantes visibles en la sucursal seleccionada.`}
    >
      <div className="mb-3 rounded-[var(--pos-radius-md)] bg-[var(--pos-panel)] p-3">
        <div className="relative max-w-xl">
          <PosIcon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--pos-text-muted)]"
          />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar producto, variante, SKU o código"
            className="pos-ui-focus h-10 w-full rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] bg-[var(--pos-canvas)] pl-10 pr-3 text-sm text-[var(--pos-text-primary)] outline-none placeholder:text-[var(--pos-text-muted)]"
          />
        </div>
      </div>

      {rows.length > 0 ? (
        <>
          <div className="hidden md:block">
            <PosDataTable caption="Existencias por variante" density="compact" minWidth={760}>
              <thead className="bg-[var(--pos-panel-raised)] text-left text-[11px] font-semibold text-[var(--pos-text-muted)]">
                <tr>
                  <th>Producto</th>
                  <th>SKU / código</th>
                  <th className="text-right">Existencia</th>
                  <th className="hidden lg:table-cell text-right">Reservado</th>
                  <th className="text-right">Disponible</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const status = getStockStatus(row);
                  const imageUrl = row.variantImageUrl || row.productImageUrl;

                  return (
                    <tr key={row.id} className="border-t border-[var(--pos-line-subtle)]">
                      <td>
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[var(--pos-radius-sm)] bg-white/[0.05]">
                            <PosProductImage src={imageUrl} alt={`${row.productName} ${row.variantName}`} className="h-full w-full object-cover" fallbackIcon="inventory" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[var(--pos-text-primary)]">{row.productName}</p>
                            <p className="mt-0.5 truncate text-[11px] text-[var(--pos-text-muted)]">{row.variantName}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <p className="max-w-40 truncate font-mono text-[11px]">{row.sku || row.barcode || "—"}</p>
                      </td>
                      <td className="text-right font-medium tabular-nums text-[var(--pos-text-secondary)]">{formatQuantity(row.quantity)}</td>
                      <td className="hidden text-right tabular-nums lg:table-cell">{formatQuantity(row.reserved)}</td>
                      <td className="text-right text-sm font-semibold tabular-nums text-[var(--pos-text-primary)]">
                        {formatQuantity(row.available)} <span className="text-[11px] font-normal text-[var(--pos-text-muted)]">{getUnitSymbol(units, row.unitCode)}</span>
                      </td>
                      <td><PosBadge tone={status.tone} size="compact" dot>{status.label}</PosBadge></td>
                    </tr>
                  );
                })}
              </tbody>
            </PosDataTable>
          </div>

          <div className="grid gap-2 md:hidden">
            {rows.map((row) => {
              const status = getStockStatus(row);
              return (
                <div key={row.id} className="rounded-[var(--pos-radius-md)] bg-[var(--pos-panel)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--pos-text-primary)]">{row.productName}</p>
                      <p className="mt-1 truncate text-xs text-[var(--pos-text-muted)]">{row.variantName} · {row.sku || row.barcode || "Sin código"}</p>
                    </div>
                    <PosBadge tone={status.tone} size="compact">{status.label}</PosBadge>
                  </div>
                  <div className="mt-3 flex items-end justify-between border-t border-[var(--pos-line-subtle)] pt-3">
                    <span className="text-xs text-[var(--pos-text-muted)]">Disponible</span>
                    <span className="text-base font-semibold tabular-nums text-[var(--pos-text-primary)]">{formatQuantity(row.available)} {getUnitSymbol(units, row.unitCode)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="rounded-[var(--pos-radius-md)] bg-[var(--pos-panel)] px-4 py-8 text-center">
          <p className="text-sm font-medium text-[var(--pos-text-primary)]">
            {search ? "No hay coincidencias" : "No hay existencias para esta sucursal"}
          </p>
          <p className="mt-1 text-xs text-[var(--pos-text-muted)]">
            {search ? "Prueba con otro nombre, SKU o código." : "Las entradas confirmadas aparecerán aquí."}
          </p>
        </div>
      )}
    </PosSection>
  );
}

function getStockStatus(row: InventoryStockRow): {
  label: string;
  tone: "success" | "warning" | "danger";
} {
  if (row.available <= 0) return { label: "Agotado", tone: "danger" };
  if (row.minimum > 0 && row.available <= row.minimum) {
    return { label: "Stock bajo", tone: "warning" };
  }
  return { label: "Disponible", tone: "success" };
}

function FoundReceivingPanel({
  result,
  selectedOptionKey,
  selectedOption,
  inputQuantity,
  totalCost,
  calculatedBaseQuantity,
  currency,
  onOptionChange,
  onQuantityChange,
  onCostChange,
  onAdd,
  onClear,
}: {
  result: ReceivingScanFound;
  selectedOptionKey: string;
  selectedOption: ReceivingOption | null;
  inputQuantity: string;
  totalCost: string;
  calculatedBaseQuantity: number;
  currency: string;
  onOptionChange: (
    value: string
  ) => void;
  onQuantityChange: (
    value: string
  ) => void;
  onCostChange: (
    value: string
  ) => void;
  onAdd: () => void;
  onClear: () => void;
}) {
  return (
    <article className="rounded-[var(--pos-radius-lg)] bg-[var(--pos-panel)] p-5">
      <div className="flex flex-col gap-4 border-b border-[var(--pos-line-subtle)] pb-4 sm:flex-row sm:items-start">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[var(--pos-radius-md)] bg-[var(--pos-canvas)]">
          <PosProductImage
            src={result.variant.image_url || result.variant.product.image_url}
            alt={result.variant.product.name}
            className="h-full w-full object-cover"
            fallbackIcon="inventory"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-emerald-300/[0.08] px-3 py-1 text-[8px] font-black uppercase tracking-[0.14em] text-emerald-300">
              Código reconocido
            </span>

            <span className="rounded-full bg-white/[0.04] px-3 py-1 text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">
              {result.source ===
              "purchase_presentation"
                ? "Presentación guardada"
                : "Variante"}
            </span>
          </div>

          <h3 className="mt-3 text-lg font-semibold text-[var(--pos-text-primary)]">
            {
              result.variant.product
                .name
            }
          </h3>

          <p className="mt-1 text-sm text-[var(--pos-text-secondary)]">
            {result.variant.name}
          </p>

          <p className="mt-2 font-mono text-xs font-medium text-[var(--pos-primary)]">
            {result.code}
          </p>
        </div>

        <button
          type="button"
          onClick={onClear}
          className="pos-ui-focus h-9 rounded-[var(--pos-radius-sm)] px-3 text-xs font-medium text-[var(--pos-text-secondary)] hover:bg-white/[0.05] hover:text-[var(--pos-text-primary)]"
        >
          Limpiar
        </button>
      </div>

      {!result.canReceive ? (
        <div className="mt-4 rounded-[var(--pos-radius-md)] bg-[var(--pos-warning-soft)] p-4">
          <p className="text-sm font-semibold text-[var(--pos-text-primary)]">
            No utiliza inventario directo
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--pos-text-secondary)]">
            {result.reason}
          </p>
        </div>
      ) : (
        <div className="mt-4 grid gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <InfoMetric
              label="Existencia actual"
              value={formatQuantity(
                result.variant
                  .selectedLocationStock
                  ?.quantity || 0
              )}
            />
            <InfoMetric
              label="Disponible"
              value={formatQuantity(
                result.variant
                  .selectedLocationStock
                  ?.available || 0
              )}
            />
            <InfoMetric
              label="Costo actual"
              value={formatMoney(
                result.variant.cost,
                currency,
                6
              )}
            />
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">
              ¿Cómo llegó esta mercancía?
            </p>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {result.receivingOptions.map(
                (option) => {
                  const active =
                    selectedOptionKey ===
                    option.key;

                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() =>
                        onOptionChange(
                          option.key
                        )
                      }
                      className={`pos-ui-focus rounded-[var(--pos-radius-md)] border p-3 text-left transition ${
                        active
                          ? "border-[var(--pos-primary-line)] bg-[var(--pos-row-selected)]"
                          : "border-[var(--pos-line)] bg-[var(--pos-canvas)]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p
                          className={`text-sm font-black ${
                            active
                              ? "text-emerald-300"
                              : "text-white"
                          }`}
                        >
                          {option.name}
                        </p>

                        {option.source ===
                        "saved_presentation" ? (
                          <span className="rounded-full bg-cyan-300/[0.08] px-2 py-1 text-[7px] font-black uppercase text-cyan-300">
                            Guardada
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">
                        {option.promptLabel}
                      </p>

                      <p className="mt-3 font-mono text-[10px] font-black text-slate-400">
                        {option.example}
                      </p>
                    </button>
                  );
                }
              )}
            </div>
          </div>

          {selectedOption ? (
            <div className="rounded-[var(--pos-radius-md)] bg-[var(--pos-panel-raised)] p-4">
              <p className="text-sm font-semibold text-[var(--pos-text-primary)]">
                {
                  selectedOption.promptLabel
                }
              </p>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <NumberField
                  label={`Cantidad · ${selectedOption.inputUnitSymbol}`}
                  value={
                    inputQuantity
                  }
                  onChange={
                    onQuantityChange
                  }
                  min="0.001"
                  step={
                    selectedOption
                      .allowFraction
                      ? "0.001"
                      : "1"
                  }
                />

                <NumberField
                  label={`Costo total · ${currency}`}
                  value={
                    totalCost
                  }
                  onChange={
                    onCostChange
                  }
                  min="0"
                  step="0.01"
                  placeholder="Opcional"
                />
              </div>

              <div className="mt-4 flex flex-col gap-3 rounded-[var(--pos-radius-sm)] bg-[var(--pos-canvas)] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-700">
                    Resultado de conversión
                  </p>
                  <p className="mt-1 text-xl font-semibold text-[var(--pos-text-primary)]">
                    {formatQuantity(
                      calculatedBaseQuantity
                    )}{" "}
                    {
                      selectedOption.baseUnitSymbol
                    }
                  </p>
                </div>

                <p className="font-mono text-xs font-black text-emerald-300">
                  {formatQuantity(
                    Number(
                      inputQuantity || 0
                    )
                  )}{" "}
                  {
                    selectedOption.inputUnitSymbol
                  }{" "}
                  ×{" "}
                  {formatQuantity(
                    selectedOption
                      .conversionFactor
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={onAdd}
                className="pos-ui-focus mt-4 flex h-12 w-full items-center justify-center rounded-[var(--pos-radius-sm)] bg-[var(--pos-primary)] px-6 text-sm font-semibold text-slate-950"
              >
                Agregar a la recepción
              </button>
            </div>
          ) : null}
        </div>
      )}
    </article>
  );
}

function UnknownCodePanel({
  result,
  units,
  filteredVariants,
  associationSearch,
  selectedVariantId,
  selectedVariant,
  draft,
  isSaving,
  brandSlug,
  onSearchChange,
  onVariantChange,
  onDraftChange,
  onSave,
  onClear,
}: {
  result: ReceivingScanNotFound;
  units: UnitOption[];
  filteredVariants: Array<
    CatalogVariant & {
      productId: string;
      productName: string;
    }
  >;
  associationSearch: string;
  selectedVariantId: string;
  selectedVariant:
    | (CatalogVariant & {
        productId: string;
        productName: string;
      })
    | null;
  draft: PresentationDraft;
  isSaving: boolean;
  brandSlug: string;
  onSearchChange: (
    value: string
  ) => void;
  onVariantChange: (
    value: string
  ) => void;
  onDraftChange: (
    field: keyof PresentationDraft,
    value:
      | string
      | boolean
  ) => void;
  onSave: () => void;
  onClear: () => void;
}) {
  return (
    <article className="rounded-[30px] border border-amber-300/15 bg-amber-300/[0.04] p-6">
      <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] pb-5">
        <div>
          <span className="rounded-full bg-amber-300/[0.09] px-3 py-1 text-[8px] font-black uppercase tracking-[0.14em] text-amber-200">
            Código nuevo
          </span>

          <h3 className="mt-3 text-2xl font-black tracking-[-0.05em] text-white">
            ¿Es una presentación de un producto existente?
          </h3>

          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
            Asocia el código de una caja, paquete o bolsa con
            la variante que contiene. En la siguiente recepción
            Cometa reconocerá automáticamente la conversión.
          </p>

          <p className="mt-3 break-all font-mono text-sm font-black text-cyan-300">
            {result.code}
          </p>
        </div>

        <button
          type="button"
          onClick={onClear}
          className="text-xs font-black text-slate-600 hover:text-white"
        >
          Limpiar
        </button>
      </div>

      <div className="mt-6 grid gap-5">
        <div className="rounded-[22px] border border-white/[0.08] bg-[#06111f]/75 p-5">
          <p className="text-sm font-black text-white">
            1. Selecciona el producto contenido
          </p>

          <Field
            label="Buscar variante"
            value={
              associationSearch
            }
            onChange={
              onSearchChange
            }
            placeholder="Producto, variante, SKU..."
          />

          <div className="mt-4">
            <SelectField
              label="Variante existente"
              value={
                selectedVariantId
              }
              onChange={
                onVariantChange
              }
              options={filteredVariants.map(
                (variant) => [
                  variant.id,
                  `${variant.productName} · ${variant.name}${
                    variant.sku
                      ? ` · ${variant.sku}`
                      : ""
                  }`,
                ]
              )}
            />
          </div>
        </div>

        {selectedVariant ? (
          <div className="rounded-[22px] border border-white/[0.08] bg-[#06111f]/75 p-5">
            <p className="text-sm font-black text-white">
              2. Define cómo se convierte
            </p>

            <div className="mt-4 grid gap-4">
              <Field
                label="Nombre de la presentación"
                value={draft.name}
                onChange={(value) =>
                  onDraftChange(
                    "name",
                    value
                  )
                }
                placeholder="Caja de 12 piezas"
              />

              <div className="grid gap-4 md:grid-cols-2">
                <SelectField
                  label="Tipo de recepción"
                  value={
                    draft.quantityMode
                  }
                  onChange={(value) =>
                    onDraftChange(
                      "quantityMode",
                      value as QuantityMode
                    )
                  }
                  options={[
                    [
                      "fixed_package",
                      "Paquete fijo",
                    ],
                    [
                      "variable_quantity",
                      "Cantidad variable",
                    ],
                    [
                      "direct",
                      "Entrada directa",
                    ],
                  ]}
                />

                <SelectField
                  label="Unidad de entrada"
                  value={
                    draft.inputUnitCode
                  }
                  onChange={(value) =>
                    onDraftChange(
                      "inputUnitCode",
                      value
                    )
                  }
                  options={units.map(
                    (unit) => [
                      unit.code,
                      `${unit.name} · ${unit.symbol}`,
                    ]
                  )}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <NumberField
                  label="Factor de conversión"
                  value={
                    draft.conversionFactor
                  }
                  onChange={(value) =>
                    onDraftChange(
                      "conversionFactor",
                      value
                    )
                  }
                  min="0.000001"
                  step="0.001"
                />

                <NumberField
                  label="Cantidad predeterminada"
                  value={
                    draft.defaultInputQuantity
                  }
                  onChange={(value) =>
                    onDraftChange(
                      "defaultInputQuantity",
                      value
                    )
                  }
                  min="0.001"
                  step="0.001"
                />
              </div>

              <div className="rounded-[17px] border border-cyan-300/10 bg-cyan-300/[0.04] p-4">
                <p className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-700">
                  Conversión configurada
                </p>
                <p className="mt-2 text-sm font-black text-white">
                  1{" "}
                  {getUnitSymbol(
                    units,
                    draft.inputUnitCode
                  )}{" "}
                  ={" "}
                  {formatQuantity(
                    Number(
                      draft.conversionFactor ||
                        0
                    )
                  )}{" "}
                  {getUnitSymbol(
                    units,
                    selectedVariant.unit_code
                  )}
                </p>
              </div>

              <Field
                label="Pregunta que verá el usuario"
                value={
                  draft.promptLabel
                }
                onChange={(value) =>
                  onDraftChange(
                    "promptLabel",
                    value
                  )
                }
                placeholder="¿Cuántas cajas recibiste?"
              />

              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Código de barras"
                  value={
                    draft.barcode
                  }
                  onChange={(value) =>
                    onDraftChange(
                      "barcode",
                      value
                    )
                  }
                  placeholder="Opcional"
                />

                <Field
                  label="SKU del proveedor"
                  value={
                    draft.supplierSku
                  }
                  onChange={(value) =>
                    onDraftChange(
                      "supplierSku",
                      value
                    )
                  }
                  placeholder="Opcional"
                />
              </div>

              <ToggleRow
                title="Permitir decimales"
                description="Útil para kilogramos, litros y peso real."
                checked={
                  draft.allowFraction
                }
                onChange={(checked) =>
                  onDraftChange(
                    "allowFraction",
                    checked
                  )
                }
              />

              <button
                type="button"
                disabled={
                  isSaving ||
                  !draft.name.trim()
                }
                onClick={onSave}
                className="flex h-12 items-center justify-center rounded-[15px] bg-amber-300 px-6 text-sm font-black text-slate-950 disabled:opacity-45"
              >
                {isSaving
                  ? "Guardando asociación..."
                  : "Guardar y volver a escanear"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 rounded-[20px] border border-white/[0.08] bg-white/[0.025] p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-black text-white">
              ¿Es un producto completamente nuevo?
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-600">
              Regístralo primero en Productos y después vuelve
              a escanearlo aquí.
            </p>
          </div>

          <Link
            href={buildPosHref(
              brandSlug,
              "products"
            )}
            className="flex h-11 items-center justify-center rounded-[14px] border border-white/[0.08] px-5 text-xs font-black text-cyan-300"
          >
            Abrir Productos
          </Link>
        </div>
      </div>
    </article>
  );
}

function ReceiptQueue({
  queue,
  currency,
  totalCost,
  totalBaseQuantity,
  supplierName,
  supplierReference,
  notes,
  isCompleting,
  onSupplierNameChange,
  onSupplierReferenceChange,
  onNotesChange,
  onRemove,
  onComplete,
}: {
  queue: QueueItem[];
  currency: string;
  totalCost: number;
  totalBaseQuantity: number;
  supplierName: string;
  supplierReference: string;
  notes: string;
  isCompleting: boolean;
  onSupplierNameChange: (
    value: string
  ) => void;
  onSupplierReferenceChange: (
    value: string
  ) => void;
  onNotesChange: (
    value: string
  ) => void;
  onRemove: (
    localId: string
  ) => void;
  onComplete: () => void;
}) {
  return (
    <article className="xl:sticky xl:top-20 rounded-[var(--pos-radius-lg)] bg-[var(--pos-panel)] p-4">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--pos-line-subtle)] pb-4">
        <div>
          <p className="text-xs font-medium text-[var(--pos-text-muted)]">
            Recepción actual
          </p>
          <h3 className="mt-1 text-lg font-semibold text-[var(--pos-text-primary)]">
            {queue.length}{" "}
            {queue.length === 1
              ? "partida"
              : "partidas"}
          </h3>
        </div>

        <div className="flex h-10 w-10 items-center justify-center rounded-[var(--pos-radius-sm)] bg-[var(--pos-success-soft)] text-[var(--pos-success)]">
          <PosIcon
            name="receipt"
            className="h-5 w-5"
          />
        </div>
      </div>

      <div className="pos-ui-scrollbar mt-3 grid max-h-[320px] overflow-y-auto">
        {queue.length > 0 ? (
          queue.map((item) => (
            <div
              key={item.localId}
              className="border-b border-[var(--pos-line-subtle)] py-3 last:border-0"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--pos-text-primary)]">
                    {item.productName}
                  </p>
                  <p className="mt-1 truncate text-xs text-[var(--pos-text-muted)]">
                    {item.variantName}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onRemove(
                      item.localId
                    )
                  }
                  className="text-rose-300"
                  aria-label="Eliminar partida"
                >
                  <PosIcon
                    name="close"
                    className="h-4 w-4"
                  />
                </button>
              </div>

              <p className="mt-2 text-[11px] font-medium text-[var(--pos-primary)]">
                {item.optionName}
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <InfoMetric
                  label="Entrada"
                  value={`${formatQuantity(
                    item.inputQuantity
                  )} ${
                    item.inputUnitSymbol
                  }`}
                />
                <InfoMetric
                  label="Inventario"
                  value={`${formatQuantity(
                    item.baseQuantity
                  )} ${
                    item.baseUnitSymbol
                  }`}
                />
              </div>

              <p className="mt-2 text-right text-sm font-semibold text-[var(--pos-text-primary)]">
                {formatMoney(
                  item.totalCost,
                  currency
                )}
              </p>
            </div>
          ))
        ) : (
          <div className="flex min-h-28 items-center justify-center rounded-[var(--pos-radius-md)] border border-dashed border-[var(--pos-line)] p-4 text-center">
            <div>
              <p className="text-sm font-medium text-[var(--pos-text-primary)]">
                Sin partidas
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--pos-text-muted)]">
                Escanea productos y agrégalos a esta recepción.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-3 border-t border-[var(--pos-line-subtle)] pt-4">
        <Field
          label="Proveedor"
          value={supplierName}
          onChange={
            onSupplierNameChange
          }
          placeholder="Opcional"
        />

        <Field
          label="Factura o referencia"
          value={
            supplierReference
          }
          onChange={
            onSupplierReferenceChange
          }
          placeholder="Opcional"
        />

        <TextAreaField
          label="Notas"
          value={notes}
          onChange={
            onNotesChange
          }
          placeholder="Observaciones de la entrada"
        />
      </div>

      <div className="mt-4 rounded-[var(--pos-radius-md)] bg-[var(--pos-canvas)] p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-[var(--pos-text-muted)]">
            Cantidad convertida
          </span>
          <span className="text-sm font-semibold text-[var(--pos-text-primary)]">
            {formatQuantity(
              totalBaseQuantity
            )}
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
          <span className="text-xs font-medium text-[var(--pos-text-muted)]">
            Costo total
          </span>
          <span className="text-xl font-semibold text-[var(--pos-text-primary)]">
            {formatMoney(
              totalCost,
              currency
            )}
          </span>
        </div>
      </div>

      <PosButton
        type="button"
        onClick={onComplete}
        disabled={
          isCompleting ||
          queue.length === 0
        }
        size="touch"
        fullWidth
        className="mt-4"
      >
        {isCompleting
          ? "Completando recepción..."
          : "Completar recepción"}
      </PosButton>
    </article>
  );
}

function ReceiptHistory({
  history,
  currency,
}: {
  history: Receipt[];
  currency: string;
}) {
  return (
    <article className="rounded-[var(--pos-radius-lg)] bg-[var(--pos-panel)] p-4">
      <div className="border-b border-[var(--pos-line-subtle)] pb-4">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-300">
          Trazabilidad
        </p>
        <h3 className="mt-1 text-base font-semibold text-[var(--pos-text-primary)]">
          Recepciones recientes
        </h3>
        <p className="mt-1 text-xs text-[var(--pos-text-muted)]">
          Cantidades, costos y existencias antes y después de
          cada entrada.
        </p>
      </div>

      <div className="mt-2 grid">
        {history.length > 0 ? (
          history.map((receipt) => (
            <details
              key={receipt.id}
              className="group border-b border-[var(--pos-line-subtle)] last:border-0"
            >
              <summary className="pos-ui-focus flex cursor-pointer list-none flex-col gap-3 rounded-[var(--pos-radius-sm)] p-3 sm:flex-row sm:items-center">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--pos-radius-sm)] bg-[var(--pos-primary-soft)] text-[var(--pos-primary)]">
                  <PosIcon
                    name="receipt"
                    className="h-5 w-5"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--pos-text-primary)]">
                    {
                      receipt.receipt_number
                    }
                  </p>
                  <p className="mt-1 text-xs text-[var(--pos-text-muted)]">
                    {receipt.location
                      ?.name ||
                      "Sucursal"}{" "}
                    ·{" "}
                    {formatDateTime(
                      receipt.received_at
                    )}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:w-64">
                  <InfoMetric
                    label="Partidas"
                    value={String(
                      receipt.items?.length ||
                        0
                    )}
                  />
                  <InfoMetric
                    label="Costo"
                    value={formatMoney(
                      receipt.total_cost,
                      currency
                    )}
                  />
                </div>
              </summary>

              <div className="grid border-t border-[var(--pos-line-subtle)] px-3 py-2">
                {receipt.items?.map(
                  (item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-3 border-b border-[var(--pos-line-subtle)] py-3 last:border-0 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-black text-slate-300">
                          {item.variant
                            ?.product
                            ?.name ||
                            "Producto"}{" "}
                          ·{" "}
                          {item.variant
                            ?.name ||
                            "Variante"}
                        </p>
                        <p className="mt-1 text-[10px] font-semibold text-slate-700">
                          {formatQuantity(
                            item.input_quantity
                          )}{" "}
                          {
                            item.input_unit_code
                          }{" "}
                          →{" "}
                          {formatQuantity(
                            item.base_quantity
                          )}{" "}
                          {
                            item.base_unit_code
                          }
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-6 sm:justify-end">
                        <p className="text-xs font-black text-slate-400">
                          {formatQuantity(
                            item.quantity_before
                          )}{" "}
                          →{" "}
                          {formatQuantity(
                            item.quantity_after
                          )}
                        </p>

                        <p className="text-xs font-black text-white">
                          {formatMoney(
                            item.total_cost,
                            currency
                          )}
                        </p>
                      </div>
                    </div>
                  )
                )}
              </div>
            </details>
          ))
        ) : (
          <div className="flex min-h-52 items-center justify-center rounded-[22px] border border-dashed border-white/[0.08] p-6 text-center">
            <div>
              <p className="text-sm font-black text-white">
                Aún no hay recepciones
              </p>
              <p className="mt-2 text-xs font-semibold text-slate-600">
                La primera entrada completada aparecerá aquí.
              </p>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function ScannerWaiting() {
  return (
    <article className="flex min-h-48 items-center justify-center rounded-[var(--pos-radius-lg)] border border-dashed border-[var(--pos-line)] bg-[var(--pos-panel-muted)] p-6 text-center">
      <div className="max-w-sm">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-[var(--pos-radius-md)] bg-[var(--pos-primary-soft)] text-[var(--pos-primary)]">
          <PosIcon
            name="inventory"
            className="h-5 w-5"
          />
        </div>

        <h3 className="mt-4 text-base font-semibold text-[var(--pos-text-primary)]">
          Scanner preparado
        </h3>

        <p className="mt-2 text-xs leading-5 text-[var(--pos-text-muted)]">
          Escanea una pieza o presentación para preparar una entrada de inventario.
        </p>
      </div>
    </article>
  );
}

function RequiredConfiguration({
  brandSlug,
}: {
  brandSlug: string;
}) {
  return (
    <article className="rounded-[28px] border border-amber-300/15 bg-amber-300/[0.05] p-7">
      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-200">
        Configuración requerida
      </p>
      <h3 className="mt-3 text-2xl font-black text-white">
        Crea una sucursal antes de recibir inventario
      </h3>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
        Cada entrada debe actualizar las existencias de una
        ubicación específica.
      </p>

      <Link
        href={buildPosHref(
          brandSlug,
          "settings"
        )}
        className="mt-5 inline-flex h-12 items-center justify-center rounded-[15px] bg-amber-300 px-6 text-sm font-black text-slate-950"
      >
        Abrir configuración
      </Link>
    </article>
  );
}

function InfoMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-[14px] bg-white/[0.035] p-3">
      <p className="text-[7px] font-black uppercase tracking-[0.12em] text-slate-700">
        {label}
      </p>
      <p className="mt-1 truncate text-xs font-black text-slate-300">
        {value}
      </p>
    </div>
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
      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
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
        className="h-12 rounded-[15px] border border-white/[0.08] bg-[#06111f] px-4 text-sm font-bold text-white outline-none placeholder:text-slate-700 focus:border-emerald-300/30"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
  min,
  step,
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  placeholder?: string;
  min?: string;
  step?: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </span>

      <input
        type="number"
        value={value}
        min={min}
        step={step}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
        placeholder={placeholder}
        className="h-12 rounded-[15px] border border-white/[0.08] bg-[#06111f] px-4 text-sm font-bold text-white outline-none placeholder:text-slate-700 focus:border-emerald-300/30"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  required,
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  options: [string, string][];
  required?: boolean;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
        {required ? " *" : ""}
      </span>

      <select
        required={required}
        value={value}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
        className="h-12 rounded-[15px] border border-white/[0.08] bg-[#06111f] px-4 text-sm font-bold text-white outline-none focus:border-emerald-300/30"
      >
        <option value="">
          Seleccionar
        </option>

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
      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
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
        className="rounded-[15px] border border-white/[0.08] bg-[#06111f] px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-slate-700 focus:border-emerald-300/30"
      />
    </label>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (
    checked: boolean
  ) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-[17px] border border-white/[0.08] bg-white/[0.025] p-4">
      <div>
        <p className="text-sm font-black text-white">
          {title}
        </p>
        <p className="mt-1 text-xs font-semibold text-slate-600">
          {description}
        </p>
      </div>

      <input
        type="checkbox"
        checked={checked}
        onChange={(event) =>
          onChange(
            event.target.checked
          )
        }
        className="h-5 w-5 accent-emerald-300"
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
  if (!error && !notice) return null;

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

function getSuggestedPresentation(
  baseUnitCode: string
): {
  quantityMode: QuantityMode;
  inputUnitCode: string;
  conversionFactor: string;
  promptLabel: string;
  allowFraction: boolean;
} {
  if (baseUnitCode === "gram") {
    return {
      quantityMode:
        "variable_quantity",
      inputUnitCode: "kilogram",
      conversionFactor: "1000",
      promptLabel:
        "Captura el peso real recibido en kilogramos.",
      allowFraction: true,
    };
  }

  if (
    baseUnitCode ===
    "milliliter"
  ) {
    return {
      quantityMode:
        "variable_quantity",
      inputUnitCode: "liter",
      conversionFactor: "1000",
      promptLabel:
        "Captura el volumen real recibido en litros.",
      allowFraction: true,
    };
  }

  if (baseUnitCode === "piece") {
    return {
      quantityMode:
        "fixed_package",
      inputUnitCode: "package",
      conversionFactor: "1",
      promptLabel:
        "¿Cuántos paquetes recibiste?",
      allowFraction: false,
    };
  }

  return {
    quantityMode: "direct",
    inputUnitCode:
      baseUnitCode,
    conversionFactor: "1",
    promptLabel:
      "Captura la cantidad recibida.",
    allowFraction: true,
  };
}

function getUnitSymbol(
  units: UnitOption[],
  code: string
) {
  return (
    units.find(
      (unit) =>
        unit.code === code
    )?.symbol || code
  );
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
  currency = "MXN",
  maximumFractionDigits = 2
) {
  return new Intl.NumberFormat(
    "es-MX",
    {
      style: "currency",
      currency,
      maximumFractionDigits,
    }
  ).format(Number(value || 0));
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
