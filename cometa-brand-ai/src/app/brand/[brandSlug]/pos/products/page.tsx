"use client";

import Link from "next/link";
import {
  type DragEvent,
  type FormEvent,
  type Ref,
  type RefObject,
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
  PosDrawer,
  PosModal,
  PosPage,
  PosPageHeader,
  PosSection,
} from "../../components/pos-ui";

type Location = {
  id: string;
  name: string;
  code: string;
  currency: string;
  tax_rate: number;
};

type Category = {
  id: string;
  name: string;
  description: string | null;
};

type ProductTypeOption = {
  code: "physical" | "service" | string;
  name: string;
  description: string;
  launchStatus: "live" | "upcoming";
};

type InventoryModeOption = {
  code: "direct" | "none" | string;
  name: string;
  description: string;
  launchStatus: "live" | "upcoming";
};

type UnitOption = {
  code: string;
  name: string;
  symbol: string;
  unit_type: string;
  decimal_precision: number;
};

type AttributeDefinition = {
  id: string;
  code: string;
  name: string;
  input_type: "text" | "number" | "select";
  options: unknown;
  required: boolean;
  use_in_variant_name: boolean;
  source: string;
  sort_order: number;
};

type ProductConfigResponse = {
  ok: true;
  configurationReady: boolean;
  profile: {
    profile_code: string;
    operation_mode: string;
    profile?: {
      code: string;
      name: string;
      description: string;
    };
  };
  productTypes: ProductTypeOption[];
  inventoryModes: InventoryModeOption[];
  units: UnitOption[];
  attributes: AttributeDefinition[];
  capabilities: Record<string, boolean>;
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

type CategoriesResponse = {
  ok: true;
  categories: Category[];
};

type InventoryRow = {
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
  name: string;
  sku: string | null;
  barcode: string | null;
  price: number;
  cost: number;
  attributes: Record<string, unknown>;
  unit_code: string;
  is_default: boolean;
  image_url: string | null;
  active: boolean;
  configuration: Record<string, unknown>;
  inventory: InventoryRow[];
  stock: {
    quantity: number;
    reserved: number;
    available: number;
  };
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  product_type: "physical" | "service";
  inventory_mode: "direct" | "none";
  default_unit_code: string;
  has_variants: boolean;
  track_inventory: boolean;
  sellable: boolean;
  purchasable: boolean;
  tax_rate: number;
  image_url: string | null;
  active: boolean;
  configuration: Record<string, unknown>;
  category?: {
    id: string;
    name: string;
  } | null;
  variants: ProductVariant[];
  summary: {
    variantCount: number;
    totalStock: number;
    availableStock: number;
    minimumPrice: number;
    maximumPrice: number;
  };
};

type ProductsResponse = {
  ok: true;
  products: Product[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};


type ProductScanNotFoundResponse = {
  ok: true;
  found: false;
  code: string;
  suggestedField: "sku" | "barcode";
  prefill: {
    sku: string | null;
    barcode: string | null;
  };
};

type ProductScanFoundResponse = {
  ok: true;
  found: true;
  code: string;
  matchType: "sku" | "barcode";
  variant: {
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
    stock: {
      quantity: number;
      reserved: number;
      available: number;
    };
  };
};

type ProductScanResponse =
  | ProductScanNotFoundResponse
  | ProductScanFoundResponse;

type VariantForm = {
  id: string | null;
  localId: string;
  name: string;
  sku: string;
  barcode: string;
  price: string;
  cost: string;
  initialQuantity: string;
  minimumQuantity: string;
  unitCode: string;
  imageUrl: string;
  attributes: Record<string, string>;
  active: boolean;
  configuration: Record<string, unknown>;
  currentStock: number;
};

type ProductForm = {
  locationId: string;
  categoryId: string;
  name: string;
  description: string;
  productType: "physical" | "service";
  inventoryMode: "direct" | "none";
  defaultUnitCode: string;
  hasVariants: boolean;
  sellable: boolean;
  purchasable: boolean;
  taxRate: string;
  imageUrl: string;
};

type ProductImageUploadResponse = {
  ok: true;
  imageUrl: string;
  storagePath: string;
};

const EMPTY_PRODUCT_FORM: ProductForm = {
  locationId: "",
  categoryId: "",
  name: "",
  description: "",
  productType: "physical",
  inventoryMode: "direct",
  defaultUnitCode: "piece",
  hasVariants: true,
  sellable: true,
  purchasable: true,
  taxRate: "16",
  imageUrl: "",
};

function createVariant(
  index: number,
  unitCode: string,
  attributes: AttributeDefinition[],
  isService = false
): VariantForm {
  return {
    id: null,
    localId: `${Date.now()}-${index}-${Math.random()}`,
    name: isService
      ? "Servicio"
      : index === 0
      ? "Única"
      : `Variante ${index + 1}`,
    sku: "",
    barcode: "",
    price: "",
    cost: "",
    initialQuantity: "0",
    minimumQuantity: "0",
    unitCode,
    imageUrl: "",
    attributes: Object.fromEntries(
      attributes.map((attribute) => [
        attribute.code,
        "",
      ])
    ),
    active: true,
    configuration: {},
    currentStock: 0,
  };
}

export default function PosProductsPage() {
  const { brand } = usePosContext();

  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productTotal, setProductTotal] = useState(0);
  const [productConfig, setProductConfig] =
    useState<ProductConfigResponse | null>(null);

  const [productForm, setProductForm] =
    useState<ProductForm>(EMPTY_PRODUCT_FORM);
  const [variants, setVariants] = useState<VariantForm[]>([]);
  const [categoryName, setCategoryName] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const [scanCode, setScanCode] = useState("");
  const [scanResult, setScanResult] =
    useState<ProductScanResponse | null>(null);
  const [isScanning, setIsScanning] =
    useState(false);
  const [pendingProductId, setPendingProductId] =
    useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingProduct, setEditingProduct] =
    useState<Product | null>(null);
  const [activeChangeProduct, setActiveChangeProduct] =
    useState<Product | null>(null);
  const [isChangingActive, setIsChangingActive] = useState(false);
  const [selectedCatalogProduct, setSelectedCatalogProduct] =
    useState<Product | null>(null);

  const scanInputRef = useRef<HTMLInputElement>(null);
  const productNameInputRef =
    useRef<HTMLInputElement>(null);
  const createFormRef =
    useRef<HTMLElement>(null);
  const productImageInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProduct, setIsSavingProduct] =
    useState(false);
  const [isSavingCategory, setIsSavingCategory] =
    useState(false);
  const [isUploadingImage, setIsUploadingImage] =
    useState(false);
  const [imageUploadError, setImageUploadError] =
    useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const searchQuery = appliedSearch
        ? `&search=${encodeURIComponent(appliedSearch)}`
        : "";

      const [
        bootstrap,
        categoryData,
        configData,
        productData,
      ] = await Promise.all([
        apiRequest<BootstrapResponse>(
          `/api/pos/bootstrap?brandSlug=${encodeURIComponent(
            brand.slug
          )}`
        ),
        apiRequest<CategoriesResponse>(
          `/api/pos/categories?brandSlug=${encodeURIComponent(
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
          )}&pageSize=100${searchQuery}`
        ),
      ]);

      setLocations(bootstrap.locations || []);
      setCategories(categoryData.categories || []);
      setProductConfig(configData);
      setProducts(productData.products || []);
      setProductTotal(productData.pagination?.total || 0);

      const firstLocation = bootstrap.locations?.[0];
      const supportsVariants =
        Boolean(configData.capabilities?.variants);
      const initialUnit =
        configData.units.some(
          (unit) => unit.code === "piece"
        )
          ? "piece"
          : configData.units?.[0]?.code || "piece";

      setProductForm((current) => ({
        ...current,
        locationId:
          current.locationId || firstLocation?.id || "",
        taxRate:
          current.taxRate ||
          String(firstLocation?.tax_rate ?? 16),
        defaultUnitCode:
          current.defaultUnitCode || initialUnit,
        hasVariants:
          current.name || current.description
            ? current.hasVariants
            : supportsVariants,
      }));

      setVariants((current) =>
        current.length > 0
          ? current
          : [
              createVariant(
                0,
                initialUnit,
                configData.attributes || []
              ),
            ]
      );
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [brand.slug, appliedSearch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    function focusScanner(event: KeyboardEvent) {
      if (event.key !== "F2") return;

      event.preventDefault();
      scanInputRef.current?.focus();
      scanInputRef.current?.select();
    }

    window.addEventListener("keydown", focusScanner);

    return () => {
      window.removeEventListener(
        "keydown",
        focusScanner
      );
    };
  }, []);

  useEffect(() => {
    if (!pendingProductId) return;

    const exists = products.some(
      (product) =>
        product.id === pendingProductId
    );

    if (!exists) return;

    const timeout = window.setTimeout(() => {
      document
        .getElementById(
          `product-${pendingProductId}`
        )
        ?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });

      setPendingProductId(null);
    }, 120);

    return () => window.clearTimeout(timeout);
  }, [pendingProductId, products]);

  const attributes = productConfig?.attributes || [];
  const liveProductTypes =
    productConfig?.productTypes.filter(
      (option) => option.launchStatus === "live"
    ) || [];
  const liveInventoryModes =
    productConfig?.inventoryModes.filter(
      (option) => option.launchStatus === "live"
    ) || [];
  const units = productConfig?.units || [];

  const selectedLocation = locations.find(
    (location) =>
      location.id === productForm.locationId
  );

  const currency = selectedLocation?.currency || "MXN";

  const totalVariants = useMemo(
    () =>
      products.reduce(
        (total, product) =>
          total + product.summary.variantCount,
        0
      ),
    [products]
  );

  const totalUnits = useMemo(
    () =>
      products.reduce(
        (total, product) =>
          total + product.summary.totalStock,
        0
      ),
    [products]
  );

  const servicesCount = useMemo(
    () =>
      products.filter(
        (product) =>
          product.product_type === "service"
      ).length,
    [products]
  );

  const needsLocation =
    productForm.inventoryMode === "direct";
  const isEditing = Boolean(editingProduct);
  const needsInitialInventory = needsLocation && !isEditing;

  function updateVariant(
    localId: string,
    field:
      | "name"
      | "sku"
      | "barcode"
      | "price"
      | "cost"
      | "initialQuantity"
      | "minimumQuantity"
      | "unitCode"
      | "imageUrl",
    value: string
  ) {
    setVariants((current) =>
      current.map((variant) =>
        variant.localId === localId
          ? {
              ...variant,
              [field]: value,
            }
          : variant
      )
    );
  }

  function updateVariantAttribute(
    localId: string,
    attributeCode: string,
    value: string
  ) {
    setVariants((current) =>
      current.map((variant) =>
        variant.localId === localId
          ? {
              ...variant,
              attributes: {
                ...variant.attributes,
                [attributeCode]: value,
              },
            }
          : variant
      )
    );
  }

  function addVariant() {
    if (!productForm.hasVariants) return;

    setVariants((current) => [
      ...current,
      createVariant(
        current.length,
        productForm.defaultUnitCode,
        attributes
      ),
    ]);
  }

  function removeVariant(localId: string) {
    setVariants((current) => {
      if (current.length === 1) return current;

      return current.flatMap((variant) => {
        if (variant.localId !== localId) return [variant];
        return variant.id ? [{ ...variant, active: false }] : [];
      });
    });
  }

  function setVariantActive(localId: string, active: boolean) {
    setVariants((current) =>
      current.map((variant) =>
        variant.localId === localId ? { ...variant, active } : variant
      )
    );
  }

  function setProductType(
    productType: "physical" | "service"
  ) {
    if (productType === "service") {
      setProductForm((current) => ({
        ...current,
        productType,
        inventoryMode: "none",
        defaultUnitCode: "service",
        hasVariants: false,
        purchasable: false,
      }));

      setVariants([
        createVariant(
          0,
          "service",
          [],
          true
        ),
      ]);

      return;
    }

    const initialUnit =
      units.some(
        (unit) => unit.code === "piece"
      )
        ? "piece"
        : units[0]?.code || "piece";

    setProductForm((current) => ({
      ...current,
      productType,
      inventoryMode: "direct",
      defaultUnitCode: initialUnit,
      hasVariants: Boolean(
        productConfig?.capabilities?.variants
      ),
      purchasable: true,
    }));

    setVariants([
      createVariant(
        0,
        initialUnit,
        attributes
      ),
    ]);
  }

  function toggleVariants(enabled: boolean) {
    setProductForm((current) => ({
      ...current,
      hasVariants: enabled,
    }));

    if (!enabled) {
      setVariants((current) => [
        {
          ...(current[0] ||
            createVariant(
              0,
              productForm.defaultUnitCode,
              attributes
            )),
          name: "Única",
        },
      ]);
    }
  }

  function changeDefaultUnit(unitCode: string) {
    setProductForm((current) => ({
      ...current,
      defaultUnitCode: unitCode,
    }));

    setVariants((current) =>
      current.map((variant) => ({
        ...variant,
        unitCode:
          variant.unitCode ||
          unitCode,
      }))
    );
  }

  async function handleCreateCategory() {
    if (!categoryName.trim()) return;

    try {
      setIsSavingCategory(true);
      setError(null);
      setNotice(null);

      const response = await apiRequest<{
        ok: true;
        category: Category;
      }>("/api/pos/categories", {
        method: "POST",
        body: JSON.stringify({
          brandSlug: brand.slug,
          name: categoryName,
        }),
      });

      setCategoryName("");
      setProductForm((current) => ({
        ...current,
        categoryId: response.category.id,
      }));
      setNotice(
        `Categoría “${response.category.name}” creada.`
      );

      await loadData();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSavingCategory(false);
    }
  }

  async function handleSaveProduct(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!productConfig?.configurationReady) {
      setError(
        "Primero configura el perfil del negocio."
      );
      return;
    }

    if (
      needsInitialInventory &&
      !productForm.locationId
    ) {
      setError(
        "Selecciona una sucursal para registrar el inventario."
      );
      return;
    }

    if (!productForm.name.trim()) {
      setError(
        "Escribe el nombre del producto."
      );
      return;
    }

    if (
      variants.some(
        (variant) =>
          variant.active &&
          (variant.price === "" ||
            Number(variant.price) < 0)
      )
    ) {
      setError(
        "Cada variante necesita un precio válido."
      );
      return;
    }

    for (const attribute of attributes) {
      if (!attribute.required) continue;

      const missing = variants.some(
        (variant) =>
          variant.active &&
          !variant.attributes[
            attribute.code
          ]?.trim()
      );

      if (missing) {
        setError(
          `Completa el atributo obligatorio “${attribute.name}” en todas las variantes.`
        );
        return;
      }
    }

    try {
      setIsSavingProduct(true);
      setError(null);
      setNotice(null);

      await apiRequest("/api/pos/products", {
        method: isEditing ? "PATCH" : "POST",
        body: JSON.stringify({
          brandSlug: brand.slug,
          ...(isEditing && editingProduct
            ? {
                action: "update_product",
                productId: editingProduct.id,
                configuration: editingProduct.configuration || {},
              }
            : {}),
          locationId:
            needsInitialInventory
              ? productForm.locationId
              : null,
          categoryId:
            productForm.categoryId || null,
          name: productForm.name,
          description:
            productForm.description,
          productType:
            productForm.productType,
          inventoryMode:
            productForm.inventoryMode,
          defaultUnitCode:
            productForm.defaultUnitCode,
          hasVariants:
            productForm.hasVariants,
          sellable:
            productForm.sellable,
          purchasable:
            productForm.purchasable,
          taxRate: Number(
            productForm.taxRate || 0
          ),
          imageUrl:
            productForm.imageUrl || null,
          variants: variants.map(
            (variant, index) => ({
              ...(isEditing && variant.id
                ? { id: variant.id }
                : {}),
              name:
                variant.name.trim() ||
                buildVariantName(
                  variant,
                  attributes,
                  index
                ),
              sku: variant.sku || null,
              barcode:
                variant.barcode || null,
              price: Number(
                variant.price || 0
              ),
              cost: Number(
                variant.cost || 0
              ),
              initialQuantity:
                needsInitialInventory
                  ? Number(
                      variant.initialQuantity ||
                        0
                    )
                  : 0,
              minimumQuantity:
                needsInitialInventory
                  ? Number(
                      variant.minimumQuantity ||
                        0
                    )
                  : 0,
              unitCode:
                variant.unitCode ||
                productForm.defaultUnitCode,
              imageUrl:
                variant.imageUrl || null,
              active: variant.active,
              configuration: variant.configuration,
              sortOrder: index,
              attributes:
                productForm.productType ===
                "service"
                  ? {}
                  : Object.fromEntries(
                      Object.entries(
                        variant.attributes
                      ).filter(([, value]) =>
                        Boolean(value.trim())
                      )
                    ),
            })
          ),
        }),
      });

      setNotice(
        isEditing
          ? `Producto “${productForm.name}” actualizado correctamente.`
          : `Producto “${productForm.name}” creado correctamente.`
      );

      if (
        isEditing &&
        editingProduct?.image_url &&
        editingProduct.image_url !== productForm.imageUrl &&
        isManagedProductImageUrl(editingProduct.image_url, brand.slug)
      ) {
        try {
          await deleteManagedProductImage(editingProduct.image_url, brand.slug);
        } catch {
          setNotice(
            `Producto “${productForm.name}” actualizado; la imagen anterior quedó pendiente de limpieza.`
          );
        }
      }

      resetForm();
      setEditingProduct(null);
      setIsEditorOpen(false);
      await loadData();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSavingProduct(false);
    }
  }

  function resetForm() {
    const initialUnit =
      units.some(
        (unit) => unit.code === "piece"
      )
        ? "piece"
        : units[0]?.code || "piece";

    const form: ProductForm = {
      ...EMPTY_PRODUCT_FORM,
      locationId:
        selectedLocation?.id ||
        locations[0]?.id ||
        "",
      taxRate: String(
        selectedLocation?.tax_rate ??
          locations[0]?.tax_rate ??
          16
      ),
      defaultUnitCode: initialUnit,
      hasVariants: Boolean(
        productConfig?.capabilities?.variants
      ),
    };

    setProductForm(form);
    setImageUploadError(null);
    setVariants([
      createVariant(
        0,
        initialUnit,
        attributes
      ),
    ]);
  }

  function openCreateProduct() {
    setEditingProduct(null);
    resetForm();
    setIsEditorOpen(true);
  }

  function openEditProduct(product: Product) {
    setEditingProduct(product);
    setImageUploadError(null);
    setProductForm({
      locationId: selectedLocation?.id || locations[0]?.id || "",
      categoryId: product.category?.id || "",
      name: product.name,
      description: product.description || "",
      productType: product.product_type,
      inventoryMode: product.inventory_mode,
      defaultUnitCode: product.default_unit_code,
      hasVariants: product.has_variants,
      sellable: product.sellable,
      purchasable: product.purchasable,
      taxRate: String(product.tax_rate),
      imageUrl: product.image_url || "",
    });
    setVariants(
      product.variants.map((variant) => ({
        id: variant.id,
        localId: variant.id,
        name: variant.name,
        sku: variant.sku || "",
        barcode: variant.barcode || "",
        price: String(variant.price),
        cost: String(variant.cost),
        initialQuantity: "0",
        minimumQuantity: "0",
        unitCode: variant.unit_code || product.default_unit_code,
        imageUrl: variant.image_url || "",
        attributes: Object.fromEntries(
          Object.entries(variant.attributes || {}).map(([code, value]) => [
            code,
            String(value ?? ""),
          ])
        ),
        active: variant.active,
        configuration: variant.configuration || {},
        currentStock: Number(variant.stock?.quantity || 0),
      }))
    );
    setIsEditorOpen(true);
  }

  async function changeProductActive() {
    if (!activeChangeProduct) return;

    try {
      setIsChangingActive(true);
      setError(null);
      const nextActive = !activeChangeProduct.active;

      await apiRequest("/api/pos/products", {
        method: "PATCH",
        body: JSON.stringify({
          brandSlug: brand.slug,
          action: "set_active",
          productId: activeChangeProduct.id,
          active: nextActive,
        }),
      });

      setNotice(
        nextActive
          ? `Producto “${activeChangeProduct.name}” activado.`
          : `Producto “${activeChangeProduct.name}” desactivado.`
      );
      setActiveChangeProduct(null);
      await loadData();
    } catch (activeError) {
      setError(getErrorMessage(activeError));
    } finally {
      setIsChangingActive(false);
    }
  }

  async function uploadProductImage(file: File) {
    setImageUploadError(null);

    if (file.size <= 0) {
      setImageUploadError("La imagen está vacía.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setImageUploadError("La imagen no puede superar 5 MB.");
      return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setImageUploadError("Usa una imagen JPG, PNG o WEBP.");
      return;
    }

    const previousImageUrl = productForm.imageUrl.trim();
    const formData = new FormData();
    formData.append("file", file);

    try {
      setIsUploadingImage(true);
      const response = await apiRequest<ProductImageUploadResponse>(
        `/api/pos/product-images?brandSlug=${encodeURIComponent(brand.slug)}`,
        {
          method: "POST",
          body: formData,
        }
      );

      setProductForm((current) => ({
        ...current,
        imageUrl: response.imageUrl,
      }));

      if (
        previousImageUrl &&
        previousImageUrl !== response.imageUrl &&
        previousImageUrl !== editingProduct?.image_url &&
        isManagedProductImageUrl(previousImageUrl, brand.slug)
      ) {
        try {
          await deleteManagedProductImage(previousImageUrl, brand.slug);
        } catch {
          setImageUploadError(
            "La nueva imagen se guardó, pero no fue posible limpiar la anterior."
          );
        }
      }
    } catch (uploadError) {
      setImageUploadError(getErrorMessage(uploadError));
    } finally {
      setIsUploadingImage(false);
      if (productImageInputRef.current) {
        productImageInputRef.current.value = "";
      }
    }
  }

  async function removeProductImage() {
    const currentImageUrl = productForm.imageUrl.trim();

    if (!currentImageUrl) return;

    setImageUploadError(null);

    if (!isManagedProductImageUrl(currentImageUrl, brand.slug)) {
      setProductForm((current) => ({ ...current, imageUrl: "" }));
      return;
    }

    if (isEditing && currentImageUrl === editingProduct?.image_url) {
      setProductForm((current) => ({ ...current, imageUrl: "" }));
      return;
    }

    try {
      setIsUploadingImage(true);
      await deleteManagedProductImage(currentImageUrl, brand.slug);
      setProductForm((current) => ({ ...current, imageUrl: "" }));
    } catch (removeError) {
      setImageUploadError(getErrorMessage(removeError));
    } finally {
      setIsUploadingImage(false);
    }
  }


  async function handleProductScan(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const normalizedCode = scanCode.trim();

    if (!normalizedCode) {
      setError(
        "Escanea o escribe un SKU o código de barras."
      );
      scanInputRef.current?.focus();
      return;
    }

    try {
      setIsScanning(true);
      setError(null);
      setNotice(null);

      const result =
        await apiRequest<ProductScanResponse>(
          `/api/pos/product-scan?brandSlug=${encodeURIComponent(
            brand.slug
          )}&code=${encodeURIComponent(
            normalizedCode
          )}`
        );

      setScanResult(result);

      if (result.found) {
        setSearchInput(
          result.variant.product.name
        );
        setAppliedSearch(
          result.variant.product.name
        );
        setPendingProductId(
          result.variant.product.id
        );
        setNotice(
          `Código reconocido: ${result.variant.product.name} · ${result.variant.name}.`
        );

        window.setTimeout(() => {
          scanInputRef.current?.focus();
          scanInputRef.current?.select();
        }, 80);

        return;
      }

      const initialUnit =
        units.some(
          (unit) => unit.code === "piece"
        )
          ? "piece"
          : units[0]?.code || "piece";

      setProductForm((current) => ({
        ...current,
        productType: "physical",
        inventoryMode: "direct",
        defaultUnitCode:
          current.defaultUnitCode === "service"
            ? initialUnit
            : current.defaultUnitCode,
        purchasable: true,
        sellable: true,
      }));

      setVariants((current) => {
        const baseVariant =
          current[0] &&
          productForm.productType !== "service"
            ? current[0]
            : createVariant(
                0,
                initialUnit,
                attributes
              );

        const preparedVariant: VariantForm = {
          ...baseVariant,
          sku:
            result.prefill.sku ||
            baseVariant.sku,
          barcode:
            result.prefill.barcode ||
            baseVariant.barcode,
        };

        return [
          preparedVariant,
          ...current.slice(1),
        ];
      });

      setNotice(
        `El código ${result.code} no existe. Ya lo colocamos en el formulario para registrar el producto.`
      );
      setIsEditorOpen(true);

      window.setTimeout(() => {
        createFormRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        productNameInputRef.current?.focus();
      }, 100);
    } catch (scanError) {
      setScanResult(null);
      setError(getErrorMessage(scanError));
      window.setTimeout(() => {
        scanInputRef.current?.focus();
        scanInputRef.current?.select();
      }, 80);
    } finally {
      setIsScanning(false);
      setScanCode("");
    }
  }

  function openScannedProduct() {
    if (!scanResult?.found) return;

    setSearchInput(
      scanResult.variant.product.name
    );
    setAppliedSearch(
      scanResult.variant.product.name
    );
    setPendingProductId(
      scanResult.variant.product.id
    );
  }

  function continueScannedProductCreation() {
    setIsEditorOpen(true);
    createFormRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });

    window.setTimeout(() => {
      productNameInputRef.current?.focus();
    }, 100);
  }

  function clearScanner() {
    setScanResult(null);
    setScanCode("");
    setError(null);
    setNotice(null);

    window.setTimeout(() => {
      scanInputRef.current?.focus();
    }, 50);
  }

  function handleSearch(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setAppliedSearch(searchInput.trim());
  }

  if (isLoading || !productConfig) {
    return (
      <PosPage width="wide" density="compact" aria-busy="true">
        <div className="h-20 animate-pulse border-b border-[var(--pos-line-subtle)]" />
        <div className="h-12 animate-pulse rounded-[var(--pos-radius-md)] bg-white/[0.035]" />
        <div className="h-[560px] animate-pulse rounded-[var(--pos-radius-md)] bg-white/[0.035]" />
      </PosPage>
    );
  }

  return (
    <PosPage width="wide" density="compact">
      <PosPageHeader
        compact
        title="Productos"
        description="Administración de catálogo, precios, variantes y disponibilidad."
        meta={`${productTotal} productos registrados`}
        actions={
          <PosButton
            leadingIcon={<PosIcon name="plus" className="h-4 w-4" />}
            onClick={openCreateProduct}
          >
            Nuevo producto
          </PosButton>
        }
      />

      <section aria-label="Resumen del catálogo" className="grid grid-cols-3 gap-3">
        <Metric label="Productos" value={String(productTotal)} />
        <Metric label="Variantes" value={String(totalVariants)} />
        <Metric label="Unidades" value={formatQuantity(totalUnits)} />
      </section>

      <ProductScanner
        inputRef={scanInputRef}
        code={scanCode}
        onCodeChange={setScanCode}
        onSubmit={handleProductScan}
        isScanning={isScanning}
        result={scanResult}
        currency={currency}
        onOpenProduct={openScannedProduct}
        onContinueCreation={
          continueScannedProductCreation
        }
        onClear={clearScanner}
      />

      <FeedbackBanner
        error={error}
        notice={notice}
      />

      {!productConfig.configurationReady ? (
        <RequiredConfiguration
          brandSlug={brand.slug}
          title="Primero configura el giro"
          description="El Product Engine necesita conocer la operación del negocio antes de crear productos."
        />
      ) : null}

      {locations.length === 0 &&
      productConfig.configurationReady ? (
        <RequiredConfiguration
          brandSlug={brand.slug}
          title="Crea una sucursal"
          description="Los productos con inventario directo necesitan una ubicación para guardar su existencia."
        />
      ) : null}

      <section>
        <PosDrawer
          open={isEditorOpen}
          onClose={() => {
            setIsEditorOpen(false);
            setEditingProduct(null);
          }}
          width="large"
          title={isEditing ? "Editar producto" : "Nuevo producto"}
          description={
            isEditing
              ? "Actualiza catálogo y variantes sin modificar existencias."
              : "Configura información, variantes, precios e inventario."
          }
          dismissible={!isSavingProduct}
        >
        <article
          ref={createFormRef}
          id="new-product-form"
          className="scroll-mt-5"
        >
          <SectionTitle
            eyebrow="Información"
            title="Datos del producto"
            description="Los campos disponibles responden a la configuración real del negocio."
          />

          <form
            className="mt-6 grid gap-5"
            onSubmit={handleSaveProduct}
          >
            <div className="grid gap-3 md:grid-cols-2">
              {liveProductTypes.map((option) => {
                const active =
                  productForm.productType ===
                  option.code;

                return (
                  <button
                    key={option.code}
                    type="button"
                    onClick={() =>
                      setProductType(
                        option.code as
                          | "physical"
                          | "service"
                      )
                    }
                    className={`rounded-[20px] border p-4 text-left transition ${
                      active
                        ? "border-cyan-300/30 bg-cyan-300/[0.075]"
                        : "border-white/[0.08] bg-[#06111f]/75"
                    }`}
                  >
                    <p
                      className={`text-sm font-black ${
                        active
                          ? "text-cyan-300"
                          : "text-white"
                      }`}
                    >
                      {option.name}
                    </p>
                    <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>

            <Field
              inputRef={productNameInputRef}
              label={
                productForm.productType ===
                "service"
                  ? "Nombre del servicio"
                  : "Nombre del producto"
              }
              required
              value={productForm.name}
              onChange={(value) =>
                setProductForm((current) => ({
                  ...current,
                  name: value,
                }))
              }
              placeholder={
                productForm.productType ===
                "service"
                  ? "Ajuste personalizado"
                  : "Legging deportivo"
              }
            />

            <TextAreaField
              label="Descripción"
              value={productForm.description}
              onChange={(value) =>
                setProductForm((current) => ({
                  ...current,
                  description: value,
                }))
              }
              placeholder="Descripción comercial"
            />

            <div className="grid gap-4 md:grid-cols-2">
              <SelectField
                label="Categoría"
                value={productForm.categoryId}
                onChange={(value) =>
                  setProductForm((current) => ({
                    ...current,
                    categoryId: value,
                  }))
                }
                options={categories.map(
                  (category) => [
                    category.id,
                    category.name,
                  ]
                )}
              />

              <Field
                label="Impuesto %"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={productForm.taxRate}
                onChange={(value) =>
                  setProductForm((current) => ({
                    ...current,
                    taxRate: value,
                  }))
                }
              />
            </div>

            <QuickCategory
              value={categoryName}
              onChange={setCategoryName}
              onCreate={handleCreateCategory}
              isSaving={isSavingCategory}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <SelectField
                label="Modo de inventario"
                value={productForm.inventoryMode}
                disabled={
                  productForm.productType ===
                  "service"
                }
                onChange={(value) =>
                  setProductForm((current) => ({
                    ...current,
                    inventoryMode:
                      value as "direct" | "none",
                  }))
                }
                options={liveInventoryModes.map(
                  (mode) => [
                    mode.code,
                    mode.name,
                  ]
                )}
              />

              <SelectField
                label="Unidad de venta"
                value={productForm.defaultUnitCode}
                disabled={
                  productForm.productType ===
                  "service"
                }
                onChange={changeDefaultUnit}
                options={units.map((unit) => [
                  unit.code,
                  `${unit.name} · ${unit.symbol}`,
                ])}
              />
            </div>

            {needsInitialInventory ? (
              <SelectField
                label="Sucursal para inventario"
                required
                value={productForm.locationId}
                onChange={(value) =>
                  setProductForm((current) => ({
                    ...current,
                    locationId: value,
                    taxRate: String(
                      locations.find(
                        (location) =>
                          location.id === value
                      )?.tax_rate ??
                        current.taxRate
                    ),
                  }))
                }
                options={locations.map(
                  (location) => [
                    location.id,
                    `${location.name} · ${location.code}`,
                  ]
                )}
              />
            ) : isEditing && needsLocation ? (
              <InfoBox>
                El stock actual se conserva. Los ajustes de existencia se realizan desde Inventario.
              </InfoBox>
            ) : (
              <InfoBox>
                Este concepto no descontará inventario al
                venderse.
              </InfoBox>
            )}

            <ProductImageUploader
              inputRef={productImageInputRef}
              imageUrl={productForm.imageUrl}
              uploading={isUploadingImage}
              error={imageUploadError}
              onFileSelected={uploadProductImage}
              onRemove={removeProductImage}
              onExternalUrlChange={(value) => {
                setImageUploadError(null);
                setProductForm((current) => ({
                  ...current,
                  imageUrl: value,
                }));
              }}
            />

            {productForm.productType ===
              "physical" &&
            productConfig.capabilities
              ?.variants ? (
              <ToggleRow
                title="Producto con variantes"
                description="Cada combinación puede tener precio, SKU y existencia independiente."
                checked={productForm.hasVariants}
                onChange={toggleVariants}
              />
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <ToggleRow
                title="Disponible para venta"
                description="Aparecerá en la terminal."
                checked={productForm.sellable}
                onChange={(checked) =>
                  setProductForm((current) => ({
                    ...current,
                    sellable: checked,
                  }))
                }
              />

              <ToggleRow
                title="Disponible para compra"
                description="Podrá recibir costo y reposición."
                checked={productForm.purchasable}
                disabled={
                  productForm.productType ===
                  "service"
                }
                onChange={(checked) =>
                  setProductForm((current) => ({
                    ...current,
                    purchasable: checked,
                  }))
                }
              />
            </div>

            <div className="border-t border-white/[0.08] pt-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-black text-white">
                    {productForm.hasVariants
                      ? "Variantes"
                      : "Presentación"}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-600">
                    {productForm.hasVariants
                      ? "Configura cada combinación vendible."
                      : "Configura el precio principal."}
                  </p>
                </div>

                {productForm.hasVariants ? (
                  <button
                    type="button"
                    onClick={addVariant}
                    className="rounded-[13px] border border-cyan-300/15 bg-cyan-300/[0.07] px-4 py-2 text-xs font-black text-cyan-300"
                  >
                    + Agregar variante
                  </button>
                ) : null}
              </div>

              <div className="mt-4 grid gap-4">
                {variants.map(
                  (variant, index) => (
                    <VariantEditor
                      key={variant.localId}
                      index={index}
                      variant={variant}
                      attributes={
                        productForm.productType ===
                        "service"
                          ? []
                          : attributes
                      }
                      units={units}
                      currency={currency}
                      hasVariants={
                        productForm.hasVariants
                      }
                      inventoryEnabled={
                        needsInitialInventory
                      }
                      showCurrentStock={isEditing && needsLocation}
                      canRemove={
                        productForm.hasVariants &&
                        variants.length > 1
                      }
                      onChange={(field, value) =>
                        updateVariant(
                          variant.localId,
                          field,
                          value
                        )
                      }
                      onAttributeChange={(
                        attributeCode,
                        value
                      ) =>
                        updateVariantAttribute(
                          variant.localId,
                          attributeCode,
                          value
                        )
                      }
                      onRemove={() =>
                        removeVariant(
                          variant.localId
                        )
                      }
                      onActiveChange={(active) =>
                        setVariantActive(
                          variant.localId,
                          active
                        )
                      }
                    />
                  )
                )}
              </div>
              {isEditing ? (
                <div className="mt-3 grid gap-1 text-xs text-[var(--pos-text-muted)]">
                  <p>Las variantes se administran aquí. Las existencias se reciben y ajustan desde Inventario.</p>
                  <p>Las variantes inactivas conservan sus ventas, inventario y movimientos históricos.</p>
                </div>
              ) : null}
            </div>

            <PosButton
              type="submit"
              size="touch"
              fullWidth
              loading={isSavingProduct}
              disabled={
                isSavingProduct ||
                !productConfig.configurationReady ||
                !productForm.name.trim() ||
                (needsInitialInventory &&
                  locations.length === 0)
              }
            >
              {isSavingProduct
                ? isEditing
                  ? "Guardando cambios..."
                  : "Creando producto..."
                : isEditing
                ? "Guardar cambios"
                : "Crear producto"}
            </PosButton>
          </form>
        </article>
        </PosDrawer>

        <PosSection
          title="Catálogo"
          description="Productos, servicios y variantes disponibles."
        >
          <div className="grid gap-2 rounded-[var(--pos-radius-md)] bg-[var(--pos-panel)] p-3 md:grid-cols-[minmax(240px,1fr)_auto]">
            <form
              className="flex gap-2"
              onSubmit={handleSearch}
            >
              <input
                value={searchInput}
                onChange={(event) =>
                  setSearchInput(event.target.value)
                }
                placeholder="Buscar producto"
                className="pos-ui-focus h-10 min-w-0 flex-1 rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] bg-[var(--pos-canvas)] px-3 text-sm text-[var(--pos-text-primary)] outline-none placeholder:text-[var(--pos-text-muted)] md:w-72"
              />
              <PosButton
                type="submit"
                variant="secondary"
                size="compact"
              >
                Buscar
              </PosButton>
            </form>
          </div>

          {products.length > 0 ? (
            <>
              <div className="hidden md:block">
                <PosDataTable caption="Catálogo de productos" density="compact" minWidth={820}>
                  <thead className="bg-[var(--pos-panel-raised)] text-left text-[11px] font-semibold text-[var(--pos-text-muted)]">
                    <tr>
                      <th>Producto</th>
                      <th>SKU / código</th>
                      <th className="hidden lg:table-cell">Categoría</th>
                      <th className="text-right">Variantes</th>
                      <th className="text-right">Precio</th>
                      <th className="text-right">Stock</th>
                      <th>Estado</th>
                      <th className="text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => (
                      <ProductTableRow
                        key={product.id}
                        product={product}
                        currency={currency}
                        onOpen={() => setSelectedCatalogProduct(product)}
                        onEdit={() => openEditProduct(product)}
                        onToggleActive={() => setActiveChangeProduct(product)}
                      />
                    ))}
                  </tbody>
                </PosDataTable>
              </div>
              <div className="grid gap-2 md:hidden">
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    currency={currency}
                    onOpen={() => setSelectedCatalogProduct(product)}
                    onEdit={() => openEditProduct(product)}
                    onToggleActive={() => setActiveChangeProduct(product)}
                  />
                ))}
              </div>
            </>
          ) : (
            <EmptyCatalog
              hasSearch={Boolean(appliedSearch)}
              onClear={() => {
                setSearchInput("");
                setAppliedSearch("");
              }}
            />
          )}
        </PosSection>
      </section>

      <ProductDetailDrawer
        product={selectedCatalogProduct}
        currency={currency}
        onClose={() => setSelectedCatalogProduct(null)}
      />

      <PosModal
        open={Boolean(activeChangeProduct)}
        onClose={() => setActiveChangeProduct(null)}
        title={
          activeChangeProduct?.active
            ? "Desactivar producto"
            : "Activar producto"
        }
        description={
          activeChangeProduct?.active
            ? "Dejará de estar disponible para nuevas ventas. Las ventas, variantes e inventario históricos se conservan y podrás reactivarlo después."
            : "El producto volverá a estar disponible según sus flags de venta y el estado individual de sus variantes."
        }
        size="small"
        dismissible={!isChangingActive}
        footer={
          <>
            <PosButton
              variant="ghost"
              onClick={() => setActiveChangeProduct(null)}
              disabled={isChangingActive}
            >
              Cancelar
            </PosButton>
            <PosButton
              variant={activeChangeProduct?.active ? "danger" : "primary"}
              loading={isChangingActive}
              onClick={changeProductActive}
            >
              {activeChangeProduct?.active ? "Desactivar" : "Activar"}
            </PosButton>
          </>
        }
      >
        <p className="text-sm text-[var(--pos-text-secondary)]">
          {activeChangeProduct?.name}
        </p>
      </PosModal>
    </PosPage>
  );
}

function VariantEditor({
  index,
  variant,
  attributes,
  units,
  currency,
  hasVariants,
  inventoryEnabled,
  showCurrentStock,
  canRemove,
  onChange,
  onAttributeChange,
  onRemove,
  onActiveChange,
}: {
  index: number;
  variant: VariantForm;
  attributes: AttributeDefinition[];
  units: UnitOption[];
  currency: string;
  hasVariants: boolean;
  inventoryEnabled: boolean;
  showCurrentStock: boolean;
  canRemove: boolean;
  onChange: (
    field:
      | "name"
      | "sku"
      | "barcode"
      | "price"
      | "cost"
      | "initialQuantity"
      | "minimumQuantity"
      | "unitCode"
      | "imageUrl",
    value: string
  ) => void;
  onAttributeChange: (
    attributeCode: string,
    value: string
  ) => void;
  onRemove: () => void;
  onActiveChange: (active: boolean) => void;
}) {
  return (
    <div className="border-t border-[var(--pos-line-subtle)] pt-4 first:border-0 first:pt-0">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-[var(--pos-text-primary)]">
              {hasVariants
                ? `Variante ${index + 1}`
                : "Presentación principal"}
            </p>
            <PosBadge
              tone={!variant.id ? "info" : variant.active ? "success" : "neutral"}
              size="compact"
              dot
            >
              {!variant.id ? "Nueva" : variant.active ? "Activa" : "Inactiva"}
            </PosBadge>
          </div>
          <p className="mt-1 text-xs text-[var(--pos-text-muted)]">
            Precio, identificación y existencia.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {variant.id ? (
            <button
              type="button"
              onClick={() => onActiveChange(!variant.active)}
              className={`pos-ui-focus h-9 rounded-[var(--pos-radius-sm)] px-3 text-xs font-semibold ${
                variant.active
                  ? "text-[var(--pos-danger)] hover:bg-[var(--pos-danger-soft)]"
                  : "text-[var(--pos-primary)] hover:bg-[var(--pos-primary-soft)]"
              }`}
            >
              {variant.active ? "Desactivar" : "Reactivar"}
            </button>
          ) : canRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="pos-ui-focus h-9 rounded-[var(--pos-radius-sm)] px-3 text-xs font-semibold text-[var(--pos-danger)] hover:bg-[var(--pos-danger-soft)]"
            >
              Quitar
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid gap-3">
        <Field
          label="Nombre de la variante"
          value={variant.name}
          onChange={(value) =>
            onChange("name", value)
          }
          placeholder={
            hasVariants
              ? "Negro · Mediana"
              : "Única"
          }
        />

        {attributes.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {attributes.map((attribute) => (
              <AttributeField
                key={attribute.id}
                attribute={attribute}
                value={
                  variant.attributes[
                    attribute.code
                  ] || ""
                }
                onChange={(value) =>
                  onAttributeChange(
                    attribute.code,
                    value
                  )
                }
              />
            ))}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <MoneyField
            label={`Precio · ${currency}`}
            value={variant.price}
            onChange={(value) =>
              onChange("price", value)
            }
            required
          />

          <MoneyField
            label={`Costo · ${currency}`}
            value={variant.cost}
            onChange={(value) =>
              onChange("cost", value)
            }
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="SKU"
            value={variant.sku}
            onChange={(value) =>
              onChange(
                "sku",
                value.toUpperCase()
              )
            }
            placeholder="Opcional"
          />

          <Field
            label="Código de barras"
            value={variant.barcode}
            onChange={(value) =>
              onChange("barcode", value)
            }
            placeholder="Opcional"
          />
        </div>

        <SelectField
          label="Unidad"
          value={variant.unitCode}
          onChange={(value) =>
            onChange("unitCode", value)
          }
          options={units.map((unit) => [
            unit.code,
            `${unit.name} · ${unit.symbol}`,
          ])}
        />

        {inventoryEnabled ? (
          <div className="grid gap-4 md:grid-cols-2">
            <MoneyField
              label="Existencia inicial"
              value={variant.initialQuantity}
              onChange={(value) =>
                onChange(
                  "initialQuantity",
                  value
                )
              }
              step="0.001"
            />

            <MoneyField
              label="Existencia mínima"
              value={variant.minimumQuantity}
              onChange={(value) =>
                onChange(
                  "minimumQuantity",
                  value
                )
              }
              step="0.001"
            />
          </div>
        ) : null}

        {showCurrentStock ? (
          <InfoBox>
            Stock actual: {formatQuantity(variant.currentStock)}. Edítalo desde Inventario; guardar este formulario no modifica existencias.
          </InfoBox>
        ) : null}

        <Field
          label="Imagen de esta variante"
          value={variant.imageUrl}
          onChange={(value) =>
            onChange("imageUrl", value)
          }
          placeholder="Opcional"
        />
      </div>
    </div>
  );
}

function AttributeField({
  attribute,
  value,
  onChange,
}: {
  attribute: AttributeDefinition;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = Array.isArray(
    attribute.options
  )
    ? attribute.options.map(String)
    : [];

  if (
    attribute.input_type === "select" &&
    options.length > 0
  ) {
    return (
      <SelectField
        label={`${attribute.name}${
          attribute.required ? " *" : ""
        }`}
        value={value}
        onChange={onChange}
        options={options.map((option) => [
          option,
          option,
        ])}
      />
    );
  }

  return (
    <Field
      label={`${attribute.name}${
        attribute.required ? " *" : ""
      }`}
      type={
        attribute.input_type === "number"
          ? "number"
          : "text"
      }
      value={value}
      onChange={onChange}
      placeholder={`Escribe ${attribute.name.toLowerCase()}`}
    />
  );
}

function ProductDetailDrawer({
  product,
  currency,
  onClose,
}: {
  product: Product | null;
  currency: string;
  onClose: () => void;
}) {
  return (
    <PosDrawer
      open={Boolean(product)}
      onClose={onClose}
      width="medium"
      title={product?.name || "Producto"}
      description="Variantes, identificación, precio y disponibilidad."
    >
      {product ? (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <PosBadge tone={product.active && product.sellable ? "success" : "neutral"} dot>
              {product.active && product.sellable ? "Activo" : "Inactivo"}
            </PosBadge>
            <PosBadge tone="neutral">{product.category?.name || "Sin categoría"}</PosBadge>
          </div>
          <div className="overflow-hidden rounded-[var(--pos-radius-md)] bg-[var(--pos-canvas)]">
            {product.variants.map((variant) => (
              <div key={variant.id} className="border-b border-[var(--pos-line-subtle)] p-3 last:border-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--pos-text-primary)]">{variant.name}</p>
                    <p className="mt-1 truncate text-[11px] text-[var(--pos-text-muted)]">
                      {formatAttributes(variant.attributes)}
                    </p>
                  </div>
                  <p className="whitespace-nowrap text-sm font-semibold text-[var(--pos-text-primary)]">{formatMoney(variant.price, currency)}</p>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-[var(--pos-text-secondary)]">
                  <span className="truncate font-mono">{variant.sku || "Sin SKU"}</span>
                  <span className="truncate font-mono">{variant.barcode || "Sin código"}</span>
                  <span className="text-right">{product.inventory_mode === "none" ? "Sin inventario" : `${formatQuantity(variant.stock.available)} disp.`}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </PosDrawer>
  );
}

function ProductTableRow({
  product,
  currency,
  onOpen,
  onEdit,
  onToggleActive,
}: {
  product: Product;
  currency: string;
  onOpen: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
}) {
  const primaryVariant = product.variants[0];
  const priceLabel =
    product.summary.minimumPrice === product.summary.maximumPrice
      ? formatMoney(product.summary.minimumPrice, currency)
      : `${formatMoney(product.summary.minimumPrice, currency)} – ${formatMoney(product.summary.maximumPrice, currency)}`;
  const availableStock = Number(product.summary.availableStock || 0);
  const stockTone =
    product.inventory_mode === "none"
      ? "neutral"
      : availableStock <= 0
      ? "danger"
      : "success";

  return (
    <tr id={`product-${product.id}`} className="scroll-mt-5 border-t border-[var(--pos-line-subtle)] text-xs text-[var(--pos-text-secondary)]">
      <td>
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[var(--pos-radius-sm)] bg-white/[0.05]">
            <PosProductImage src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0">
            <p className="max-w-64 truncate text-sm font-semibold text-[var(--pos-text-primary)]">{product.name}</p>
            <p className="mt-0.5 text-[11px] text-[var(--pos-text-muted)]">{product.product_type === "service" ? "Servicio" : "Producto físico"}</p>
          </div>
        </div>
      </td>
      <td>
        <span className="block max-w-40 truncate font-mono text-[11px]">
          {primaryVariant?.sku || primaryVariant?.barcode || "—"}
        </span>
      </td>
      <td className="hidden lg:table-cell">{product.category?.name || "Sin categoría"}</td>
      <td className="text-right">{product.summary.variantCount}</td>
      <td className="whitespace-nowrap text-right font-semibold text-[var(--pos-text-primary)]">{priceLabel}</td>
      <td className="text-right">
        <PosBadge tone={stockTone} size="compact">
          {product.inventory_mode === "none" ? "No aplica" : formatQuantity(availableStock)}
        </PosBadge>
      </td>
      <td>
        <PosBadge tone={product.active && product.sellable ? "success" : product.active ? "warning" : "neutral"} size="compact" dot>
          {product.active && product.sellable ? "Activo" : product.active ? "No vendible" : "Inactivo"}
        </PosBadge>
      </td>
      <td className="text-right">
        <div className="flex items-center justify-end gap-1">
          <button type="button" onClick={onOpen} className="pos-ui-focus h-9 rounded-[var(--pos-radius-sm)] px-3 text-xs font-semibold text-[var(--pos-primary)] hover:bg-[var(--pos-primary-soft)]">
            Ver variantes
          </button>
          <details className="group relative">
            <summary
              aria-label={`Acciones de ${product.name}`}
              className="pos-ui-focus flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-[var(--pos-radius-sm)] text-lg text-[var(--pos-text-secondary)] hover:bg-white/[0.05] hover:text-[var(--pos-text-primary)]"
            >
              ⋯
            </summary>
            <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-[var(--pos-radius-md)] border border-[var(--pos-line)] bg-[var(--pos-panel-raised)] p-1 text-left shadow-[var(--pos-shadow-overlay)]">
              <button type="button" onClick={onEdit} className="pos-ui-focus h-10 w-full rounded-[var(--pos-radius-sm)] px-3 text-left text-xs font-medium text-[var(--pos-text-primary)] hover:bg-white/[0.05]">
                Editar producto
              </button>
              <button type="button" onClick={onToggleActive} className={`pos-ui-focus h-10 w-full rounded-[var(--pos-radius-sm)] px-3 text-left text-xs font-medium hover:bg-white/[0.05] ${product.active ? "text-[var(--pos-danger)]" : "text-[var(--pos-primary)]"}`}>
                {product.active ? "Desactivar producto" : "Activar producto"}
              </button>
            </div>
          </details>
        </div>
      </td>
    </tr>
  );
}

function ProductCard({
  product,
  currency,
  onOpen,
  onEdit,
  onToggleActive,
}: {
  product: Product;
  currency: string;
  onOpen: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
}) {
  const priceLabel =
    product.summary.minimumPrice ===
    product.summary.maximumPrice
      ? formatMoney(
          product.summary.minimumPrice,
          currency
        )
      : `${formatMoney(
          product.summary.minimumPrice,
          currency
        )} – ${formatMoney(
          product.summary.maximumPrice,
          currency
        )}`;

  return (
    <div
      id={`product-${product.id}`}
      className="scroll-mt-5 rounded-[var(--pos-radius-md)] bg-[var(--pos-panel)] p-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[var(--pos-radius-sm)] bg-white/[0.05]">
          <PosProductImage src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-[var(--pos-text-primary)]">
                {product.name}
              </h3>
              <p className="mt-1 truncate text-xs text-[var(--pos-text-muted)]">
                {product.category?.name || "Sin categoría"} · {product.summary.variantCount} variantes
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold text-[var(--pos-text-primary)]">
                {priceLabel}
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--pos-line-subtle)] pt-3">
            <PosBadge tone={product.active && product.sellable ? "success" : "neutral"} size="compact" dot>
              {product.active && product.sellable ? "Activo" : "Inactivo"}
            </PosBadge>
            <p className="text-xs text-[var(--pos-text-secondary)]">
              {product.inventory_mode === "none" ? "Sin inventario" : `${formatQuantity(product.summary.availableStock)} disponibles`}
            </p>
          </div>
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <button type="button" onClick={onOpen} className="pos-ui-focus h-10 rounded-[var(--pos-radius-sm)] bg-white/[0.04] text-xs font-semibold text-[var(--pos-primary)]">
              Ver variantes
            </button>
            <details className="group relative">
              <summary aria-label={`Acciones de ${product.name}`} className="pos-ui-focus flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-[var(--pos-radius-sm)] bg-white/[0.04] text-lg text-[var(--pos-text-secondary)]">
                ⋯
              </summary>
              <div className="absolute bottom-11 right-0 z-20 w-48 overflow-hidden rounded-[var(--pos-radius-md)] border border-[var(--pos-line)] bg-[var(--pos-panel-raised)] p-1 shadow-[var(--pos-shadow-overlay)]">
                <button type="button" onClick={onEdit} className="h-10 w-full rounded-[var(--pos-radius-sm)] px-3 text-left text-xs font-medium text-[var(--pos-text-primary)] hover:bg-white/[0.05]">Editar producto</button>
                <button type="button" onClick={onToggleActive} className={`h-10 w-full rounded-[var(--pos-radius-sm)] px-3 text-left text-xs font-medium hover:bg-white/[0.05] ${product.active ? "text-[var(--pos-danger)]" : "text-[var(--pos-primary)]"}`}>
                  {product.active ? "Desactivar producto" : "Activar producto"}
                </button>
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}


function ProductScanner({
  inputRef,
  code,
  onCodeChange,
  onSubmit,
  isScanning,
  result,
  currency,
  onOpenProduct,
  onContinueCreation,
  onClear,
}: {
  inputRef: Ref<HTMLInputElement>;
  code: string;
  onCodeChange: (value: string) => void;
  onSubmit: (
    event: FormEvent<HTMLFormElement>
  ) => void;
  isScanning: boolean;
  result: ProductScanResponse | null;
  currency: string;
  onOpenProduct: () => void;
  onContinueCreation: () => void;
  onClear: () => void;
}) {
  return (
    <section className="rounded-[var(--pos-radius-md)] bg-[var(--pos-panel)] p-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-center">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-[var(--pos-text-primary)]">Scanner</p>
            <PosBadge tone="neutral" size="compact">F2</PosBadge>
          </div>

          <form
            onSubmit={onSubmit}
            className="mt-2 flex gap-2"
          >
            <div className="relative min-w-0 flex-1">
              <input
                ref={inputRef}
                autoFocus
                autoComplete="off"
                inputMode="text"
                value={code}
                onChange={(event) =>
                  onCodeChange(event.target.value)
                }
                placeholder="Escanea o escribe el código"
                className="pos-ui-focus h-11 w-full rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] bg-[var(--pos-canvas)] px-3 pr-11 font-mono text-sm font-medium text-[var(--pos-text-primary)] outline-none placeholder:font-sans placeholder:text-[var(--pos-text-muted)]"
              />

              <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-cyan-300">
                <PosIcon
                  name="product"
                  className="h-5 w-5"
                />
              </div>
            </div>

            <PosButton
              type="submit"
              size="compact"
              loading={isScanning}
              disabled={
                isScanning || !code.trim()
              }
            >
              {isScanning
                ? "Buscando..."
                : "Buscar código"}
            </PosButton>
          </form>
        </div>

        <div className="rounded-[var(--pos-radius-sm)] bg-[var(--pos-canvas)] p-3">
          {!result ? (
            <div className="flex min-h-11 items-center gap-3 text-xs text-[var(--pos-text-muted)]">
              <PosIcon name="barcode" className="h-4 w-4" />
              Esperando SKU o código de barras
            </div>
          ) : result.found ? (
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <PosBadge tone="success" size="compact">Encontrado</PosBadge>

                  <h4 className="mt-2 text-sm font-semibold text-[var(--pos-text-primary)]">
                    {result.variant.product.name}
                  </h4>

                  <p className="mt-1 text-xs font-bold text-slate-500">
                    {result.variant.name}
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

              <div className="mt-3 grid grid-cols-3 gap-2">
                <ScanMetric
                  label="Coincidencia"
                  value={
                    result.matchType === "barcode"
                      ? "Código"
                      : "SKU"
                  }
                />
                <ScanMetric
                  label="Precio"
                  value={formatMoney(
                    result.variant.price,
                    currency
                  )}
                />
                <ScanMetric
                  label="Disponible"
                  value={formatQuantity(
                    result.variant.stock.available
                  )}
                />
              </div>

              <button
                type="button"
                onClick={onOpenProduct}
                className="pos-ui-focus mt-3 flex h-10 w-full items-center justify-center rounded-[var(--pos-radius-sm)] bg-[var(--pos-success-soft)] px-3 text-xs font-semibold text-[var(--pos-success)]"
              >
                Ver producto en catálogo
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <PosBadge tone="warning" size="compact">Código nuevo</PosBadge>

                  <h4 className="mt-2 text-sm font-semibold text-[var(--pos-text-primary)]">
                    No está registrado
                  </h4>

                  <p className="mt-1 break-all font-mono text-xs font-black text-cyan-300">
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

              <p className="mt-3 text-xs leading-5 text-[var(--pos-text-muted)]">
                Se colocó automáticamente como{" "}
                {result.suggestedField === "barcode"
                  ? "código de barras"
                  : "SKU"}{" "}
                de la primera variante.
              </p>

              <button
                type="button"
                onClick={onContinueCreation}
                className="pos-ui-focus mt-3 flex h-10 w-full items-center justify-center rounded-[var(--pos-radius-sm)] bg-[var(--pos-warning)] px-3 text-xs font-semibold text-slate-950"
              >
                Completar información
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ScanMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-[13px] bg-white/[0.035] p-3">
      <p className="text-[7px] font-black uppercase tracking-[0.1em] text-slate-700">
        {label}
      </p>
      <p className="mt-1 truncate text-[11px] font-black text-slate-300">
        {value}
      </p>
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  description,
  compact = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-[var(--pos-text-muted)]">
        {eyebrow}
      </p>
      <h3
        className={`mt-1 font-semibold tracking-[-0.025em] text-[var(--pos-text-primary)] ${
          compact
            ? "text-base"
            : "text-lg"
        }`}
      >
        {title}
      </h3>
      <p className="mt-1 text-xs leading-5 text-[var(--pos-text-muted)]">
        {description}
      </p>
    </div>
  );
}

function RequiredConfiguration({
  brandSlug,
  title,
  description,
}: {
  brandSlug: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[26px] border border-amber-300/15 bg-amber-300/[0.055] p-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-200">
            Configuración requerida
          </p>
          <h3 className="mt-2 text-2xl font-black text-white">
            {title}
          </h3>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            {description}
          </p>
        </div>

        <Link
          href={buildPosHref(
            brandSlug,
            "settings"
          )}
          className="flex h-12 items-center justify-center rounded-[15px] bg-amber-300 px-6 text-sm font-black text-slate-950"
        >
          Abrir configuración
        </Link>
      </div>
    </div>
  );
}

function QuickCategory({
  value,
  onChange,
  onCreate,
  isSaving,
}: {
  value: string;
  onChange: (value: string) => void;
  onCreate: () => void;
  isSaving: boolean;
}) {
  return (
    <div className="flex gap-2 rounded-[var(--pos-radius-sm)] bg-[var(--pos-canvas)] p-2">
      <input
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        placeholder="Crear categoría rápida"
        className="h-10 min-w-0 flex-1 bg-transparent px-2 text-sm text-[var(--pos-text-primary)] outline-none placeholder:text-[var(--pos-text-muted)]"
      />

      <button
        type="button"
        onClick={onCreate}
        disabled={
          isSaving || !value.trim()
        }
        className="rounded-[var(--pos-radius-sm)] bg-white/[0.06] px-3 text-xs font-semibold text-[var(--pos-primary)] disabled:opacity-40"
      >
        {isSaving ? "Guardando..." : "Crear"}
      </button>
    </div>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-center justify-between gap-4 rounded-[var(--pos-radius-sm)] bg-[var(--pos-canvas)] p-3 ${
        disabled
          ? "cursor-not-allowed opacity-45"
          : "cursor-pointer"
      }`}
    >
      <div>
        <p className="text-sm font-semibold text-[var(--pos-text-primary)]">
          {title}
        </p>
        <p className="mt-1 text-xs leading-5 text-[var(--pos-text-muted)]">
          {description}
        </p>
      </div>

      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) =>
          onChange(event.target.checked)
        }
        className="h-5 w-5 accent-cyan-300"
      />
    </label>
  );
}

function InfoBox({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--pos-radius-sm)] bg-[var(--pos-info-soft)] p-3 text-xs leading-5 text-[var(--pos-info)]">
      {children}
    </div>
  );
}

function Metric({
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
      <p className="mt-2 text-xl font-semibold tracking-[-0.035em] text-[var(--pos-text-primary)]">
        {value}
      </p>
    </PosCard>
  );
}

function MiniMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[14px] bg-white/[0.035] p-3">
      <p className="text-[7px] font-black uppercase tracking-[0.12em] text-slate-700">
        {label}
      </p>
      <p className="mt-1 text-xs font-black text-slate-300">
        {value}
      </p>
    </div>
  );
}

function EmptyCatalog({
  hasSearch,
  onClear,
}: {
  hasSearch: boolean;
  onClear: () => void;
}) {
  return (
    <div className="flex min-h-52 items-center justify-center rounded-[var(--pos-radius-md)] border border-dashed border-[var(--pos-line)] bg-[var(--pos-panel)] p-5 text-center">
      <div className="max-w-sm">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-[var(--pos-radius-sm)] bg-white/[0.05] text-[var(--pos-text-secondary)]">
          <PosIcon
            name="product"
            className="h-7 w-7"
          />
        </div>

        <h4 className="mt-4 text-base font-semibold text-[var(--pos-text-primary)]">
          {hasSearch
            ? "No encontramos coincidencias"
            : "Tu catálogo está vacío"}
        </h4>

        <p className="mt-2 text-sm leading-6 text-[var(--pos-text-muted)]">
          {hasSearch
            ? "Prueba con otro término o elimina el filtro."
            : "Crea el primer producto para conectarlo con inventario y ventas."}
        </p>

        {hasSearch ? (
          <button
            type="button"
            onClick={onClear}
            className="mt-5 rounded-[14px] bg-white/[0.07] px-5 py-3 text-xs font-black text-cyan-300"
          >
            Limpiar búsqueda
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ProductImageUploader({
  inputRef,
  imageUrl,
  uploading,
  error,
  onFileSelected,
  onRemove,
  onExternalUrlChange,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  imageUrl: string;
  uploading: boolean;
  error: string | null;
  onFileSelected: (file: File) => void;
  onRemove: () => void;
  onExternalUrlChange: (value: string) => void;
}) {
  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();

    if (uploading) return;

    const file = event.dataTransfer.files[0];
    if (file) onFileSelected(file);
  }

  return (
    <section className="space-y-3" aria-labelledby="product-image-heading">
      <div>
        <h3
          id="product-image-heading"
          className="text-sm font-semibold text-[var(--pos-text-primary)]"
        >
          Imagen del producto
        </h3>
        <p className="mt-1 text-xs text-[var(--pos-text-secondary)]">
          JPG, PNG o WEBP. Máximo 5 MB.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFileSelected(file);
        }}
      />

      {imageUrl ? (
        <div className="flex items-center gap-4 rounded-[var(--pos-radius-md)] bg-white/[0.035] p-3">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[var(--pos-radius-sm)] bg-white/[0.05]">
            <PosProductImage src={imageUrl} alt="Vista previa del producto" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[var(--pos-text-primary)]">
              Imagen principal
            </p>
            <p className="mt-1 text-xs text-[var(--pos-text-secondary)]">
              Se mostrará en el catálogo y en Nueva venta.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <PosButton
                type="button"
                variant="secondary"
                size="compact"
                loading={uploading}
                onClick={() => inputRef.current?.click()}
              >
                Cambiar imagen
              </PosButton>
              <PosButton
                type="button"
                variant="danger"
                size="compact"
                disabled={uploading}
                onClick={onRemove}
              >
                Eliminar
              </PosButton>
            </div>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-label="Seleccionar imagen del producto"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          onClick={() => inputRef.current?.click()}
          className="pos-ui-focus flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-[var(--pos-radius-md)] border border-dashed border-[var(--pos-line-strong)] bg-white/[0.025] px-5 py-6 text-center transition-colors duration-150 hover:bg-white/[0.045]"
        >
          <PosIcon
            name="upload"
            className="h-5 w-5 text-[var(--pos-primary)]"
          />
          <p className="mt-3 text-sm font-semibold text-[var(--pos-text-primary)]">
            {uploading ? "Subiendo imagen..." : "Subir imagen"}
          </p>
          <p className="mt-1 text-xs text-[var(--pos-text-secondary)]">
            Selecciona un archivo o arrástralo aquí.
          </p>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-xs text-[var(--pos-danger)]">
          {error}
        </p>
      ) : null}

      <details className="group">
        <summary className="cursor-pointer text-xs font-medium text-[var(--pos-text-secondary)] hover:text-[var(--pos-text-primary)]">
          Opciones avanzadas · Usar URL externa
        </summary>
        <div className="mt-3">
          <Field
            label="URL externa"
            value={imageUrl}
            onChange={onExternalUrlChange}
            placeholder="https://..."
          />
          <p className="mt-2 text-xs text-[var(--pos-text-muted)]">
            Compatible con imágenes históricas. COMETA no eliminará archivos externos.
          </p>
        </div>
      </details>
    </section>
  );
}

function Field({
  inputRef,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
  min,
  max,
  step,
}: {
  inputRef?: Ref<HTMLInputElement>;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  min?: string;
  max?: string;
  step?: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-medium text-[var(--pos-text-muted)]">
        {label}
        {required ? " *" : ""}
      </span>

      <input
        ref={inputRef}
        type={type}
        required={required}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        placeholder={placeholder}
        className="pos-ui-focus h-11 rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] bg-[var(--pos-canvas)] px-3 text-sm text-[var(--pos-text-primary)] outline-none placeholder:text-[var(--pos-text-muted)]"
      />
    </label>
  );
}

function MoneyField({
  label,
  value,
  onChange,
  required,
  step = "0.01",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  step?: string;
}) {
  return (
    <Field
      label={label}
      type="number"
      min="0"
      step={step}
      required={required}
      value={value}
      onChange={onChange}
      placeholder="0"
    />
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
  onChange: (value: string) => void;
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
          onChange(event.target.value)
        }
        placeholder={placeholder}
        className="pos-ui-focus rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] bg-[var(--pos-canvas)] px-3 py-3 text-sm text-[var(--pos-text-primary)] outline-none placeholder:text-[var(--pos-text-muted)]"
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
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-medium text-[var(--pos-text-muted)]">
        {label}
        {required ? " *" : ""}
      </span>

      <select
        required={required}
        disabled={disabled}
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="pos-ui-focus h-11 rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] bg-[var(--pos-canvas)] px-3 text-sm text-[var(--pos-text-primary)] outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="">Seleccionar</option>

        {options.map(
          ([optionValue, optionLabel]) => (
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

function buildVariantName(
  variant: VariantForm,
  attributes: AttributeDefinition[],
  index: number
) {
  const parts = attributes
    .filter(
      (attribute) =>
        attribute.use_in_variant_name
    )
    .map(
      (attribute) =>
        variant.attributes[
          attribute.code
        ]?.trim()
    )
    .filter(Boolean);

  return parts.length > 0
    ? parts.join(" · ")
    : index === 0
    ? "Única"
    : `Variante ${index + 1}`;
}

function formatAttributes(
  attributes: Record<string, unknown>
) {
  const values = Object.values(
    attributes || {}
  )
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return values.length > 0
    ? values.join(" · ")
    : "Presentación única";
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: 3,
  }).format(Number(value || 0));
}

function formatMoney(
  value: number,
  currency = "MXN"
) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

async function apiRequest<T = unknown>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      ...(!isFormData
        ? { "Content-Type": "application/json" }
        : {}),
      ...(init?.headers || {}),
    },
  });

  const data = await response.json();

  if (!response.ok || !data?.ok) {
    throw new Error(
      data?.error ||
        data?.message ||
        "No se pudo completar la operación."
    );
  }

  return data as T;
}

async function deleteManagedProductImage(
  imageUrl: string,
  brandSlug: string
) {
  await apiRequest(
    `/api/pos/product-images?brandSlug=${encodeURIComponent(brandSlug)}`,
    {
      method: "DELETE",
      body: JSON.stringify({ imageUrl }),
    }
  );
}

function isManagedProductImageUrl(imageUrl: string, brandSlug: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!supabaseUrl) return false;

  try {
    const parsedImageUrl = new URL(imageUrl);
    const parsedSupabaseUrl = new URL(supabaseUrl);
    const prefix = "/storage/v1/object/public/pos-products/";

    if (
      parsedImageUrl.origin !== parsedSupabaseUrl.origin ||
      !parsedImageUrl.pathname.startsWith(prefix)
    ) {
      return false;
    }

    const storagePath = decodeURIComponent(
      parsedImageUrl.pathname.slice(prefix.length)
    );

    return storagePath.split("/")[0] === brandSlug;
  } catch {
    return false;
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado.";
}
