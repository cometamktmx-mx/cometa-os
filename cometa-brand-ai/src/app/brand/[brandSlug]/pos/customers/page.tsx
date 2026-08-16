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

type Customer = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  birthday: string | null;
  marketing_consent: boolean;
  wallet_consent: boolean;
  tags: unknown;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  loyalty_member:
    | LoyaltyMember
    | LoyaltyMember[]
    | null;
};

type CustomersResponse = {
  ok: true;
  customers: Customer[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type CreateCustomerResponse = {
  ok: true;
  customer: Customer;
};

type CustomerSale = {
  id: string;
  sale_number: string;
  sold_at: string;
  total: number;
  status: string;
  items: Array<{ id: string; product_name: string; variant_name: string; quantity: number }>;
};

type CustomerSalesResponse = {
  ok: true;
  sales: CustomerSale[];
  pagination: { total: number };
};

type LoyaltyProgram = {
  id: string;
  name: string;
  points_per_currency: number;
  redemption_value: number;
  minimum_redeem_points: number;
  points_expire_days: number | null;
  active: boolean;
};

type LoyaltyResponse = {
  ok: true;
  program: LoyaltyProgram | null;
  counts: {
    members: number;
    rewards: number;
    walletPasses: number;
  };
};

type VisitProgressProgram = {
  id: string;
  name: string;
  requiredVisits: number;
  minimumSaleAmount: number;
  active: boolean;
  completedVisits: number;
  cyclesCompleted: number;
  currentProgress: number;
};

type RewardUnlock = {
  id: string;
  visitProgramId: string;
  rewardName: string;
  rewardValue: number;
  cycleNumber: number;
  unlockedAt: string;
};

type VisitProgressResponse = {
  ok: true;
  member: { id: string; status: string } | null;
  programs: VisitProgressProgram[];
};

type RewardUnlocksResponse = {
  ok: true;
  unlocks: RewardUnlock[];
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
};

type BootstrapResponse = {
  ok: true;
  branding: Branding;
};

type CustomerFilter =
  | "all"
  | "members"
  | "not_members"
  | "marketing"
  | "birthdays";

type CustomerForm = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  birthday: string;
  marketingConsent: boolean;
  walletConsent: boolean;
  notes: string;
  tags: string;
  joinLoyalty: boolean;
};

const EMPTY_FORM: CustomerForm = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  birthday: "",
  marketingConsent: false,
  walletConsent: false,
  notes: "",
  tags: "",
  joinLoyalty: true,
};

export default function PosCustomersPage() {
  const { brand } = usePosContext();

  const [customers, setCustomers] = useState<
    Customer[]
  >([]);
  const [program, setProgram] =
    useState<LoyaltyProgram | null>(null);
  const [branding, setBranding] =
    useState<Branding | null>(null);
  const [totalCustomers, setTotalCustomers] =
    useState(0);

  const [search, setSearch] = useState("");
  const [filter, setFilter] =
    useState<CustomerFilter>("all");

  const [
    selectedCustomer,
    setSelectedCustomer,
  ] = useState<Customer | null>(null);
  const [customerVisitProgress, setCustomerVisitProgress] = useState<VisitProgressProgram[]>([]);
  const [customerRewardUnlocks, setCustomerRewardUnlocks] = useState<RewardUnlock[]>([]);
  const [customerSales, setCustomerSales] = useState<CustomerSale[]>([]);
  const [customerSalesTotal, setCustomerSalesTotal] = useState(0);
  const [isLoadingCustomerVisits, setIsLoadingCustomerVisits] = useState(false);
  const [customerVisitsError, setCustomerVisitsError] = useState<string | null>(null);
  const customerVisitsRequestRef = useRef(0);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const [
    isCreateModalOpen,
    setIsCreateModalOpen,
  ] = useState(false);

  const [form, setForm] =
    useState<CustomerForm>(EMPTY_FORM);

  useEffect(() => {
    const customerId = selectedCustomer?.id;
    const requestId = customerVisitsRequestRef.current + 1;
    customerVisitsRequestRef.current = requestId;
    setCustomerVisitProgress([]);
    setCustomerRewardUnlocks([]);
    setCustomerSales([]);
    setCustomerSalesTotal(0);
    setCustomerVisitsError(null);

    if (!customerId) {
      setIsLoadingCustomerVisits(false);
      return;
    }

    setIsLoadingCustomerVisits(true);
    const query = `brandSlug=${encodeURIComponent(brand.slug)}&customerId=${encodeURIComponent(customerId)}`;
    void Promise.allSettled([
      apiRequest<VisitProgressResponse>(`/api/pos/loyalty?${query}&view=visit_progress`),
      apiRequest<RewardUnlocksResponse>(`/api/pos/loyalty?${query}&view=reward_unlocks`),
      apiRequest<CustomerSalesResponse>(`/api/pos/sales?${query}&status=completed&pageSize=100`),
    ]).then(([progressResult, unlocksResult, salesResult]) => {
      if (customerVisitsRequestRef.current !== requestId) return;
      setCustomerVisitProgress(progressResult.status === "fulfilled" ? progressResult.value.programs || [] : []);
      setCustomerRewardUnlocks(unlocksResult.status === "fulfilled" ? unlocksResult.value.unlocks || [] : []);
      setCustomerSales(salesResult.status === "fulfilled" ? salesResult.value.sales || [] : []);
      setCustomerSalesTotal(salesResult.status === "fulfilled" ? salesResult.value.pagination?.total || 0 : 0);
      if (progressResult.status === "rejected" || unlocksResult.status === "rejected" || salesResult.status === "rejected") {
        setCustomerVisitsError("Parte de la fidelización por visitas no pudo cargarse.");
      }
      setIsLoadingCustomerVisits(false);
    });
  }, [brand.slug, selectedCustomer?.id]);

  const [isLoading, setIsLoading] =
    useState(true);
  const [isSaving, setIsSaving] =
    useState(false);
  const [
    enrollingCustomerId,
    setEnrollingCustomerId,
  ] = useState<string | null>(null);

  const [error, setError] = useState<
    string | null
  >(null);
  const [notice, setNotice] = useState<
    string | null
  >(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [
        customersData,
        loyaltyData,
        bootstrap,
      ] = await Promise.all([
        apiRequest<CustomersResponse>(
          `/api/pos/customers?brandSlug=${encodeURIComponent(
            brand.slug
          )}&pageSize=200`
        ),
        apiRequest<LoyaltyResponse>(
          `/api/pos/loyalty?brandSlug=${encodeURIComponent(
            brand.slug
          )}`
        ),
        apiRequest<BootstrapResponse>(
          `/api/pos/bootstrap?brandSlug=${encodeURIComponent(
            brand.slug
          )}`
        ),
      ]);

      setCustomers(
        customersData.customers || []
      );
      setTotalCustomers(
        customersData.pagination?.total ||
          0
      );
      setProgram(
        loyaltyData.program
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
    loadData();
  }, [loadData]);

  const normalizedCustomers =
    useMemo(
      () =>
        customers.map((customer) => ({
          ...customer,
          member:
            normalizeMember(
              customer.loyalty_member
            ),
        })),
      [customers]
    );

  const metrics = useMemo(() => {
    const members =
      normalizedCustomers.filter(
        (customer) =>
          customer.member?.status ===
          "active"
      ).length;

    const marketing =
      normalizedCustomers.filter(
        (customer) =>
          customer.marketing_consent
      ).length;

    const birthdays =
      normalizedCustomers.filter(
        (customer) =>
          isBirthdayThisMonth(
            customer.birthday
          )
      ).length;

    const points =
      normalizedCustomers.reduce(
        (total, customer) =>
          total +
          Number(
            customer.member
              ?.points_balance || 0
          ),
        0
      );

    return {
      members,
      marketing,
      birthdays,
      points,
    };
  }, [normalizedCustomers]);

  const filteredCustomers =
    useMemo(() => {
      const query = search
        .trim()
        .toLowerCase();

      return normalizedCustomers.filter(
        (customer) => {
          if (
            filter === "members" &&
            !customer.member
          ) {
            return false;
          }

          if (
            filter === "not_members" &&
            customer.member
          ) {
            return false;
          }

          if (
            filter === "marketing" &&
            !customer.marketing_consent
          ) {
            return false;
          }

          if (
            filter === "birthdays" &&
            !isBirthdayThisMonth(
              customer.birthday
            )
          ) {
            return false;
          }

          if (!query) return true;

          return [
            customer.first_name,
            customer.last_name || "",
            customer.phone || "",
            customer.email || "",
            customer.member
              ?.member_number || "",
            getTags(customer.tags).join(
              " "
            ),
          ].some((value) =>
            value
              .toLowerCase()
              .includes(query)
          );
        }
      );
    }, [
      normalizedCustomers,
      search,
      filter,
    ]);

  function openCreateModal() {
    setForm({
      ...EMPTY_FORM,
      joinLoyalty: Boolean(
        program?.active
      ),
    });
    setError(null);
    setNotice(null);
    setIsCreateModalOpen(true);
  }

  async function createCustomer(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!form.firstName.trim()) {
      setError(
        "Escribe el nombre del cliente."
      );
      return;
    }

    if (
      !form.phone.trim() &&
      !form.email.trim()
    ) {
      setError(
        "Agrega al menos teléfono o correo electrónico."
      );
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      setNotice(null);

      const response =
        await apiRequest<CreateCustomerResponse>(
          "/api/pos/customers",
          {
            method: "POST",
            body: JSON.stringify({
              brandSlug: brand.slug,
              firstName:
                form.firstName,
              lastName:
                form.lastName ||
                null,
              phone:
                form.phone || null,
              email:
                form.email || null,
              birthday:
                form.birthday ||
                null,
              marketingConsent:
                form.marketingConsent,
              walletConsent:
                form.walletConsent,
              notes:
                form.notes || null,
              tags: form.tags
                .split(",")
                .map((tag) =>
                  tag.trim()
                )
                .filter(Boolean),
            }),
          }
        );

      let loyaltyCreated = false;

      if (
        form.joinLoyalty &&
        program?.active
      ) {
        await apiRequest(
          "/api/pos/loyalty",
          {
            method: "POST",
            body: JSON.stringify({
              brandSlug:
                brand.slug,
              action:
                "register_member",
              customerId:
                response.customer.id,
            }),
          }
        );

        loyaltyCreated = true;
      }

      setIsCreateModalOpen(false);
      setForm(EMPTY_FORM);

      setNotice(
        loyaltyCreated
          ? "Cliente creado e inscrito en fidelización."
          : "Cliente creado correctamente."
      );

      await loadData();
    } catch (saveError) {
      setError(
        getErrorMessage(saveError)
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function enrollCustomer(
    customer: Customer
  ) {
    if (!program?.active) {
      setError(
        "Configura primero un programa de fidelización."
      );
      return;
    }

    try {
      setEnrollingCustomerId(
        customer.id
      );
      setError(null);
      setNotice(null);

      await apiRequest(
        "/api/pos/loyalty",
        {
          method: "POST",
          body: JSON.stringify({
            brandSlug: brand.slug,
            action:
              "register_member",
            customerId:
              customer.id,
          }),
        }
      );

      setNotice(
        `${getCustomerName(
          customer
        )} ya forma parte de ${program.name}.`
      );

      await loadData();

      setSelectedCustomer(null);
    } catch (enrollError) {
      setError(
        getErrorMessage(enrollError)
      );
    } finally {
      setEnrollingCustomerId(
        null
      );
    }
  }

  async function updateCustomer(formValue: CustomerForm) {
    if (!editingCustomer || isSaving) return;
    try {
      setIsSaving(true);
      setError(null);
      const response = await apiRequest<CreateCustomerResponse>("/api/pos/customers", {
        method: "PATCH",
        body: JSON.stringify({
          brandSlug: brand.slug,
          customerId: editingCustomer.id,
          firstName: formValue.firstName,
          lastName: formValue.lastName || null,
          phone: formValue.phone || null,
          email: formValue.email || null,
          notes: formValue.notes || null,
        }),
      });
      setCustomers((current) => current.map((customer) =>
        customer.id === response.customer.id ? { ...customer, ...response.customer } : customer
      ));
      setSelectedCustomer((current) =>
        current?.id === response.customer.id ? { ...current, ...response.customer } : current
      );
      setEditingCustomer(null);
      setNotice("Cliente actualizado correctamente.");
    } catch (updateError) {
      setError(getErrorMessage(updateError));
      throw updateError;
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <PosPage width="wide" density="compact" aria-busy="true">
        <div className="h-20 animate-pulse border-b border-[var(--pos-line-subtle)]" />
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-20 animate-pulse rounded-[var(--pos-radius-md)] bg-white/[0.035]" />
          ))}
        </div>
        <div className="h-12 animate-pulse rounded-[var(--pos-radius-md)] bg-white/[0.035]" />
        <div className="h-[520px] animate-pulse rounded-[var(--pos-radius-md)] bg-white/[0.035]" />
      </PosPage>
    );
  }

  return (
    <PosPage width="wide" density="compact">
      <PosPageHeader
        compact
        title="Clientes"
        description="Identificación, contacto y relación del cliente con el negocio."
        meta={`${totalCustomers} clientes registrados`}
        actions={
          <PosButton
            leadingIcon={<PosIcon name="plus" className="h-4 w-4" />}
            onClick={openCreateModal}
          >
            Nuevo cliente
          </PosButton>
        }
      />

      <section aria-label="Resumen de clientes" className="grid grid-cols-3 gap-3">
        <CustomerMetric label="Registrados" value={String(totalCustomers)} />
        <CustomerMetric label="Miembros activos" value={String(metrics.members)} />
        <CustomerMetric label="Aceptan marketing" value={String(metrics.marketing)} />
      </section>

      <FeedbackBanner
        error={error}
        notice={notice}
      />

      {!program?.active ? (
        <LoyaltySetupBanner
          brandSlug={brand.slug}
        />
      ) : null}

      <PosSection
        title="Directorio"
        description={`${filteredCustomers.length} clientes visibles`}
      >
        <div className="grid gap-3 rounded-[var(--pos-radius-md)] bg-[var(--pos-panel)] p-3 md:grid-cols-[minmax(0,1fr)_240px]">
          <label className="relative">
            <PosIcon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--pos-text-muted)]"
            />

            <input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Buscar nombre, teléfono, correo o membresía"
              className="pos-ui-focus h-10 w-full rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] bg-[var(--pos-canvas)] pl-10 pr-3 text-sm text-[var(--pos-text-primary)] outline-none placeholder:text-[var(--pos-text-muted)]"
            />
          </label>

          <select
            value={filter}
            onChange={(event) =>
              setFilter(
                event.target
                  .value as CustomerFilter
              )
            }
            className="pos-ui-focus h-10 rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] bg-[var(--pos-canvas)] px-3 text-sm text-[var(--pos-text-primary)] outline-none"
          >
            <option value="all">
              Todos los clientes
            </option>
            <option value="members">
              Con fidelización
            </option>
            <option value="not_members">
              Sin fidelización
            </option>
            <option value="marketing">
              Aceptan marketing
            </option>
            <option value="birthdays">
              Cumpleaños del mes
            </option>
          </select>
        </div>

        {filteredCustomers.length >
        0 ? (
          <CustomerTable
            customers={filteredCustomers}
            onOpen={setSelectedCustomer}
          />
        ) : (
          <EmptyCustomers
            hasCustomers={
              customers.length > 0
            }
            onCreate={
              openCreateModal
            }
          />
        )}
      </PosSection>

      {isCreateModalOpen ? (
        <CreateCustomerModal
          form={form}
          program={program}
          isSaving={isSaving}
          onChange={(field, value) =>
            setForm((current) => ({
              ...current,
              [field]: value,
            }))
          }
          onClose={() =>
            setIsCreateModalOpen(
              false
            )
          }
          onSubmit={
            createCustomer
          }
        />
      ) : null}

      {selectedCustomer ? (
        <CustomerDetailModal
          customer={
            selectedCustomer
          }
          program={program}
          branding={branding}
          visitProgress={customerVisitProgress}
          rewardUnlocks={customerRewardUnlocks}
          visitsLoading={isLoadingCustomerVisits}
          visitsError={customerVisitsError}
          sales={customerSales}
          salesTotal={customerSalesTotal}
          isEnrolling={
            enrollingCustomerId ===
            selectedCustomer.id
          }
          onEnroll={() =>
            enrollCustomer(
              selectedCustomer
            )
          }
          onEdit={() => setEditingCustomer(selectedCustomer)}
          onClose={() =>
            setSelectedCustomer(
              null
            )
          }
        />
      ) : null}

      {editingCustomer ? (
        <EditCustomerModal
          customer={editingCustomer}
          isSaving={isSaving}
          onSave={updateCustomer}
          onClose={() => setEditingCustomer(null)}
        />
      ) : null}
    </PosPage>
  );
}

function CustomerMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <PosCard padding="compact" variant="muted">
      <p className="text-[11px] font-medium text-[var(--pos-text-muted)]">{label}</p>
      <p className="mt-2 text-xl font-semibold tabular-nums text-[var(--pos-text-primary)]">{value}</p>
    </PosCard>
  );
}

function CustomerTable({
  customers,
  onOpen,
}: {
  customers: Array<Customer & { member: LoyaltyMember | null }>;
  onOpen: (customer: Customer) => void;
}) {
  return (
    <>
      <div className="mt-3 hidden md:block">
        <PosDataTable caption="Directorio de clientes" density="compact" minWidth={780}>
          <thead className="bg-[var(--pos-panel-raised)] text-left text-[11px] font-semibold text-[var(--pos-text-muted)]">
            <tr>
              <th>Cliente</th>
              <th>Teléfono</th>
              <th className="hidden lg:table-cell">Email</th>
              <th>Fidelización</th>
              <th className="text-right">Puntos</th>
              <th>Estado</th>
              <th className="text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr
                key={customer.id}
                className="cursor-pointer border-t border-[var(--pos-line-subtle)] hover:bg-white/[0.025]"
                onClick={() => onOpen(customer)}
              >
                <td>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--pos-primary-soft)] text-xs font-semibold text-[var(--pos-primary)]">
                      {getInitials(customer)}
                    </div>
                    <div className="min-w-0">
                      <p className="max-w-52 truncate text-sm font-semibold text-[var(--pos-text-primary)]">{getCustomerName(customer)}</p>
                      <p className="mt-0.5 truncate font-mono text-[10px] text-[var(--pos-text-muted)]">{customer.member?.member_number || customer.id.slice(0, 8)}</p>
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap">{customer.phone || "—"}</td>
                <td className="hidden max-w-52 truncate lg:table-cell">{customer.email || "—"}</td>
                <td>
                  <PosBadge tone={customer.member?.status === "active" ? "success" : "neutral"} size="compact" dot={Boolean(customer.member)}>
                    {customer.member?.status === "active" ? "Miembro" : "Sin membresía"}
                  </PosBadge>
                </td>
                <td className="text-right font-semibold tabular-nums text-[var(--pos-text-primary)]">{formatInteger(customer.member?.points_balance || 0)}</td>
                <td>
                  <PosBadge tone={customer.active ? "success" : "neutral"} size="compact">
                    {customer.active ? "Activo" : "Inactivo"}
                  </PosBadge>
                </td>
                <td className="text-right">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpen(customer);
                    }}
                    className="pos-ui-focus h-9 rounded-[var(--pos-radius-sm)] px-3 text-xs font-semibold text-[var(--pos-primary)] hover:bg-[var(--pos-primary-soft)]"
                  >
                    Ver detalle
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </PosDataTable>
      </div>

      <div className="mt-3 grid gap-2 md:hidden">
        {customers.map((customer) => (
          <button
            key={customer.id}
            type="button"
            onClick={() => onOpen(customer)}
            className="pos-ui-focus rounded-[var(--pos-radius-md)] bg-[var(--pos-panel)] p-4 text-left"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--pos-text-primary)]">{getCustomerName(customer)}</p>
                <p className="mt-1 truncate text-xs text-[var(--pos-text-muted)]">{customer.phone || customer.email || "Sin contacto"}</p>
              </div>
              <PosBadge tone={customer.member?.status === "active" ? "success" : "neutral"} size="compact">
                {customer.member ? `${formatInteger(customer.member.points_balance)} pts` : "Sin membresía"}
              </PosBadge>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

function CustomerCard({
  customer,
  program,
  isEnrolling,
  onOpen,
  onEnroll,
}: {
  customer: Customer & {
    member: LoyaltyMember | null;
  };
  program: LoyaltyProgram | null;
  isEnrolling: boolean;
  onOpen: () => void;
  onEnroll: () => void;
}) {
  const tags = getTags(
    customer.tags
  );

  return (
    <div className="rounded-[22px] border border-white/[0.075] bg-[#06111f]/75 p-5 transition hover:border-cyan-300/15">
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-cyan-300 text-sm font-black text-slate-950">
          {getInitials(customer)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-base font-black text-white">
              {getCustomerName(
                customer
              )}
            </p>

            {customer.member ? (
              <span className="rounded-full bg-emerald-300/[0.08] px-3 py-1 text-[7px] font-black uppercase tracking-[0.12em] text-emerald-300">
                Miembro
              </span>
            ) : null}
          </div>

          <p className="mt-2 truncate text-xs font-semibold text-slate-500">
            {customer.phone ||
              "Sin teléfono"}
            {customer.email
              ? ` · ${customer.email}`
              : ""}
          </p>
        </div>

        <button
          type="button"
          onClick={onOpen}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] border border-white/[0.08] text-slate-500 transition hover:text-white"
        >
          <PosIcon
            name="arrow"
            className="h-4 w-4"
          />
        </button>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <MiniMetric
          label="Puntos"
          value={formatInteger(
            customer.member
              ?.points_balance || 0
          )}
        />
        <MiniMetric
          label="Nivel"
          value={
            customer.member?.tier
              ?.name || "Base"
          }
        />
        <MiniMetric
          label="Cumpleaños"
          value={
            customer.birthday
              ? formatBirthday(
                  customer.birthday
                )
              : "—"
          }
        />
      </div>

      <div className="mt-4 flex min-h-7 flex-wrap gap-2">
        {customer.marketing_consent ? (
          <Tag text="Marketing ✓" />
        ) : null}

        {customer.wallet_consent ? (
          <Tag text="Wallet ✓" />
        ) : null}

        {tags.slice(0, 3).map(
          (tag) => (
            <Tag
              key={tag}
              text={tag}
            />
          )
        )}
      </div>

      {!customer.member &&
      program?.active ? (
        <button
          type="button"
          disabled={isEnrolling}
          onClick={onEnroll}
          className="mt-5 flex h-11 w-full items-center justify-center rounded-[14px] border border-emerald-300/15 bg-emerald-300/[0.06] text-xs font-black text-emerald-300 disabled:opacity-45"
        >
          {isEnrolling
            ? "Inscribiendo..."
            : `Inscribir en ${program.name}`}
        </button>
      ) : null}
    </div>
  );
}

function CreateCustomerModal({
  form,
  program,
  isSaving,
  onChange,
  onClose,
  onSubmit,
}: {
  form: CustomerForm;
  program: LoyaltyProgram | null;
  isSaving: boolean;
  onChange: (
    field: keyof CustomerForm,
    value: string | boolean
  ) => void;
  onClose: () => void;
  onSubmit: (
    event: FormEvent<HTMLFormElement>
  ) => void;
}) {
  return (
    <PosModal
      open
      onClose={onClose}
      title="Nuevo cliente"
      description="Se requiere al menos teléfono o correo."
      size="medium"
      dismissible={!isSaving}
    >
      <form
        onSubmit={onSubmit}
        className="grid gap-4"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Nombre"
            value={form.firstName}
            onChange={(value) =>
              onChange(
                "firstName",
                value
              )
            }
            placeholder="Nombre"
            required
            autoFocus
          />

          <Field
            label="Apellidos"
            value={form.lastName}
            onChange={(value) =>
              onChange(
                "lastName",
                value
              )
            }
            placeholder="Opcional"
          />

          <Field
            label="Teléfono"
            value={form.phone}
            onChange={(value) =>
              onChange(
                "phone",
                value
              )
            }
            placeholder="445 000 0000"
            inputMode="tel"
          />

          <Field
            label="Correo"
            value={form.email}
            onChange={(value) =>
              onChange(
                "email",
                value
              )
            }
            placeholder="cliente@correo.com"
            type="email"
          />

          <Field
            label="Cumpleaños"
            value={form.birthday}
            onChange={(value) =>
              onChange(
                "birthday",
                value
              )
            }
            type="date"
          />

          <Field
            label="Etiquetas"
            value={form.tags}
            onChange={(value) =>
              onChange(
                "tags",
                value
              )
            }
            placeholder="VIP, mayoreo, frecuente"
          />
        </div>

        <div className="mt-4">
          <TextAreaField
            label="Notas"
            value={form.notes}
            onChange={(value) =>
              onChange(
                "notes",
                value
              )
            }
            placeholder="Preferencias, observaciones o contexto útil"
          />
        </div>

        <div className="mt-5 grid gap-3">
          <ToggleRow
            title="Acepta comunicaciones de marketing"
            description="Autoriza promociones y mensajes comerciales."
            checked={
              form.marketingConsent
            }
            onChange={(checked) =>
              onChange(
                "marketingConsent",
                checked
              )
            }
          />

          <ToggleRow
            title="Acepta tarjeta digital"
            description="Autoriza la futura emisión de Wallet."
            checked={
              form.walletConsent
            }
            onChange={(checked) =>
              onChange(
                "walletConsent",
                checked
              )
            }
          />

          {program?.active ? (
            <ToggleRow
              title={`Inscribir en ${program.name}`}
              description="Creará su número de miembro al guardar."
              checked={
                form.joinLoyalty
              }
              onChange={(checked) =>
                onChange(
                  "joinLoyalty",
                  checked
                )
              }
              accent
            />
          ) : null}
        </div>

        <PosButton
          type="submit"
          disabled={
            isSaving ||
            !form.firstName.trim() ||
            (
              !form.phone.trim() &&
              !form.email.trim()
            )
          }
          size="touch"
          fullWidth
          loading={isSaving}
        >
          {isSaving
            ? "Guardando cliente..."
            : "Crear cliente"}
        </PosButton>
      </form>
    </PosModal>
  );
}

function EditCustomerModal({
  customer,
  isSaving,
  onSave,
  onClose,
}: {
  customer: Customer;
  isSaving: boolean;
  onSave: (form: CustomerForm) => Promise<void>;
  onClose: () => void;
}) {
  const [editForm, setEditForm] = useState<CustomerForm>({
    ...EMPTY_FORM,
    firstName: customer.first_name,
    lastName: customer.last_name || "",
    phone: customer.phone || "",
    email: customer.email || "",
    notes: customer.notes || "",
  });
  const [editError, setEditError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editForm.firstName.trim()) return setEditError("Escribe el nombre del cliente.");
    if (!editForm.phone.trim() && !editForm.email.trim()) return setEditError("Agrega teléfono o correo electrónico.");
    try {
      setEditError(null);
      await onSave(editForm);
    } catch (error) {
      setEditError(getErrorMessage(error));
    }
  }

  return (
    <PosModal open onClose={onClose} dismissible={!isSaving} size="medium" title="Editar cliente" description="Actualiza únicamente sus datos de contacto.">
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre" required value={editForm.firstName} onChange={(value) => setEditForm((current) => ({ ...current, firstName: value }))} />
          <Field label="Apellido" value={editForm.lastName} onChange={(value) => setEditForm((current) => ({ ...current, lastName: value }))} />
          <Field label="Teléfono" value={editForm.phone} onChange={(value) => setEditForm((current) => ({ ...current, phone: value }))} />
          <Field label="Correo" type="email" value={editForm.email} onChange={(value) => setEditForm((current) => ({ ...current, email: value }))} />
        </div>
        <TextAreaField label="Notas" value={editForm.notes} onChange={(value) => setEditForm((current) => ({ ...current, notes: value }))} />
        {editError ? <p className="text-xs text-[var(--pos-danger)]">{editError}</p> : null}
        <div className="grid grid-cols-2 gap-2">
          <PosButton type="button" variant="secondary" disabled={isSaving} onClick={onClose}>Cancelar</PosButton>
          <PosButton type="submit" loading={isSaving} disabled={isSaving}>{isSaving ? "Guardando..." : "Guardar cambios"}</PosButton>
        </div>
      </form>
    </PosModal>
  );
}

function CustomerDetailModal({
  customer,
  program,
  branding,
  visitProgress,
  rewardUnlocks,
  visitsLoading,
  visitsError,
  sales,
  salesTotal,
  isEnrolling,
  onEnroll,
  onEdit,
  onClose,
}: {
  customer: Customer;
  program: LoyaltyProgram | null;
  branding: Branding | null;
  visitProgress: VisitProgressProgram[];
  rewardUnlocks: RewardUnlock[];
  visitsLoading: boolean;
  visitsError: string | null;
  sales: CustomerSale[];
  salesTotal: number;
  isEnrolling: boolean;
  onEnroll: () => void;
  onEdit: () => void;
  onClose: () => void;
}) {
  const member = normalizeMember(
    customer.loyalty_member
  );

  const tags = getTags(
    customer.tags
  );
  const totalSpentVisible = sales.reduce((total, sale) => total + Number(sale.total || 0), 0);
  const lastPurchase = sales[0] || null;

  return (
    <PosDrawer
      open
      onClose={onClose}
      width="large"
      title={getCustomerName(customer)}
      description={`Cliente desde ${formatDate(customer.created_at)} · ${customer.id}`}
    >
      <div>
        <div className="flex items-center gap-3 border-b border-[var(--pos-line-subtle)] pb-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--pos-primary-soft)] text-sm font-semibold text-[var(--pos-primary)]">
            {getInitials(customer)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--pos-text-primary)]">Resumen del cliente</p>
            <p className="mt-1 truncate text-xs text-[var(--pos-text-muted)]">{customer.phone || customer.email || "Sin contacto"}</p>
          </div>
          <PosButton type="button" variant="secondary" size="compact" onClick={onEdit} className="ml-auto">
            Editar
          </PosButton>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid content-start gap-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <ContactCard
                label="Teléfono"
                value={
                  customer.phone ||
                  "Sin teléfono"
                }
              />
              <ContactCard
                label="Correo"
                value={
                  customer.email ||
                  "Sin correo"
                }
              />
              <ContactCard
                label="Cumpleaños"
                value={
                  customer.birthday
                    ? formatFullBirthday(
                        customer.birthday
                      )
                    : "Sin registrar"
                }
              />
              <ContactCard
                label="Consentimientos"
                value={[
                  customer.marketing_consent
                    ? "Marketing"
                    : null,
                  customer.wallet_consent
                    ? "Wallet"
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") ||
                  "Ninguno"}
              />
            </div>

            {tags.length > 0 ? (
              <div className="rounded-[20px] border border-white/[0.08] bg-white/[0.025] p-5">
                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-600">
                  Etiquetas
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Tag
                      key={tag}
                      text={tag}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {customer.notes ? (
              <div className="rounded-[20px] border border-white/[0.08] bg-white/[0.025] p-5">
                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-600">
                  Notas
                </p>
                <p className="mt-3 text-sm font-semibold leading-7 text-slate-400">
                  {customer.notes}
                </p>
              </div>
            ) : null}

            <div className="rounded-[20px] border border-white/[0.08] bg-white/[0.025] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--pos-text-primary)]">Historial de compras</p>
                  <p className="mt-1 text-xs text-[var(--pos-text-muted)]">
                    {salesTotal > sales.length ? `Mostrando ${sales.length} de ${salesTotal} ventas completadas` : `${salesTotal} ventas completadas`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-[var(--pos-text-muted)]">Total mostrado</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--pos-text-primary)]">{formatMoneyValue(totalSpentVisible)}</p>
                  <p className="mt-1 text-[10px] text-[var(--pos-text-muted)]">Última compra: {lastPurchase ? formatDate(lastPurchase.sold_at) : "—"}</p>
                </div>
              </div>
              {sales.length ? (
                <div className="mt-4 grid gap-2">
                  {sales.slice(0, 10).map((sale) => (
                    <div key={sale.id} className="flex items-start justify-between gap-3 rounded-[var(--pos-radius-sm)] bg-white/[0.035] p-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--pos-text-primary)]">{sale.sale_number}</p>
                        <p className="mt-1 text-[10px] text-[var(--pos-text-muted)]">{formatDate(sale.sold_at)} · {sale.items.slice(0, 2).map((item) => `${item.product_name} × ${formatInteger(item.quantity)}`).join(" · ") || "Sin partidas"}</p>
                      </div>
                      <p className="shrink-0 text-xs font-semibold text-[var(--pos-text-primary)]">{formatMoneyValue(sale.total)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-[var(--pos-radius-sm)] bg-white/[0.025] p-4 text-xs text-[var(--pos-text-muted)]">Las compras completadas aparecerán aquí.</p>
              )}
            </div>
          </div>

          <div>
            {member ? (
              <LoyaltyCard
                customer={customer}
                member={member}
                programName={
                  program?.name ||
                  branding
                    ?.loyalty_program_name ||
                  "Rewards"
                }
                branding={branding}
              />
            ) : (
              <div className="rounded-[var(--pos-radius-lg)] bg-[var(--pos-panel-muted)] p-5 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[var(--pos-radius-sm)] bg-white/[0.05] text-[var(--pos-text-muted)]">
                  <PosIcon
                    name="loyalty"
                    className="h-5 w-5"
                  />
                </div>

                <h4 className="mt-4 text-base font-semibold text-[var(--pos-text-primary)]">
                  Aún no es miembro
                </h4>

                <p className="mt-2 text-xs leading-5 text-[var(--pos-text-muted)]">
                  Inscríbelo para comenzar a acumular puntos
                  en futuras compras.
                </p>

                {program?.active ? (
                  <button
                    type="button"
                    disabled={isEnrolling}
                    onClick={onEnroll}
                    className="pos-ui-focus mt-4 flex h-11 w-full items-center justify-center rounded-[var(--pos-radius-sm)] bg-[var(--pos-primary)] text-sm font-semibold text-slate-950 disabled:opacity-45"
                  >
                    {isEnrolling
                      ? "Inscribiendo..."
                      : `Inscribir en ${program.name}`}
                  </button>
                ) : (
                  <p className="mt-5 rounded-[15px] border border-amber-300/15 bg-amber-300/[0.05] px-4 py-3 text-xs font-bold text-amber-200">
                    Configura el programa desde la sección Fidelización.
                  </p>
                )}
              </div>
            )}

            {member ? (
              <CustomerVisitLoyalty
                programs={visitProgress}
                unlocks={rewardUnlocks}
                loading={visitsLoading}
                error={visitsError}
              />
            ) : null}
          </div>
        </div>
      </div>
    </PosDrawer>
  );
}

function LoyaltyCard({
  customer,
  member,
  programName,
  branding,
}: {
  customer: Customer;
  member: LoyaltyMember;
  programName: string;
  branding: Branding | null;
}) {
  return (
    <div className="rounded-[var(--pos-radius-lg)] bg-[var(--pos-panel-raised)] p-5">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-[var(--pos-text-muted)]">
              {programName}
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--pos-text-primary)]">
              {getCustomerName(
                customer
              )}
            </p>
          </div>

          <PosIcon
            name="loyalty"
            className="h-5 w-5 text-[var(--pos-success)]"
          />
        </div>

        <div className="mt-5">
          <p className="text-[11px] font-medium text-[var(--pos-text-muted)]">
            Saldo disponible
          </p>
          <p className="mt-1 text-3xl font-semibold tracking-[-0.04em] text-[var(--pos-text-primary)]">
            {formatInteger(
              member.points_balance
            )}
          </p>
          <p className="mt-1 text-xs text-[var(--pos-text-muted)]">
            puntos
          </p>
        </div>

        <div className="mt-5 flex items-end justify-between gap-4 border-t border-[var(--pos-line-subtle)] pt-4">
          <div>
            <p className="text-[8px] font-black uppercase tracking-[0.14em] text-white/45">
              Miembro
            </p>
            <p className="mt-1 font-mono text-xs font-black">
              {
                member.member_number
              }
            </p>
          </div>

          <div className="text-right">
            <p className="text-[8px] font-black uppercase tracking-[0.14em] text-white/45">
              Nivel
            </p>
            <p className="mt-1 text-xs font-black">
              {member.tier?.name ||
                "Base"}
            </p>
            {member.tier ? (
              <p className="mt-1 text-[10px] font-semibold text-white/45">
                {Number(member.tier.points_multiplier || 1).toFixed(2)}x · {formatInteger(member.lifetime_points)} pts históricos
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomerVisitLoyalty({
  programs,
  unlocks,
  loading,
  error,
}: {
  programs: VisitProgressProgram[];
  unlocks: RewardUnlock[];
  loading: boolean;
  error: string | null;
}) {
  const activePrograms = programs.filter((program) => program.active);
  if (loading) return <p className="mt-3 text-xs text-[var(--pos-text-muted)]">Cargando visitas y recompensas...</p>;
  if (!activePrograms.length && !unlocks.length && !error) return null;

  return (
    <div className="mt-3 rounded-[var(--pos-radius-lg)] bg-[var(--pos-panel-muted)] p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-[var(--pos-text-primary)]">Visitas y recompensas ganadas</p>
        <PosBadge tone="neutral">{activePrograms.length} programas</PosBadge>
      </div>
      {error ? <p className="mt-3 text-xs text-amber-200">{error}</p> : null}
      {activePrograms.length ? (
        <div className="mt-4 space-y-3">
          {activePrograms.map((program) => (
            <div key={program.id}>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate font-semibold text-[var(--pos-text-secondary)]">{program.name}</span>
                <span className="shrink-0 text-[var(--pos-text-muted)]">{program.currentProgress} de {program.requiredVisits}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                <div className="h-full rounded-full bg-cyan-300" style={{ width: `${Math.min((program.currentProgress / program.requiredVisits) * 100, 100)}%` }} />
              </div>
              <p className="mt-1 text-[10px] text-[var(--pos-text-muted)]">{program.cyclesCompleted} ciclos completados · Compra mínima {formatMoneyValue(program.minimumSaleAmount)}</p>
            </div>
          ))}
        </div>
      ) : null}
      {unlocks.length ? (
        <div className="mt-4 space-y-2 border-t border-[var(--pos-line-subtle)] pt-4">
          <p className="text-[10px] font-semibold text-[var(--pos-text-muted)]">Rewards disponibles</p>
          {unlocks.map((unlock) => {
            const programName = programs.find((program) => program.id === unlock.visitProgramId)?.name || "Programa de visitas";
            return (
              <div key={unlock.id} className="rounded-[var(--pos-radius-sm)] bg-white/[0.035] p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-[var(--pos-text-primary)]">{unlock.rewardName}</p>
                  <PosBadge tone="success">Disponible</PosBadge>
                </div>
                <p className="mt-1 text-[10px] text-[var(--pos-text-muted)]">{formatMoneyValue(unlock.rewardValue)} · {programName} · Ciclo {unlock.cycleNumber}</p>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function LoyaltySetupBanner({
  brandSlug,
}: {
  brandSlug: string;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-[22px] border border-amber-300/15 bg-amber-300/[0.05] p-5 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-sm font-black text-white">
          La fidelización todavía no está configurada
        </p>
        <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">
          Puedes crear clientes desde ahora y registrarlos como
          miembros después.
        </p>
      </div>

      <Link
        href={buildPosHref(
          brandSlug,
          "loyalty"
        )}
        className="flex h-11 items-center justify-center rounded-[14px] bg-amber-300 px-5 text-xs font-black text-slate-950"
      >
        Configurar fidelización
      </Link>
    </div>
  );
}

function EmptyCustomers({
  hasCustomers,
  onCreate,
}: {
  hasCustomers: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="mt-5 flex min-h-[440px] items-center justify-center rounded-[24px] border border-dashed border-white/[0.08] bg-[#06111f]/55 p-6 text-center">
      <div className="max-w-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[20px] bg-cyan-300/[0.08] text-cyan-300">
          <PosIcon
            name="customer"
            className="h-7 w-7"
          />
        </div>

        <h4 className="mt-5 text-2xl font-black text-white">
          {hasCustomers
            ? "No encontramos coincidencias"
            : "Aún no hay clientes"}
        </h4>

        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
          {hasCustomers
            ? "Cambia la búsqueda o el filtro seleccionado."
            : "Crea el primer perfil para comenzar a construir la base de clientes."}
        </p>

        {!hasCustomers ? (
          <button
            type="button"
            onClick={onCreate}
            className="mt-5 inline-flex h-12 items-center justify-center rounded-[15px] bg-cyan-300 px-6 text-sm font-black text-slate-950"
          >
            Crear primer cliente
          </button>
        ) : null}
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
    <div className="rounded-[20px] border border-white/[0.08] bg-white/[0.035] p-4">
      <p className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-600">
        {label}
      </p>
      <p className="mt-2 truncate text-xl font-black tracking-[-0.04em] text-white">
        {value}
      </p>
    </div>
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

function ContactCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-[19px] border border-white/[0.08] bg-white/[0.025] p-5">
      <p className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-700">
        {label}
      </p>
      <p className="mt-2 break-words text-sm font-black text-white">
        {value}
      </p>
    </div>
  );
}

function Tag({
  text,
}: {
  text: string;
}) {
  return (
    <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.09em] text-slate-500">
      {text}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  required,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  placeholder?: string;
  type?: string;
  inputMode?:
    | "text"
    | "tel"
    | "email"
    | "numeric";
  required?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
        {required ? " *" : ""}
      </span>

      <input
        type={type}
        inputMode={inputMode}
        required={required}
        autoFocus={autoFocus}
        value={value}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
        placeholder={placeholder}
        className="h-12 rounded-[15px] border border-white/[0.08] bg-[#06111f] px-4 text-sm font-bold text-white outline-none placeholder:text-slate-700 focus:border-cyan-300/30"
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
        className="rounded-[15px] border border-white/[0.08] bg-[#06111f] px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-slate-700 focus:border-cyan-300/30"
      />
    </label>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
  accent = false,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (
    checked: boolean
  ) => void;
  accent?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center justify-between gap-4 rounded-[17px] border p-4 ${
        accent
          ? "border-emerald-300/15 bg-emerald-300/[0.04]"
          : "border-white/[0.08] bg-white/[0.025]"
      }`}
    >
      <div>
        <p
          className={`text-sm font-black ${
            accent
              ? "text-emerald-300"
              : "text-white"
          }`}
        >
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
        className="h-5 w-5 accent-cyan-300"
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
    Customer,
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

function getInitials(
  customer: Pick<
    Customer,
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

function getTags(
  value: unknown
): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        String(item || "").trim()
      )
      .filter(Boolean);
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return Object.values(
      value as Record<
        string,
        unknown
      >
    )
      .map((item) =>
        String(item || "").trim()
      )
      .filter(Boolean);
  }

  return [];
}

function isBirthdayThisMonth(
  birthday: string | null
) {
  if (!birthday) return false;

  const parts =
    birthday.split("-");

  const month =
    Number(parts[1]);

  return (
    month ===
    new Date().getMonth() + 1
  );
}

function formatBirthday(
  value: string
) {
  const [
    ,
    month,
    day,
  ] = value.split("-");

  return `${day}/${month}`;
}

function formatFullBirthday(
  value: string
) {
  const [
    year,
    month,
    day,
  ] = value.split("-");

  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day)
  );

  return new Intl.DateTimeFormat(
    "es-MX",
    {
      day: "numeric",
      month: "long",
      year: "numeric",
    }
  ).format(date);
}

function formatDate(
  value: string
) {
  return new Intl.DateTimeFormat(
    "es-MX",
    {
      dateStyle: "medium",
    }
  ).format(new Date(value));
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

function formatMoneyValue(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
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
