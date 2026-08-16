"use client";

import Link from "next/link";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePosContext } from "../../components/pos-shell";
import { buildPosHref } from "../../components/pos-sidebar";
import { PosIcon } from "../../components/pos-icons";

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

type LoyaltyForm = {
  name: string;
  pointsPerCurrency: string;
  redemptionValue: string;
  minimumRedeemPoints: string;
  pointsExpireDays: string;
  pointsExpire: boolean;
  active: boolean;
};

type LoyaltyMemberSummary = {
  id: string;
  points_balance: number;
  status: string;
};

type LoyaltyCustomer = {
  id: string;
  first_name: string;
  last_name: string | null;
  loyalty_member: LoyaltyMemberSummary | LoyaltyMemberSummary[] | null;
};

type CustomersResponse = {
  ok: true;
  customers: LoyaltyCustomer[];
};

type LoyaltyTransaction = {
  id: string;
  createdAt: string;
  transactionType: string;
  points: number;
  balanceAfter: number;
  description: string | null;
  member: {
    id: string | null;
    customer: {
      id: string | null;
      firstName: string;
      lastName: string | null;
    };
  };
  sale: {
    id: string;
    saleNumber: string;
    total: number;
    currency: string;
  } | null;
  createdBy: string | null;
};

type TransactionsResponse = {
  ok: true;
  transactions: LoyaltyTransaction[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type AdjustmentForm = {
  customerId: string;
  direction: "add" | "subtract";
  amount: string;
  description: string;
};

type LoyaltyReward = {
  id: string;
  name: string;
  description: string | null;
  pointsCost: number;
  rewardValue: number;
  active: boolean;
  createdAt: string;
  updatedAt: string | null;
};

type RewardsResponse = {
  ok: true;
  rewards: LoyaltyReward[];
};

type RewardForm = {
  id: string | null;
  name: string;
  description: string;
  pointsCost: string;
  rewardValue: string;
  active: boolean;
};

type VisitProgram = {
  id: string;
  name: string;
  requiredVisits: number;
  minimumSaleAmount: number;
  rewardId: string;
  reward: {
    id: string;
    name: string;
    rewardType: "discount_fixed";
    rewardValue: number;
    active: boolean;
  } | null;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type VisitProgramsResponse = {
  ok: true;
  visitPrograms: VisitProgram[];
};

type VisitProgramFormState = {
  id: string | null;
  name: string;
  requiredVisits: string;
  minimumSaleAmount: string;
  rewardId: string;
  active: boolean;
  startsAt: string;
  endsAt: string;
};

type VisitProgramAdminResponse = { ok: true; visitProgram: VisitProgram };

const EMPTY_VISIT_PROGRAM_FORM: VisitProgramFormState = {
  id: null,
  name: "",
  requiredVisits: "10",
  minimumSaleAmount: "0",
  rewardId: "",
  active: true,
  startsAt: "",
  endsAt: "",
};

const PURCHASE_EXAMPLE = 299;
const POINTS_EXAMPLE = 100;

export default function PosLoyaltyPage() {
  const { brand } = usePosContext();
  const [program, setProgram] =
    useState<LoyaltyProgram | null>(null);
  const [counts, setCounts] = useState({
    members: 0,
    rewards: 0,
    walletPasses: 0,
  });
  const [form, setForm] = useState<LoyaltyForm>(() =>
    createDefaultForm("Rewards")
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<LoyaltyTransaction[]>([]);
  const [transactionPage, setTransactionPage] = useState(1);
  const [transactionTotalPages, setTransactionTotalPages] = useState(0);
  const [transactionTotal, setTransactionTotal] = useState(0);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [customers, setCustomers] = useState<LoyaltyCustomer[]>([]);
  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [adjustment, setAdjustment] = useState<AdjustmentForm>(
    createDefaultAdjustment
  );
  const [rewards, setRewards] = useState<LoyaltyReward[]>([]);
  const [isLoadingRewards, setIsLoadingRewards] = useState(true);
  const [isSavingReward, setIsSavingReward] = useState(false);
  const [rewardForm, setRewardForm] = useState<RewardForm>(createDefaultReward);
  const [visitPrograms, setVisitPrograms] = useState<VisitProgram[]>([]);
  const [isLoadingVisitPrograms, setIsLoadingVisitPrograms] = useState(true);
  const [visitProgramsError, setVisitProgramsError] = useState<string | null>(null);
  const [visitProgramForm, setVisitProgramForm] = useState<VisitProgramFormState>(EMPTY_VISIT_PROGRAM_FORM);
  const [isVisitProgramModalOpen, setIsVisitProgramModalOpen] = useState(false);
  const [isSavingVisitProgram, setIsSavingVisitProgram] = useState(false);
  const [visitProgramFormError, setVisitProgramFormError] = useState<string | null>(null);
  const [frozenVisitProgramId, setFrozenVisitProgramId] = useState<string | null>(null);
  const [togglingVisitProgramId, setTogglingVisitProgramId] = useState<string | null>(null);
  const [visitProgramToDisable, setVisitProgramToDisable] = useState<VisitProgram | null>(null);

  const loadProgram = useCallback(
    async (showLoading = true) => {
      try {
        if (showLoading) setIsLoading(true);
        setError(null);

        const data = await apiRequest<LoyaltyResponse>(
          `/api/pos/loyalty?brandSlug=${encodeURIComponent(
            brand.slug
          )}`
        );

        setProgram(data.program);
        setCounts({
          members: Number(data.counts?.members || 0),
          rewards: Number(data.counts?.rewards || 0),
          walletPasses: Number(
            data.counts?.walletPasses || 0
          ),
        });
        setForm(
          data.program
            ? formFromProgram(data.program)
            : createDefaultForm(
                `${brand.name} Rewards`
              )
        );
      } catch (loadError) {
        setError(getErrorMessage(loadError));
      } finally {
        if (showLoading) setIsLoading(false);
      }
    },
    [brand.name, brand.slug]
  );

  useEffect(() => {
    void loadProgram();
  }, [loadProgram]);

  const loadTransactions = useCallback(
    async (page = 1) => {
      try {
        setIsLoadingTransactions(true);
        const data = await apiRequest<TransactionsResponse>(
          `/api/pos/loyalty?brandSlug=${encodeURIComponent(
            brand.slug
          )}&view=transactions&page=${page}&pageSize=25`
        );

        setTransactions(data.transactions || []);
        setTransactionPage(data.pagination.page);
        setTransactionTotalPages(data.pagination.totalPages);
        setTransactionTotal(data.pagination.total);
      } catch (loadError) {
        setError(getErrorMessage(loadError));
      } finally {
        setIsLoadingTransactions(false);
      }
    },
    [brand.slug]
  );

  const loadCustomers = useCallback(async () => {
    try {
      const data = await apiRequest<CustomersResponse>(
        `/api/pos/customers?brandSlug=${encodeURIComponent(
          brand.slug
        )}&page=1&pageSize=100`
      );
      setCustomers(Array.isArray(data.customers) ? data.customers : []);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    }
  }, [brand.slug]);

  const loadRewards = useCallback(async () => {
    try {
      setIsLoadingRewards(true);
      const data = await apiRequest<RewardsResponse>(
        `/api/pos/loyalty?brandSlug=${encodeURIComponent(
          brand.slug
        )}&view=rewards`
      );
      setRewards(data.rewards || []);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoadingRewards(false);
    }
  }, [brand.slug]);

  const loadVisitPrograms = useCallback(async () => {
    try {
      setIsLoadingVisitPrograms(true);
      setVisitProgramsError(null);
      const data = await apiRequest<VisitProgramsResponse>(
        `/api/pos/loyalty?brandSlug=${encodeURIComponent(brand.slug)}&view=visit_programs`
      );
      setVisitPrograms(data.visitPrograms || []);
    } catch (loadError) {
      setVisitPrograms([]);
      setVisitProgramsError(getErrorMessage(loadError));
    } finally {
      setIsLoadingVisitPrograms(false);
    }
  }, [brand.slug]);

  function openVisitProgramForm(programToEdit?: VisitProgram) {
    setVisitProgramFormError(null);
    setFrozenVisitProgramId(null);
    setVisitProgramForm(programToEdit ? {
      id: programToEdit.id,
      name: programToEdit.name,
      requiredVisits: String(programToEdit.requiredVisits),
      minimumSaleAmount: String(programToEdit.minimumSaleAmount),
      rewardId: programToEdit.rewardId,
      active: programToEdit.active,
      startsAt: toDateTimeLocal(programToEdit.startsAt),
      endsAt: toDateTimeLocal(programToEdit.endsAt),
    } : { ...EMPTY_VISIT_PROGRAM_FORM });
    setIsVisitProgramModalOpen(true);
  }

  function closeVisitProgramForm() {
    if (isSavingVisitProgram) return;
    setIsVisitProgramModalOpen(false);
    setVisitProgramForm({ ...EMPTY_VISIT_PROGRAM_FORM });
    setVisitProgramFormError(null);
    setFrozenVisitProgramId(null);
  }

  async function saveVisitProgram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateVisitProgramForm(visitProgramForm);
    if (validationError) { setVisitProgramFormError(validationError); return; }
    try {
      setIsSavingVisitProgram(true);
      setVisitProgramFormError(null);
      await apiRequest<VisitProgramAdminResponse>("/api/pos/loyalty", {
        method: "POST",
        body: JSON.stringify({
          brandSlug: brand.slug,
          action: visitProgramForm.id ? "update_visit_program" : "create_visit_program",
          ...(visitProgramForm.id ? { visitProgramId: visitProgramForm.id } : {}),
          name: visitProgramForm.name.trim(),
          requiredVisits: Number(visitProgramForm.requiredVisits),
          minimumSaleAmount: Number(visitProgramForm.minimumSaleAmount),
          rewardId: visitProgramForm.rewardId,
          active: visitProgramForm.active,
          startsAt: dateTimeLocalToIso(visitProgramForm.startsAt),
          endsAt: dateTimeLocalToIso(visitProgramForm.endsAt),
        }),
      });
      closeVisitProgramFormAfterSave();
      await loadVisitPrograms();
      setNotice(visitProgramForm.id ? "Programa por visitas actualizado." : "Programa por visitas creado.");
    } catch (saveError) {
      const code = saveError instanceof ApiRequestError ? saveError.code : null;
      if (code === "POS_LOYALTY_VISIT_PROGRAM_FROZEN") setFrozenVisitProgramId(visitProgramForm.id);
      if (code === "POS_LOYALTY_VISIT_PROGRAM_NOT_FOUND") {
        closeVisitProgramFormAfterSave();
        await loadVisitPrograms();
      }
      if (code === "POS_LOYALTY_VISIT_REWARD_INVALID") void loadRewards();
      setVisitProgramFormError(getVisitProgramErrorMessage(saveError));
    } finally {
      setIsSavingVisitProgram(false);
    }
  }

  function closeVisitProgramFormAfterSave() {
    setIsVisitProgramModalOpen(false);
    setVisitProgramForm({ ...EMPTY_VISIT_PROGRAM_FORM });
    setVisitProgramFormError(null);
    setFrozenVisitProgramId(null);
  }

  async function toggleVisitProgram(programToToggle: VisitProgram) {
    try {
      setTogglingVisitProgramId(programToToggle.id);
      setVisitProgramsError(null);
      await apiRequest<VisitProgramAdminResponse>("/api/pos/loyalty", {
        method: "POST",
        body: JSON.stringify({ brandSlug: brand.slug, action: "set_visit_program_active", visitProgramId: programToToggle.id, active: !programToToggle.active }),
      });
      setVisitProgramToDisable(null);
      await loadVisitPrograms();
      setNotice(programToToggle.active ? "Programa por visitas desactivado." : "Programa por visitas activado.");
    } catch (toggleError) {
      setVisitProgramsError(getVisitProgramErrorMessage(toggleError));
    } finally {
      setTogglingVisitProgramId(null);
    }
  }

  useEffect(() => {
    void loadTransactions(1);
    void loadCustomers();
    void loadRewards();
    void loadVisitPrograms();
  }, [loadCustomers, loadRewards, loadTransactions, loadVisitPrograms]);

  const preview = useMemo(() => {
    const rate = parseNonNegativeNumber(
      form.pointsPerCurrency
    );
    const redemptionValue = parseNonNegativeNumber(
      form.redemptionValue
    );

    return {
      earnedPoints: Math.floor(PURCHASE_EXAMPLE * rate),
      redemptionAmount: POINTS_EXAMPLE * redemptionValue,
    };
  }, [form.pointsPerCurrency, form.redemptionValue]);

  function updateForm<K extends keyof LoyaltyForm>(
    field: K,
    value: LoyaltyForm[K]
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
    setNotice(null);
  }

  async function saveProgram(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const validationError = validateForm(form);

    if (validationError) {
      setError(validationError);
      setNotice(null);
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      setNotice(null);

      await apiRequest("/api/pos/loyalty", {
        method: "POST",
        body: JSON.stringify({
          brandSlug: brand.slug,
          action: "configure_program",
          name: form.name.trim(),
          pointsPerCurrency: Number(
            form.pointsPerCurrency
          ),
          redemptionValue: Number(
            form.redemptionValue
          ),
          minimumRedeemPoints: Number(
            form.minimumRedeemPoints
          ),
          pointsExpireDays: form.pointsExpire
            ? Number(form.pointsExpireDays)
            : null,
          active: form.active,
        }),
      });

      await loadProgram(false);
      setNotice(
        program
          ? "Programa de fidelización actualizado correctamente."
          : "Programa de fidelización creado correctamente."
      );
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  async function submitAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateAdjustment(adjustment);

    if (validationError) {
      setError(validationError);
      setNotice(null);
      return;
    }

    const amount = Number(adjustment.amount);
    const points = adjustment.direction === "subtract" ? -amount : amount;

    try {
      setIsAdjusting(true);
      setError(null);
      setNotice(null);

      await apiRequest("/api/pos/loyalty", {
        method: "POST",
        body: JSON.stringify({
          brandSlug: brand.slug,
          action: "adjust_points",
          customerId: adjustment.customerId,
          points,
          description: adjustment.description.trim(),
        }),
      });

      setIsAdjustmentOpen(false);
      setAdjustment(createDefaultAdjustment());
      await Promise.all([
        loadTransactions(1),
        loadCustomers(),
        loadProgram(false),
      ]);
      setNotice(
        `${points > 0 ? "+" : ""}${formatInteger(
          points
        )} puntos ajustados correctamente.`
      );
    } catch (adjustError) {
      setError(getErrorMessage(adjustError));
    } finally {
      setIsAdjusting(false);
    }
  }

  async function saveReward(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateReward(rewardForm);
    if (validationError) {
      setError(validationError);
      setNotice(null);
      return;
    }

    try {
      setIsSavingReward(true);
      setError(null);
      setNotice(null);
      await apiRequest("/api/pos/loyalty", {
        method: "POST",
        body: JSON.stringify({
          brandSlug: brand.slug,
          action: rewardForm.id ? "update_reward" : "create_reward",
          rewardId: rewardForm.id,
          name: rewardForm.name.trim(),
          description: rewardForm.description.trim() || null,
          pointsCost: Number(rewardForm.pointsCost),
          rewardValue: Number(rewardForm.rewardValue),
          active: rewardForm.active,
        }),
      });
      const editing = Boolean(rewardForm.id);
      setRewardForm(createDefaultReward());
      await Promise.all([loadRewards(), loadProgram(false)]);
      setNotice(editing ? "Recompensa actualizada." : "Recompensa creada.");
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSavingReward(false);
    }
  }

  async function setRewardActive(reward: LoyaltyReward) {
    try {
      setError(null);
      setNotice(null);
      await apiRequest("/api/pos/loyalty", {
        method: "POST",
        body: JSON.stringify({
          brandSlug: brand.slug,
          action: "set_reward_active",
          rewardId: reward.id,
          active: !reward.active,
        }),
      });
      await Promise.all([loadRewards(), loadProgram(false)]);
      setNotice(`Recompensa ${reward.active ? "desactivada" : "activada"}.`);
    } catch (updateError) {
      setError(getErrorMessage(updateError));
    }
  }

  const selectedCustomer = customers.find(
    (customer) => customer.id === adjustment.customerId
  );
  const selectedMember = selectedCustomer
    ? firstItem(selectedCustomer.loyalty_member)
    : null;

  if (isLoading) {
    return <LoyaltyLoading />;
  }

  return (
    <section className="grid gap-5">
      <header className="relative overflow-hidden rounded-[30px] border border-white/[0.08] bg-[#081524] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.2)] md:p-8">
        <div className="absolute right-[-100px] top-[-140px] h-96 w-96 rounded-full bg-emerald-400/10 blur-[120px]" />
        <div className="absolute bottom-[-180px] left-[25%] h-80 w-80 rounded-full bg-cyan-400/[0.07] blur-[110px]" />

        <div className="relative z-10 grid gap-7 xl:grid-cols-[minmax(0,1fr)_390px] xl:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-emerald-300/15 bg-emerald-300/[0.07] px-4 py-2 text-[9px] font-black uppercase tracking-[0.22em] text-emerald-200">
                Programa de fidelización
              </span>
              <StatusPill active={form.active} exists={Boolean(program)} />
            </div>

            <h2 className="mt-6 max-w-4xl text-4xl font-black leading-[0.95] tracking-[-0.07em] text-white md:text-6xl">
              Convierte cada compra en una razón para volver.
            </h2>

            <p className="mt-5 max-w-3xl text-sm font-semibold leading-7 text-slate-500 md:text-base">
              Define cuántos puntos genera cada peso gastado y cuánto valor
              recibe el cliente al canjearlos. La venta calcula los puntos con
              el total final confirmado en caja.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <HeaderMetric
              label="Miembros"
              value={formatInteger(counts.members)}
              tone="emerald"
            />
            <HeaderMetric
              label="Rewards"
              value={formatInteger(counts.rewards)}
              tone="cyan"
            />
            <HeaderMetric
              label="Wallet"
              value={formatInteger(counts.walletPasses)}
              tone="cyan"
            />
          </div>
        </div>
      </header>

      <FeedbackBanner error={error} notice={notice} />

      {!program ? (
        <InitialSetupCard brandName={brand.name} />
      ) : null}

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_430px]">
        <form
          onSubmit={saveProgram}
          className="rounded-[30px] border border-white/[0.08] bg-white/[0.035] p-6 md:p-8"
        >
          <SectionHeading
            eyebrow={program ? "Configuración actual" : "Primera configuración"}
            title="Reglas del programa"
            description="La tasa es proporcional: los puntos se calculan con floor(total de la venta × puntos por peso)."
          />

          <div className="mt-7 grid gap-5">
            <TextField
              label="Nombre del programa"
              value={form.name}
              onChange={(value) => updateForm("name", value)}
              placeholder={`${brand.name} Rewards`}
              maxLength={140}
              help="Este nombre identifica el programa para clientes y equipo de caja."
            />

            <div className="grid gap-5 md:grid-cols-2">
              <NumberField
                label="Puntos por cada $1 gastado"
                value={form.pointsPerCurrency}
                onChange={(value) =>
                  updateForm("pointsPerCurrency", value)
                }
                min="0"
                step="0.0001"
                help="Ejemplo: 0.1 entrega 1 punto por cada $10 gastados de forma proporcional."
              />

              <NumberField
                label="Valor monetario de 1 punto"
                value={form.redemptionValue}
                onChange={(value) =>
                  updateForm("redemptionValue", value)
                }
                min="0"
                step="0.0001"
                help="Ejemplo: 0.10 significa que cada punto vale $0.10 al canjear."
              />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <NumberField
                label="Puntos mínimos para canjear"
                value={form.minimumRedeemPoints}
                onChange={(value) =>
                  updateForm("minimumRedeemPoints", value)
                }
                min="0"
                step="1"
                help="Umbral mínimo requerido antes de permitir un canje."
              />

              <NumberField
                label="Vigencia de puntos en días"
                value={form.pointsExpireDays}
                onChange={(value) =>
                  updateForm("pointsExpireDays", value)
                }
                min="1"
                step="1"
                disabled={!form.pointsExpire}
                help={
                  form.pointsExpire
                    ? "Los puntos vencerán después de este número de días."
                    : "Los puntos no tendrán fecha de expiración."
                }
              />
            </div>

            <ToggleRow
              label="Los puntos tienen vigencia"
              description="Desactiva esta opción para guardar points_expire_days como null."
              checked={form.pointsExpire}
              onChange={(checked) =>
                updateForm("pointsExpire", checked)
              }
            />

            <ToggleRow
              label="Programa activo"
              description="Solo un programa activo genera puntos automáticamente en ventas con cliente identificado."
              checked={form.active}
              onChange={(checked) =>
                updateForm("active", checked)
              }
              accent
            />
          </div>

          <div className="mt-7 flex flex-col gap-3 border-t border-white/[0.08] pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-lg text-xs font-semibold leading-5 text-slate-600">
              Guardar actualiza la configuración de esta marca. No modifica
              saldos existentes ni crea recompensas o niveles.
            </p>

            <button
              type="submit"
              disabled={isSaving}
              className="flex h-13 shrink-0 items-center justify-center gap-2 rounded-[16px] bg-emerald-300 px-6 text-sm font-black text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-600"
            >
              {isSaving
                ? "Guardando programa..."
                : program
                ? "Guardar cambios"
                : "Crear programa"}
              {!isSaving ? (
                <PosIcon name="arrow" className="h-4 w-4" />
              ) : null}
            </button>
          </div>
        </form>

        <aside className="grid content-start gap-5">
          <RulePreview
            programName={form.name.trim() || `${brand.name} Rewards`}
            active={form.active}
            earnedPoints={preview.earnedPoints}
            redemptionAmount={preview.redemptionAmount}
            minimumRedeemPoints={parseNonNegativeNumber(
              form.minimumRedeemPoints
            )}
            pointsExpire={form.pointsExpire}
            pointsExpireDays={parseNonNegativeNumber(
              form.pointsExpireDays
            )}
          />

          <article className="rounded-[28px] border border-white/[0.08] bg-[#081524] p-6">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-300">
              Operación conectada
            </p>
            <h3 className="mt-3 text-2xl font-black tracking-[-0.05em] text-white">
              Clientes y ventas
            </h3>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
              Inscribe clientes al programa y después identifícalos en caja
              para que una venta elegible pueda acreditar puntos.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Link
                href={buildPosHref(brand.slug, "customers")}
                className="flex h-12 items-center justify-center rounded-[15px] border border-white/[0.08] text-xs font-black text-white transition hover:bg-white/[0.04]"
              >
                Ver clientes
              </Link>
              <Link
                href={buildPosHref(brand.slug, "register")}
                className="flex h-12 items-center justify-center rounded-[15px] bg-cyan-300 text-xs font-black text-slate-950 transition hover:bg-cyan-200"
              >
                Nueva venta
              </Link>
            </div>
          </article>
        </aside>
      </div>

      <RewardsSection
        programExists={Boolean(program)}
        rewards={rewards}
        loading={isLoadingRewards}
        saving={isSavingReward}
        form={rewardForm}
        onFormChange={setRewardForm}
        onSubmit={saveReward}
        onEdit={(reward) =>
          setRewardForm({
            id: reward.id,
            name: reward.name,
            description: reward.description || "",
            pointsCost: String(reward.pointsCost),
            rewardValue: String(reward.rewardValue),
            active: reward.active,
          })
        }
        onCancelEdit={() => setRewardForm(createDefaultReward())}
        onToggle={(reward) => void setRewardActive(reward)}
      />

      <TiersSection brandSlug={brand.slug} programExists={Boolean(program)} />

      <VisitProgramsSection
        programs={visitPrograms}
        loading={isLoadingVisitPrograms}
        error={visitProgramsError}
        togglingId={togglingVisitProgramId}
        onCreate={() => openVisitProgramForm()}
        onEdit={openVisitProgramForm}
        onToggle={(programToToggle) => programToToggle.active ? setVisitProgramToDisable(programToToggle) : void toggleVisitProgram(programToToggle)}
      />

      {isVisitProgramModalOpen ? (
        <VisitProgramModal
          form={visitProgramForm}
          rewards={rewards.filter((reward) => reward.active || reward.id === visitProgramForm.rewardId)}
          saving={isSavingVisitProgram}
          frozen={Boolean(visitProgramForm.id && frozenVisitProgramId === visitProgramForm.id)}
          error={visitProgramFormError}
          onChange={(field, value) => setVisitProgramForm((current) => ({ ...current, [field]: value }))}
          onClose={closeVisitProgramForm}
          onSubmit={saveVisitProgram}
        />
      ) : null}

      {visitProgramToDisable ? (
        <VisitProgramDisableModal
          program={visitProgramToDisable}
          saving={togglingVisitProgramId === visitProgramToDisable.id}
          onClose={() => setVisitProgramToDisable(null)}
          onConfirm={() => void toggleVisitProgram(visitProgramToDisable)}
        />
      ) : null}

      <PointsHistory
        transactions={transactions}
        total={transactionTotal}
        page={transactionPage}
        totalPages={transactionTotalPages}
        loading={isLoadingTransactions}
        canAdjust={Boolean(program) && customers.length > 0}
        onAdjust={() => {
          setError(null);
          setNotice(null);
          setIsAdjustmentOpen(true);
        }}
        onPageChange={(page) => void loadTransactions(page)}
      />

      <section>
        <ComingSoonCard
          code="WL"
          title="Wallet"
          description="Tarjetas de fidelización para Apple Wallet y Google Wallet."
        />
      </section>

      {isAdjustmentOpen ? (
        <AdjustmentPanel
          customers={customers}
          form={adjustment}
          selectedBalance={Number(selectedMember?.points_balance || 0)}
          saving={isAdjusting}
          onChange={setAdjustment}
          onClose={() => {
            if (isAdjusting) return;
            setIsAdjustmentOpen(false);
            setAdjustment(createDefaultAdjustment());
          }}
          onSubmit={submitAdjustment}
        />
      ) : null}
    </section>
  );
}

function createDefaultForm(name: string): LoyaltyForm {
  return {
    name,
    pointsPerCurrency: "1",
    redemptionValue: "0.01",
    minimumRedeemPoints: "100",
    pointsExpireDays: "365",
    pointsExpire: true,
    active: true,
  };
}

function createDefaultAdjustment(): AdjustmentForm {
  return {
    customerId: "",
    direction: "add",
    amount: "",
    description: "",
  };
}

function createDefaultReward(): RewardForm {
  return {
    id: null,
    name: "",
    description: "",
    pointsCost: "",
    rewardValue: "",
    active: true,
  };
}

function formFromProgram(
  program: LoyaltyProgram
): LoyaltyForm {
  return {
    name: program.name || "Rewards",
    pointsPerCurrency: String(
      Number(program.points_per_currency || 0)
    ),
    redemptionValue: String(
      Number(program.redemption_value || 0)
    ),
    minimumRedeemPoints: String(
      Number(program.minimum_redeem_points || 0)
    ),
    pointsExpireDays:
      program.points_expire_days === null
        ? "365"
        : String(program.points_expire_days),
    pointsExpire: program.points_expire_days !== null,
    active: Boolean(program.active),
  };
}

function validateForm(form: LoyaltyForm) {
  if (!form.name.trim()) {
    return "Escribe el nombre del programa.";
  }

  if (form.name.trim().length > 140) {
    return "El nombre del programa supera 140 caracteres.";
  }

  const numericFields: Array<{
    value: string;
    label: string;
    integer?: boolean;
  }> = [
    {
      value: form.pointsPerCurrency,
      label: "Puntos por cada $1 gastado",
    },
    {
      value: form.redemptionValue,
      label: "Valor monetario de 1 punto",
    },
    {
      value: form.minimumRedeemPoints,
      label: "Puntos mínimos para canjear",
      integer: true,
    },
  ];

  for (const field of numericFields) {
    const value = Number(field.value);

    if (!field.value.trim() || !Number.isFinite(value) || value < 0) {
      return `${field.label} debe ser un número mayor o igual a cero.`;
    }

    if (field.integer && !Number.isInteger(value)) {
      return `${field.label} debe ser un número entero.`;
    }
  }

  if (form.pointsExpire) {
    const days = Number(form.pointsExpireDays);

    if (
      !form.pointsExpireDays.trim() ||
      !Number.isInteger(days) ||
      days < 1
    ) {
      return "La vigencia debe ser un número entero de al menos 1 día.";
    }
  }

  return null;
}

function validateAdjustment(form: AdjustmentForm) {
  if (!form.customerId) {
    return "Selecciona un cliente.";
  }

  const amount = Number(form.amount);

  if (!form.amount.trim() || !Number.isInteger(amount) || amount <= 0) {
    return "La cantidad debe ser un número entero mayor que cero.";
  }

  const description = form.description.trim();

  if (!description) {
    return "Escribe el motivo del ajuste.";
  }

  if (description.length > 500) {
    return "El motivo del ajuste supera 500 caracteres.";
  }

  return null;
}

function validateReward(form: RewardForm) {
  if (!form.name.trim()) return "Escribe el nombre de la recompensa.";
  if (form.name.trim().length > 140) return "El nombre supera 140 caracteres.";
  if (form.description.trim().length > 500) return "La descripción supera 500 caracteres.";

  const pointsCost = Number(form.pointsCost);
  if (!Number.isInteger(pointsCost) || pointsCost <= 0) {
    return "El costo debe ser un número entero mayor que cero.";
  }

  const rewardValue = Number(form.rewardValue);
  if (!Number.isFinite(rewardValue) || rewardValue <= 0) {
    return "El descuento debe ser mayor que cero.";
  }
  if (Math.abs(rewardValue * 100 - Math.round(rewardValue * 100)) > 1e-8) {
    return "El descuento admite como máximo dos decimales.";
  }

  return null;
}

function LoyaltyLoading() {
  return (
    <section className="grid gap-5">
      <div className="h-72 animate-pulse rounded-[30px] bg-white/[0.035]" />
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="h-[760px] animate-pulse rounded-[30px] bg-white/[0.035]" />
        <div className="h-[520px] animate-pulse rounded-[30px] bg-white/[0.035]" />
      </div>
    </section>
  );
}

function StatusPill({
  active,
  exists,
}: {
  active: boolean;
  exists: boolean;
}) {
  const label = !exists
    ? "Sin configurar"
    : active
    ? "Activo"
    : "Pausado";

  return (
    <span
      className={`rounded-full border px-4 py-2 text-[9px] font-black uppercase tracking-[0.18em] ${
        exists && active
          ? "border-emerald-300/15 bg-emerald-300/[0.07] text-emerald-200"
          : "border-amber-300/15 bg-amber-300/[0.07] text-amber-200"
      }`}
    >
      {label}
    </span>
  );
}

function HeaderMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "cyan" | "emerald";
}) {
  return (
    <div className="rounded-[20px] border border-white/[0.08] bg-white/[0.035] p-4 text-center">
      <p
        className={`text-2xl font-black tracking-[-0.05em] ${
          tone === "emerald" ? "text-emerald-300" : "text-cyan-300"
        }`}
      >
        {value}
      </p>
      <p className="mt-2 text-[8px] font-black uppercase tracking-[0.14em] text-slate-600">
        {label}
      </p>
    </div>
  );
}

function InitialSetupCard({ brandName }: { brandName: string }) {
  return (
    <article className="flex flex-col gap-4 rounded-[26px] border border-amber-300/15 bg-amber-300/[0.045] p-6 md:flex-row md:items-center md:justify-between">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-amber-300/[0.09] text-amber-200">
          <PosIcon name="loyalty" className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-black text-white">
            {brandName} todavía no tiene un programa configurado.
          </p>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">
            Revisa las reglas iniciales, ajusta la tasa y crea el programa para
            comenzar a acreditar puntos en compras con clientes inscritos.
          </p>
        </div>
      </div>
      <span className="shrink-0 rounded-full bg-amber-300 px-4 py-2 text-[9px] font-black uppercase tracking-[0.14em] text-slate-950">
        Configuración inicial
      </span>
    </article>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-300">
        {eyebrow}
      </p>
      <h3 className="mt-3 text-3xl font-black tracking-[-0.055em] text-white">
        {title}
      </h3>
      <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
        {description}
      </p>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  help,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  help: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="h-13 rounded-[16px] border border-white/[0.08] bg-[#06111f] px-4 text-sm font-bold text-white outline-none placeholder:text-slate-700 focus:border-emerald-300/30"
      />
      <span className="text-[10px] font-semibold leading-5 text-slate-700">
        {help}
      </span>
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  step,
  help,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: string;
  step: string;
  help: string;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-13 rounded-[16px] border border-white/[0.08] bg-[#06111f] px-4 text-sm font-black text-white outline-none focus:border-emerald-300/30 disabled:cursor-not-allowed disabled:opacity-35"
      />
      <span className="text-[10px] font-semibold leading-5 text-slate-700">
        {help}
      </span>
    </label>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  accent = false,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  accent?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center justify-between gap-5 rounded-[20px] border p-5 transition ${
        checked
          ? accent
            ? "border-emerald-300/20 bg-emerald-300/[0.055]"
            : "border-cyan-300/20 bg-cyan-300/[0.045]"
          : "border-white/[0.08] bg-[#06111f]/70"
      }`}
    >
      <div>
        <p className="text-sm font-black text-white">{label}</p>
        <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">
          {description}
        </p>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 shrink-0 accent-emerald-300"
      />
    </label>
  );
}

function RulePreview({
  programName,
  active,
  earnedPoints,
  redemptionAmount,
  minimumRedeemPoints,
  pointsExpire,
  pointsExpireDays,
}: {
  programName: string;
  active: boolean;
  earnedPoints: number;
  redemptionAmount: number;
  minimumRedeemPoints: number;
  pointsExpire: boolean;
  pointsExpireDays: number;
}) {
  return (
    <article className="relative overflow-hidden rounded-[30px] border border-emerald-300/12 bg-gradient-to-br from-emerald-300/[0.075] via-white/[0.035] to-cyan-300/[0.035] p-6">
      <div className="absolute right-[-80px] top-[-80px] h-60 w-60 rounded-full bg-emerald-400/10 blur-[90px]" />
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-300">
              Vista previa de la regla
            </p>
            <h3 className="mt-3 text-2xl font-black tracking-[-0.05em] text-white">
              {programName}
            </h3>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-[17px] bg-emerald-300/[0.09] text-emerald-300">
            <PosIcon name="loyalty" className="h-6 w-6" />
          </div>
        </div>

        <div className="mt-6 rounded-[22px] border border-white/[0.08] bg-[#06111f]/85 p-5">
          <p className="text-xs font-semibold leading-6 text-slate-500">
            Una compra de {formatMoney(PURCHASE_EXAMPLE)} genera
          </p>
          <p className="mt-2 text-5xl font-black tracking-[-0.07em] text-emerald-300">
            {formatInteger(earnedPoints)}
          </p>
          <p className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-slate-600">
            puntos
          </p>
        </div>

        <div className="mt-4 rounded-[22px] border border-white/[0.08] bg-[#06111f]/85 p-5">
          <p className="text-sm font-black text-white">
            {POINTS_EXAMPLE} puntos equivalen a {formatMoney(redemptionAmount)}
          </p>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">
            El cliente necesita al menos {formatInteger(minimumRedeemPoints)}
            {" "}puntos para canjear.
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between gap-4 rounded-[18px] border border-white/[0.07] bg-white/[0.03] px-4 py-3">
          <span className="text-xs font-bold text-slate-500">
            {pointsExpire
              ? `Vigencia: ${formatInteger(pointsExpireDays)} días`
              : "Puntos sin expiración"}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-[8px] font-black uppercase tracking-[0.14em] ${
              active
                ? "bg-emerald-300/[0.1] text-emerald-300"
                : "bg-amber-300/[0.1] text-amber-200"
            }`}
          >
            {active ? "Activo" : "Pausado"}
          </span>
        </div>
      </div>
    </article>
  );
}

function PointsHistory({
  transactions,
  total,
  page,
  totalPages,
  loading,
  canAdjust,
  onAdjust,
  onPageChange,
}: {
  transactions: LoyaltyTransaction[];
  total: number;
  page: number;
  totalPages: number;
  loading: boolean;
  canAdjust: boolean;
  onAdjust: () => void;
  onPageChange: (page: number) => void;
}) {
  return (
    <section className="overflow-hidden rounded-[30px] border border-white/[0.08] bg-white/[0.035]">
      <div className="flex flex-col gap-4 border-b border-white/[0.08] p-6 md:flex-row md:items-center md:justify-between md:p-8">
        <SectionHeading
          eyebrow="Historial de puntos"
          title="Movimientos de fidelización"
          description={`${formatInteger(
            total
          )} movimientos registrados para esta marca.`}
        />
        <button
          type="button"
          onClick={onAdjust}
          disabled={!canAdjust}
          title={
            canAdjust
              ? undefined
              : "Configura el programa y registra al menos un cliente para ajustar puntos."
          }
          className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-[15px] bg-cyan-300 px-5 text-xs font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-600"
        >
          Ajustar puntos
          <PosIcon name="arrow" className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="grid gap-3 p-6 md:p-8">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-20 animate-pulse rounded-[18px] bg-white/[0.04]"
            />
          ))}
        </div>
      ) : transactions.length ? (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-left">
              <thead className="bg-[#081524]/70 text-[9px] font-black uppercase tracking-[0.16em] text-slate-600">
                <tr>
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-4 py-4">Cliente</th>
                  <th className="px-4 py-4">Tipo</th>
                  <th className="px-4 py-4 text-right">Puntos</th>
                  <th className="px-4 py-4 text-right">Balance</th>
                  <th className="px-4 py-4">Descripción</th>
                  <th className="px-6 py-4">Venta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {transactions.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-white/[0.08] px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-bold text-slate-600">
              Página {page} de {Math.max(totalPages, 1)}
            </p>
            <div className="flex gap-2">
              <PaginationButton
                label="Anterior"
                disabled={page <= 1 || loading}
                onClick={() => onPageChange(page - 1)}
              />
              <PaginationButton
                label="Siguiente"
                disabled={page >= totalPages || loading}
                onClick={() => onPageChange(page + 1)}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="p-8 text-center md:p-12">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[18px] bg-white/[0.05] text-cyan-300">
            <PosIcon name="loyalty" className="h-6 w-6" />
          </div>
          <h3 className="mt-5 text-xl font-black text-white">
            Aún no hay movimientos
          </h3>
          <p className="mx-auto mt-2 max-w-lg text-sm font-semibold leading-6 text-slate-600">
            Las compras con puntos y los ajustes manuales aparecerán aquí en
            orden cronológico.
          </p>
        </div>
      )}
    </section>
  );
}

function TransactionRow({
  transaction,
}: {
  transaction: LoyaltyTransaction;
}) {
  const customerName = [
    transaction.member.customer.firstName,
    transaction.member.customer.lastName,
  ]
    .filter(Boolean)
    .join(" ");
  const type = transactionTypeMeta(transaction.transactionType);

  return (
    <tr className="text-sm font-semibold text-slate-500 transition hover:bg-white/[0.025]">
      <td className="whitespace-nowrap px-6 py-5 text-xs">
        {formatDateTime(transaction.createdAt)}
      </td>
      <td className="px-4 py-5 font-black text-white">
        {customerName || "Cliente no disponible"}
      </td>
      <td className="px-4 py-5">
        <span
          className={`inline-flex rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-[0.12em] ${type.className}`}
        >
          {type.label}
        </span>
      </td>
      <td
        className={`px-4 py-5 text-right font-black ${
          transaction.points >= 0 ? "text-emerald-300" : "text-rose-300"
        }`}
      >
        {formatSignedPoints(transaction.points)}
      </td>
      <td className="px-4 py-5 text-right font-black text-white">
        {formatInteger(transaction.balanceAfter)}
      </td>
      <td className="max-w-[260px] px-4 py-5 text-xs leading-5">
        {transaction.description || "Sin descripción"}
      </td>
      <td className="px-6 py-5">
        {transaction.sale ? (
          <div>
            <p className="font-black text-cyan-300">
              {transaction.sale.saleNumber}
            </p>
            <p className="mt-1 text-[10px] text-slate-600">
              {formatCurrency(
                transaction.sale.total,
                transaction.sale.currency
              )}
            </p>
          </div>
        ) : (
          <span className="text-xs text-slate-700">Sin venta</span>
        )}
      </td>
    </tr>
  );
}

function PaginationButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-10 rounded-[13px] border border-white/[0.08] px-4 text-xs font-black text-white transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:text-slate-700"
    >
      {label}
    </button>
  );
}

function AdjustmentPanel({
  customers,
  form,
  selectedBalance,
  saving,
  onChange,
  onClose,
  onSubmit,
}: {
  customers: LoyaltyCustomer[];
  form: AdjustmentForm;
  selectedBalance: number;
  saving: boolean;
  onChange: (form: AdjustmentForm) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-3 backdrop-blur-sm md:items-center md:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="adjustment-title"
    >
      <form
        onSubmit={onSubmit}
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[28px] border border-white/[0.1] bg-[#081524] p-6 shadow-[0_35px_120px_rgba(0,0,0,0.55)] md:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-300">
              Ajuste manual
            </p>
            <h2
              id="adjustment-title"
              className="mt-2 text-3xl font-black tracking-[-0.055em] text-white"
            >
              Ajustar puntos
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] text-lg font-bold text-slate-500 hover:bg-white/[0.05] hover:text-white disabled:opacity-40"
            aria-label="Cerrar ajuste"
          >
            ×
          </button>
        </div>

        <div className="mt-7 grid gap-5">
          <label className="grid gap-2">
            <span className="text-xs font-black text-white">Cliente</span>
            <select
              value={form.customerId}
              onChange={(event) =>
                onChange({ ...form, customerId: event.target.value })
              }
              required
              className="h-13 rounded-[15px] border border-white/[0.09] bg-white/[0.04] px-4 text-sm font-bold text-white outline-none transition focus:border-cyan-300/50"
            >
              <option value="" className="bg-slate-950">
                Selecciona un cliente
              </option>
              {customers.map((customer) => {
                const member = firstItem(customer.loyalty_member);
                const name = [customer.first_name, customer.last_name]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <option
                    key={customer.id}
                    value={customer.id}
                    className="bg-slate-950"
                  >
                    {name} · {formatInteger(member?.points_balance || 0)} pts
                  </option>
                );
              })}
            </select>
          </label>

          <fieldset>
            <legend className="text-xs font-black text-white">Acción</legend>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {(["add", "subtract"] as const).map((direction) => (
                <button
                  key={direction}
                  type="button"
                  onClick={() => onChange({ ...form, direction })}
                  className={`h-12 rounded-[15px] border text-xs font-black transition ${
                    form.direction === direction
                      ? direction === "add"
                        ? "border-emerald-300/40 bg-emerald-300/[0.12] text-emerald-200"
                        : "border-rose-300/40 bg-rose-300/[0.12] text-rose-200"
                      : "border-white/[0.08] text-slate-500 hover:bg-white/[0.04]"
                  }`}
                >
                  {direction === "add" ? "Agregar puntos" : "Restar puntos"}
                </button>
              ))}
            </div>
          </fieldset>

          {form.direction === "subtract" && form.customerId ? (
            <div className="rounded-[16px] border border-amber-300/15 bg-amber-300/[0.06] px-4 py-3 text-xs font-bold text-amber-100">
              Saldo actual disponible: {formatInteger(selectedBalance)} puntos.
              La operación será rechazada si intenta dejar un saldo negativo.
            </div>
          ) : null}

          <label className="grid gap-2">
            <span className="text-xs font-black text-white">Cantidad</span>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={form.amount}
              onChange={(event) =>
                onChange({ ...form, amount: event.target.value })
              }
              placeholder="50"
              required
              className="h-13 rounded-[15px] border border-white/[0.09] bg-white/[0.04] px-4 text-sm font-bold text-white outline-none transition placeholder:text-slate-700 focus:border-cyan-300/50"
            />
            <span className="text-[11px] font-semibold text-slate-600">
              Introduce un entero positivo; el tipo de acción determina el
              signo enviado.
            </span>
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-black text-white">Motivo</span>
            <textarea
              value={form.description}
              onChange={(event) =>
                onChange({ ...form, description: event.target.value })
              }
              maxLength={500}
              rows={4}
              placeholder="Describe por qué se realiza este ajuste..."
              required
              className="resize-none rounded-[15px] border border-white/[0.09] bg-white/[0.04] px-4 py-3 text-sm font-bold leading-6 text-white outline-none transition placeholder:text-slate-700 focus:border-cyan-300/50"
            />
            <span className="text-right text-[10px] font-bold text-slate-700">
              {form.description.length}/500
            </span>
          </label>
        </div>

        <div className="mt-7 flex flex-col-reverse gap-3 border-t border-white/[0.08] pt-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-12 rounded-[15px] border border-white/[0.08] px-5 text-xs font-black text-white hover:bg-white/[0.04] disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-12 rounded-[15px] bg-cyan-300 px-6 text-xs font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-600"
          >
            {saving ? "Aplicando ajuste..." : "Confirmar ajuste"}
          </button>
        </div>
      </form>
    </div>
  );
}

type LoyaltyTier = {
  id: string;
  name: string;
  minimumLifetimePoints: number;
  pointsMultiplier: number;
  sortOrder: number;
  active: boolean;
};

type TierForm = {
  id: string | null;
  name: string;
  minimumLifetimePoints: string;
  pointsMultiplier: string;
  active: boolean;
};

function TiersSection({ brandSlug, programExists }: { brandSlug: string; programExists: boolean }) {
  const [tiers, setTiers] = useState<LoyaltyTier[]>([]);
  const [form, setForm] = useState<TierForm>({ id: null, name: "", minimumLifetimePoints: "0", pointsMultiplier: "1", active: true });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadTiers = useCallback(async () => {
    if (!programExists) { setTiers([]); return; }
    setLoading(true);
    try {
      const data = await apiRequest<{ ok: true; tiers: LoyaltyTier[] }>(`/api/pos/loyalty?brandSlug=${encodeURIComponent(brandSlug)}&view=tiers`);
      setTiers(data.tiers || []);
    } catch (tierError) {
      setMessage(getErrorMessage(tierError));
    } finally {
      setLoading(false);
    }
  }, [brandSlug, programExists]);

  useEffect(() => { void loadTiers(); }, [loadTiers]);

  async function submitTier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await apiRequest("/api/pos/loyalty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandSlug,
          action: form.id ? "update_tier" : "create_tier",
          tierId: form.id,
          name: form.name.trim(),
          minimumLifetimePoints: Number(form.minimumLifetimePoints),
          pointsMultiplier: Number(form.pointsMultiplier),
          sortOrder: Number(form.minimumLifetimePoints),
          active: form.active,
        }),
      });
      setForm({ id: null, name: "", minimumLifetimePoints: "0", pointsMultiplier: "1", active: true });
      setMessage(form.id ? "Nivel actualizado." : "Nivel creado.");
      await loadTiers();
    } catch (tierError) {
      setMessage(getErrorMessage(tierError));
    } finally {
      setSaving(false);
    }
  }

  async function toggleTier(tier: LoyaltyTier) {
    setMessage(null);
    try {
      await apiRequest("/api/pos/loyalty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandSlug, action: "set_tier_active", tierId: tier.id, active: !tier.active }),
      });
      await loadTiers();
    } catch (tierError) {
      setMessage(getErrorMessage(tierError));
    }
  }

  return (
    <section className="rounded-[24px] border border-white/[0.08] bg-[#081524] p-5 md:p-6">
      <SectionHeading eyebrow="Niveles" title="Multiplicadores por puntos históricos" description="La venta usa el nivel vigente antes de acreditar puntos. Una promoción aplica desde la siguiente compra." />
      {message ? <p className="mt-4 text-xs font-semibold text-cyan-200">{message}</p> : null}
      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="divide-y divide-white/[0.06] rounded-[16px] bg-white/[0.025] px-4">
          {loading ? <p className="py-5 text-sm text-slate-500">Cargando niveles...</p> : tiers.length ? tiers.map((tier) => (
            <div key={tier.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="text-sm font-bold text-white">{tier.name}</p>
                <p className="mt-1 text-xs text-slate-400">{formatInteger(tier.minimumLifetimePoints)} pts históricos · {tier.pointsMultiplier.toFixed(2)}x</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setForm({ id: tier.id, name: tier.name, minimumLifetimePoints: String(tier.minimumLifetimePoints), pointsMultiplier: String(tier.pointsMultiplier), active: tier.active })} className="h-9 rounded-[10px] border border-white/[0.08] px-3 text-xs font-bold text-white">Editar</button>
                <button type="button" onClick={() => void toggleTier(tier)} className="h-9 rounded-[10px] border border-white/[0.08] px-3 text-xs font-bold text-slate-300">{tier.active ? "Desactivar" : "Activar"}</button>
              </div>
            </div>
          )) : <p className="py-5 text-sm text-slate-500">Aún no hay niveles configurados.</p>}
        </div>
        <form onSubmit={submitTier} className="space-y-4 rounded-[16px] bg-white/[0.025] p-4">
          <TextField label="Nombre" value={form.name} onChange={(name) => setForm((current) => ({ ...current, name }))} placeholder="Bronce" maxLength={120} help="Nombre visible del nivel." />
          <NumberField label="Puntos históricos mínimos" value={form.minimumLifetimePoints} onChange={(minimumLifetimePoints) => setForm((current) => ({ ...current, minimumLifetimePoints }))} min="0" step="1" help="Umbral basado en lifetime points." />
          <NumberField label="Multiplicador" value={form.pointsMultiplier} onChange={(pointsMultiplier) => setForm((current) => ({ ...current, pointsMultiplier }))} min="0.0001" step="0.0001" help="Se aplica a los puntos base desde la siguiente venta." />
          <ToggleRow label="Nivel activo" description="Sólo los niveles activos se asignan automáticamente." checked={form.active} onChange={(active) => setForm((current) => ({ ...current, active }))} />
          <div className="flex gap-2">
            {form.id ? <button type="button" onClick={() => setForm({ id: null, name: "", minimumLifetimePoints: "0", pointsMultiplier: "1", active: true })} className="h-10 flex-1 rounded-[11px] border border-white/[0.08] text-xs font-bold text-white">Cancelar</button> : null}
            <button type="submit" disabled={!programExists || saving} className="h-10 flex-1 rounded-[11px] bg-cyan-300 px-4 text-xs font-black text-slate-950 disabled:opacity-40">{saving ? "Guardando..." : form.id ? "Guardar" : "Crear nivel"}</button>
          </div>
        </form>
      </div>
    </section>
  );
}

function RewardsSection({
  programExists,
  rewards,
  loading,
  saving,
  form,
  onFormChange,
  onSubmit,
  onEdit,
  onCancelEdit,
  onToggle,
}: {
  programExists: boolean;
  rewards: LoyaltyReward[];
  loading: boolean;
  saving: boolean;
  form: RewardForm;
  onFormChange: (form: RewardForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onEdit: (reward: LoyaltyReward) => void;
  onCancelEdit: () => void;
  onToggle: (reward: LoyaltyReward) => void;
}) {
  return (
    <section className="rounded-[30px] border border-white/[0.08] bg-[#081524] p-6 md:p-8">
      <SectionHeading
        eyebrow="Recompensas"
        title="Descuentos fijos"
        description="Crea beneficios canjeables por puntos. En V1 cada recompensa reduce el total final por el importe configurado."
      />

      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="grid content-start gap-3">
          {loading ? (
            <div className="h-32 animate-pulse rounded-[20px] bg-white/[0.04]" />
          ) : rewards.length ? (
            rewards.map((reward) => (
              <article key={reward.id} className="rounded-[20px] border border-white/[0.08] bg-white/[0.025] p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-black text-white">{reward.name}</h3>
                      <span className={`rounded-full px-3 py-1 text-[8px] font-black uppercase ${reward.active ? "bg-emerald-300/[0.1] text-emerald-200" : "bg-white/[0.06] text-slate-500"}`}>
                        {reward.active ? "Activa" : "Inactiva"}
                      </span>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-slate-600">{reward.description || "Sin descripción"}</p>
                    <p className="mt-3 text-sm font-black text-cyan-300">
                      {formatInteger(reward.pointsCost)} puntos · {formatMoney(reward.rewardValue)} de descuento
                    </p>
                    <p className="mt-1 text-[9px] font-black uppercase tracking-[0.12em] text-slate-700">Descuento fijo</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => onEdit(reward)} className="h-10 rounded-[12px] border border-white/[0.08] px-4 text-xs font-black text-white">Editar</button>
                    <button type="button" onClick={() => onToggle(reward)} className="h-10 rounded-[12px] border border-cyan-300/15 px-4 text-xs font-black text-cyan-300">
                      {reward.active ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-[20px] border border-dashed border-white/[0.09] p-7 text-center text-sm font-semibold text-slate-600">
              Aún no hay recompensas de descuento fijo.
            </div>
          )}
        </div>

        <form onSubmit={onSubmit} className="rounded-[22px] border border-white/[0.08] bg-white/[0.025] p-5">
          <h3 className="text-xl font-black text-white">{form.id ? "Editar recompensa" : "Nueva recompensa"}</h3>
          <p className="mt-1 text-[9px] font-black uppercase tracking-[0.14em] text-cyan-300">Descuento fijo</p>
          <div className="mt-5 grid gap-4">
            <TextField label="Nombre" value={form.name} onChange={(name) => onFormChange({ ...form, name })} placeholder="$50 de descuento" maxLength={140} help="Nombre visible para el equipo de caja." />
            <TextField label="Descripción" value={form.description} onChange={(description) => onFormChange({ ...form, description })} placeholder="Beneficio opcional" maxLength={500} help="Explica brevemente el beneficio." />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <NumberField label="Costo en puntos" value={form.pointsCost} onChange={(pointsCost) => onFormChange({ ...form, pointsCost })} min="1" step="1" help="Puntos enteros requeridos para canjear." />
              <NumberField label="Descuento MXN" value={form.rewardValue} onChange={(rewardValue) => onFormChange({ ...form, rewardValue })} min="0.01" step="0.01" help="Importe exacto que reduce el total final." />
            </div>
            <ToggleRow label="Recompensa activa" description="Disponible para clientes con saldo suficiente." checked={form.active} onChange={(active) => onFormChange({ ...form, active })} accent />
          </div>
          <div className="mt-5 flex gap-2">
            {form.id ? (
              <button type="button" onClick={onCancelEdit} disabled={saving} className="h-11 flex-1 rounded-[13px] border border-white/[0.08] text-xs font-black text-white">Cancelar</button>
            ) : null}
            <button type="submit" disabled={!programExists || saving} className="h-11 flex-1 rounded-[13px] bg-cyan-300 px-4 text-xs font-black text-slate-950 disabled:bg-slate-800 disabled:text-slate-600">
              {saving ? "Guardando..." : form.id ? "Guardar" : "Crear"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function ComingSoonCard({
  code,
  title,
  description,
}: {
  code: string;
  title: string;
  description: string;
}) {
  return (
    <article className="rounded-[25px] border border-white/[0.07] bg-white/[0.025] p-5 opacity-75">
      <div className="flex items-start justify-between gap-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-white/[0.05] text-[9px] font-black text-slate-500">
          {code}
        </span>
        <span className="rounded-full bg-amber-300/[0.08] px-3 py-1 text-[8px] font-black uppercase tracking-[0.12em] text-amber-200">
          Próximamente
        </span>
      </div>
      <h3 className="mt-4 text-xl font-black text-white">{title}</h3>
      <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">
        {description}
      </p>
    </article>
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
      role="status"
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

function firstItem<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function transactionTypeMeta(type: string) {
  if (type === "earn") {
    return {
      label: "Compra / acumulación",
      className: "bg-emerald-300/[0.1] text-emerald-200",
    };
  }

  if (type === "adjust") {
    return {
      label: "Ajuste",
      className: "bg-cyan-300/[0.1] text-cyan-200",
    };
  }

  return {
    label: type || "Desconocido",
    className: "bg-white/[0.06] text-slate-400",
  };
}

function formatSignedPoints(value: number) {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${formatInteger(number)}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Fecha no disponible";

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function VisitProgramsSection({
  programs,
  loading,
  error,
  togglingId,
  onCreate,
  onEdit,
  onToggle,
}: {
  programs: VisitProgram[];
  loading: boolean;
  error: string | null;
  togglingId: string | null;
  onCreate: () => void;
  onEdit: (program: VisitProgram) => void;
  onToggle: (program: VisitProgram) => void;
}) {
  return (
    <section className="rounded-[24px] border border-white/[0.08] bg-[#081524] p-5 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-300">Programas por visitas</p>
          <h3 className="mt-2 text-xl font-black tracking-[-0.04em] text-white">Compras frecuentes</h3>
          <p className="mt-2 text-xs leading-5 text-slate-500">Cada venta elegible suma una visita y desbloquea la recompensa al completar la meta.</p>
        </div>
        <button type="button" onClick={onCreate} className="h-10 rounded-[12px] bg-cyan-300 px-4 text-xs font-black text-slate-950">Crear programa</button>
      </div>

      {error ? <p className="mt-4 rounded-[12px] bg-amber-300/[0.06] px-3 py-2 text-xs text-amber-200">No se pudieron cargar los programas por visitas.</p> : null}
      {loading ? <p className="mt-5 text-sm text-slate-500">Cargando programas...</p> : programs.length ? (
        <div className="mt-5 divide-y divide-white/[0.07]">
          {programs.map((program) => {
            const status = getVisitProgramStatus(program);
            return (
              <div key={program.id} className="grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-white">{program.name}</p>
                    <span className={`rounded-full px-2 py-1 text-[9px] font-bold ${status.tone}`}>{status.label}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-400">{program.requiredVisits} visitas · Compra mínima {formatMoney(program.minimumSaleAmount)}</p>
                  <p className="mt-1 text-xs text-slate-500">Recompensa: {program.reward?.name || "No disponible"}{program.reward ? ` · ${formatMoney(program.reward.rewardValue)}` : ""}</p>
                  <p className="mt-1 text-[10px] text-slate-600">{formatVisitProgramValidity(program)}</p>
                </div>
                <div className="flex gap-2 md:justify-end">
                  <button type="button" onClick={() => onEdit(program)} className="h-9 rounded-[10px] border border-white/[0.08] px-3 text-xs font-bold text-white">Editar</button>
                  <button type="button" disabled={togglingId === program.id} onClick={() => onToggle(program)} className="h-9 rounded-[10px] border border-white/[0.08] px-3 text-xs font-bold text-slate-300 disabled:opacity-50">{togglingId === program.id ? "Guardando..." : program.active ? "Desactivar" : "Activar"}</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-5 rounded-[16px] bg-white/[0.025] p-5 text-center">
          <p className="text-sm font-semibold text-white">Aún no tienes programas por visitas.</p>
          <p className="mt-2 text-xs text-slate-500">Crea una campaña para premiar compras frecuentes.</p>
          <button type="button" onClick={onCreate} className="mt-4 h-10 rounded-[12px] bg-cyan-300 px-4 text-xs font-black text-slate-950">Crear programa</button>
        </div>
      )}
    </section>
  );
}

function getVisitProgramStatus(program: VisitProgram) {
  const now = Date.now();
  if (!program.active) return { label: "Inactiva", tone: "bg-white/[0.06] text-slate-400" };
  if (program.startsAt && new Date(program.startsAt).getTime() > now) return { label: "Próxima", tone: "bg-amber-300/[0.08] text-amber-200" };
  if (program.endsAt && new Date(program.endsAt).getTime() < now) return { label: "Finalizada", tone: "bg-rose-300/[0.08] text-rose-200" };
  return { label: "Activa", tone: "bg-emerald-300/[0.08] text-emerald-300" };
}

function formatVisitProgramValidity(program: VisitProgram) {
  if (!program.startsAt && !program.endsAt) return "Sin límite de vigencia";
  if (program.startsAt && program.endsAt) return `Del ${formatDateTime(program.startsAt)} al ${formatDateTime(program.endsAt)}`;
  if (program.startsAt) return `Inicia ${formatDateTime(program.startsAt)}`;
  return `Finaliza ${formatDateTime(program.endsAt as string)}`;
}

function VisitProgramModal({ form, rewards, saving, frozen, error, onChange, onClose, onSubmit }: {
  form: VisitProgramFormState;
  rewards: LoyaltyReward[];
  saving: boolean;
  frozen: boolean;
  error: string | null;
  onChange: <K extends keyof VisitProgramFormState>(field: K, value: VisitProgramFormState[K]) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const mechanicsDisabled = frozen;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-3 backdrop-blur-sm md:items-center md:p-6" role="dialog" aria-modal="true" aria-labelledby="visit-program-title">
      <form onSubmit={onSubmit} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[24px] border border-white/[0.08] bg-[#081524] p-5 shadow-2xl md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-300">Programa por visitas</p><h3 id="visit-program-title" className="mt-2 text-xl font-black text-white">{form.id ? "Editar programa" : "Crear programa"}</h3></div>
          <button type="button" onClick={onClose} disabled={saving} className="text-sm font-bold text-slate-400">Cerrar</button>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">Cada venta que cumpla el mínimo suma una visita. Al completar la meta, el cliente desbloquea la recompensa.</p>
        {error ? <p className="mt-4 rounded-[12px] bg-rose-300/[0.08] px-3 py-2 text-xs font-semibold text-rose-200">{error}</p> : null}
        {frozen ? <p className="mt-3 rounded-[12px] bg-amber-300/[0.07] px-3 py-2 text-xs text-amber-200">La mecánica está congelada. Puedes cambiar nombre, estado y fechas.</p> : null}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <VisitField label="Nombre" className="sm:col-span-2"><input value={form.name} onChange={(e) => onChange("name", e.target.value)} className="h-11 w-full rounded-[12px] border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white" /></VisitField>
          <VisitField label="Visitas necesarias"><input type="number" min="1" step="1" disabled={mechanicsDisabled} value={form.requiredVisits} onChange={(e) => onChange("requiredVisits", e.target.value)} className="h-11 w-full rounded-[12px] border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white disabled:opacity-50" /></VisitField>
          <VisitField label="Compra mínima"><input type="number" min="0" step="0.01" disabled={mechanicsDisabled} value={form.minimumSaleAmount} onChange={(e) => onChange("minimumSaleAmount", e.target.value)} className="h-11 w-full rounded-[12px] border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white disabled:opacity-50" /></VisitField>
          <VisitField label="Recompensa" className="sm:col-span-2"><select disabled={mechanicsDisabled || !rewards.length} value={form.rewardId} onChange={(e) => onChange("rewardId", e.target.value)} className="h-11 w-full rounded-[12px] border border-white/[0.08] bg-[#0b1928] px-3 text-sm text-white disabled:opacity-50"><option value="">Selecciona una recompensa</option>{rewards.map((reward) => <option key={reward.id} value={reward.id}>{reward.name} — {formatMoney(reward.rewardValue)}</option>)}</select>{!rewards.length ? <span className="mt-1 block text-[10px] text-amber-200">Primero crea una recompensa de descuento para usarla en este programa.</span> : null}</VisitField>
          <VisitField label="Fecha de inicio (opcional)"><input type="datetime-local" value={form.startsAt} onChange={(e) => onChange("startsAt", e.target.value)} className="h-11 w-full rounded-[12px] border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white" /></VisitField>
          <VisitField label="Fecha de fin (opcional)"><input type="datetime-local" value={form.endsAt} onChange={(e) => onChange("endsAt", e.target.value)} className="h-11 w-full rounded-[12px] border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white" /></VisitField>
          <label className="flex items-center gap-3 text-sm font-semibold text-white sm:col-span-2"><input type="checkbox" checked={form.active} onChange={(e) => onChange("active", e.target.checked)} className="h-4 w-4 accent-cyan-300" />Programa activo</label>
        </div>
        <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} disabled={saving} className="h-11 rounded-[12px] border border-white/[0.08] px-4 text-sm font-bold text-white">Cancelar</button><button type="submit" disabled={saving || !rewards.length} className="h-11 rounded-[12px] bg-cyan-300 px-5 text-sm font-black text-slate-950 disabled:opacity-50">{saving ? "Guardando..." : form.id ? "Guardar cambios" : "Crear programa"}</button></div>
      </form>
    </div>
  );
}

function VisitField({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  return <label className={`text-xs font-semibold text-slate-400 ${className}`}><span className="mb-1.5 block">{label}</span>{children}</label>;
}

function VisitProgramDisableModal({ program, saving, onClose, onConfirm }: { program: VisitProgram; saving: boolean; onClose: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true"><div className="w-full max-w-md rounded-[24px] border border-white/[0.08] bg-[#081524] p-6"><h3 className="text-xl font-black text-white">¿Desactivar este programa?</h3><p className="mt-3 text-sm leading-6 text-slate-400">Las ventas nuevas dejarán de sumar visitas en {program.name}, pero las recompensas ya desbloqueadas seguirán disponibles.</p><div className="mt-6 flex justify-end gap-2"><button type="button" disabled={saving} onClick={onClose} className="h-11 rounded-[12px] border border-white/[0.08] px-4 text-sm font-bold text-white">Cancelar</button><button type="button" disabled={saving} onClick={onConfirm} className="h-11 rounded-[12px] bg-amber-300 px-4 text-sm font-black text-slate-950 disabled:opacity-50">{saving ? "Guardando..." : "Desactivar"}</button></div></div></div>;
}

function formatCurrency(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: currency || "MXN",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  } catch {
    return `${currency || "MXN"} ${Number(value || 0).toFixed(2)}`;
  }
}

function parseNonNegativeNumber(value: string) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

async function apiRequest<T = unknown>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const data: unknown = await response.json();

  if (!isApiPayload(data)) {
    throw new Error("La API devolvió una respuesta no válida.");
  }

  if (!response.ok || data.ok !== true) {
    throw new ApiRequestError(
      typeof data.error === "string"
        ? data.error
        : typeof data.message === "string"
          ? data.message
          : "No se pudo completar la solicitud.",
      typeof data.code === "string" ? data.code : null
    );
  }

  return data as T;
}

function isApiPayload(
  value: unknown
): value is {
  ok?: boolean;
  error?: unknown;
  message?: unknown;
  code?: unknown;
} {
  return typeof value === "object" && value !== null;
}

class ApiRequestError extends Error {
  constructor(message: string, readonly code: string | null) {
    super(message);
    this.name = "ApiRequestError";
  }
}

function validateVisitProgramForm(form: VisitProgramFormState) {
  if (!form.name.trim()) return "El nombre es obligatorio.";
  const requiredVisits = Number(form.requiredVisits);
  if (!Number.isInteger(requiredVisits) || requiredVisits <= 0) return "Las visitas necesarias deben ser un entero mayor que cero.";
  const minimum = Number(form.minimumSaleAmount);
  if (!Number.isFinite(minimum) || minimum < 0) return "La compra mínima debe ser un número igual o mayor que cero.";
  if (!form.rewardId) return "Selecciona una recompensa.";
  if (form.startsAt && form.endsAt && new Date(form.endsAt).getTime() <= new Date(form.startsAt).getTime()) return "La fecha de fin debe ser posterior a la fecha de inicio.";
  return null;
}

function dateTimeLocalToIso(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function getVisitProgramErrorMessage(error: unknown) {
  if (!(error instanceof ApiRequestError)) return getErrorMessage(error);
  const messages: Record<string, string> = {
    POS_LOYALTY_VISIT_PROGRAM_FROZEN: "Esta campaña ya tiene visitas registradas. Para cambiar la mecánica, desactívala y crea una nueva.",
    POS_LOYALTY_VISIT_PROGRAM_DUPLICATE: "Ya existe un programa por visitas con ese nombre.",
    POS_LOYALTY_VISIT_REWARD_INVALID: "La recompensa seleccionada ya no está disponible o no es compatible.",
    POS_LOYALTY_VISIT_PROGRAM_NOT_FOUND: "Este programa ya no está disponible.",
    POS_LOYALTY_VISIT_PROGRAM_INVALID_RESPONSE: "No se pudo confirmar el programa actualizado.",
    POS_LOYALTY_VISIT_INVALID_PAYLOAD: "Revisa los datos del programa por visitas.",
  };
  return error.code ? messages[error.code] || error.message : error.message;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado.";
}
