import {
  assertDatabaseResult,
  booleanValue,
  getBrandSlugFromUrl,
  getPagination,
  fail,
  handlePosError,
  numberValue,
  ok,
  optionalText,
  PosApiError,
  readJsonBody,
  requiredText,
  uuidValue,
} from "@/lib/pos/server";
import { requirePosOperationalAccess } from "@/lib/pos/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LoyaltyBody = {
  brandSlug?: unknown;
  action?: unknown;
  name?: unknown;
  pointsPerCurrency?: unknown;
  redemptionValue?: unknown;
  minimumRedeemPoints?: unknown;
  pointsExpireDays?: unknown;
  active?: unknown;
  customerId?: unknown;
  points?: unknown;
  description?: unknown;
  rewardId?: unknown;
  pointsCost?: unknown;
  rewardValue?: unknown;
  tierId?: unknown;
  minimumLifetimePoints?: unknown;
  pointsMultiplier?: unknown;
  sortOrder?: unknown;
  visitProgramId?: unknown;
  requiredVisits?: unknown;
  minimumSaleAmount?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
};

export async function GET(request: Request) {
  try {
    const brandSlug = getBrandSlugFromUrl(request);
    const { admin, brand } = await requirePosOperationalAccess({ brandSlug, entitlement: "pos.loyalty" });
    const url = new URL(request.url);
    const view = url.searchParams.get("view");

    if (
      view === "visit_programs" ||
      view === "visit_progress" ||
      view === "reward_unlocks"
    ) {
      const { data: program, error: programError } = await admin
        .from("pos_loyalty_programs")
        .select("id")
        .eq("brand_slug", brand.slug)
        .maybeSingle();

      assertDatabaseResult(
        programError,
        "No se pudo cargar el programa de fidelización."
      );

      if (view === "visit_programs") {
        if (!program) return ok({ visitPrograms: [] });

        const { data, error } = await admin
          .from("pos_loyalty_visit_programs")
          .select(`
            id,
            name,
            required_visits,
            minimum_sale_amount,
            reward_id,
            active,
            starts_at,
            ends_at,
            created_at,
            updated_at,
            reward:pos_loyalty_rewards(
              id,
              name,
              reward_type,
              reward_value,
              active
            )
          `)
          .eq("brand_slug", brand.slug)
          .eq("loyalty_program_id", program.id)
          .order("created_at", { ascending: false });

        assertDatabaseResult(
          error,
          "No se pudieron cargar los programas de visitas."
        );

        return ok({
          visitPrograms: (data || []).map(normalizeVisitProgram),
        });
      }

      const customerId = uuidValue(
        url.searchParams.get("customerId"),
        "customerId"
      ) as string;

      if (!program) {
        return ok(
          view === "visit_progress"
            ? { member: null, programs: [] }
            : { unlocks: [] }
        );
      }

      const { data: member, error: memberError } = await admin
        .from("pos_loyalty_members")
        .select("id, customer_id, points_balance, lifetime_points, status")
        .eq("brand_slug", brand.slug)
        .eq("program_id", program.id)
        .eq("customer_id", customerId)
        .maybeSingle();

      assertDatabaseResult(
        memberError,
        "No se pudo cargar la membresía de fidelización."
      );

      if (!member) {
        return ok(
          view === "visit_progress"
            ? { member: null, programs: [] }
            : { unlocks: [] }
        );
      }

      if (view === "reward_unlocks") {
        const { data, error } = await admin.rpc(
          "pos_get_available_loyalty_reward_unlocks",
          {
            p_brand_slug: brand.slug,
            p_member_id: member.id,
          }
        );

        assertDatabaseResult(
          error,
          "No se pudieron cargar las recompensas desbloqueadas."
        );

        return ok({
          unlocks: (data || []).map(normalizeRewardUnlock),
        });
      }

      const { data: visitPrograms, error: visitProgramsError } = await admin
        .from("pos_loyalty_visit_programs")
        .select("id, name, required_visits, minimum_sale_amount, reward_id, active, starts_at, ends_at")
        .eq("brand_slug", brand.slug)
        .eq("loyalty_program_id", program.id)
        .order("id", { ascending: true });

      assertDatabaseResult(
        visitProgramsError,
        "No se pudieron cargar los programas de visitas."
      );

      const programs = await Promise.all(
        (visitPrograms || []).map(async (visitProgram) => {
          const { data, error } = await admin.rpc(
            "pos_get_loyalty_visit_progress",
            {
              p_brand_slug: brand.slug,
              p_visit_program_id: visitProgram.id,
              p_member_id: member.id,
            }
          );

          assertDatabaseResult(
            error,
            "No se pudo calcular el progreso de visitas."
          );

          const progress = Array.isArray(data) ? data[0] : data;
          return {
            id: visitProgram.id,
            name: visitProgram.name,
            requiredVisits: Number(visitProgram.required_visits),
            minimumSaleAmount: Number(visitProgram.minimum_sale_amount),
            rewardId: visitProgram.reward_id,
            active: visitProgram.active,
            startsAt: visitProgram.starts_at,
            endsAt: visitProgram.ends_at,
            completedVisits: Number(progress?.completedVisits || 0),
            cyclesCompleted: Number(progress?.cyclesCompleted || 0),
            currentProgress: Number(progress?.currentProgress || 0),
          };
        })
      );

      return ok({
        member: {
          id: member.id,
          customerId: member.customer_id,
          status: member.status,
          pointsBalance: Number(member.points_balance || 0),
          lifetimePoints: Number(member.lifetime_points || 0),
        },
        programs,
      });
    }

    if (view === "tiers") {
      const { data: program, error: programError } = await admin
        .from("pos_loyalty_programs")
        .select("id")
        .eq("brand_slug", brand.slug)
        .maybeSingle();
      assertDatabaseResult(programError, "No se pudo cargar el programa de fidelización.");
      if (!program) return ok({ tiers: [] });

      const { data, error } = await admin
        .from("pos_loyalty_tiers")
        .select("id, name, minimum_lifetime_points, points_multiplier, sort_order, active, created_at, updated_at")
        .eq("brand_slug", brand.slug)
        .eq("program_id", program.id)
        .order("minimum_lifetime_points", { ascending: true });
      assertDatabaseResult(error, "No se pudieron cargar los niveles.");
      return ok({ tiers: (data || []).map(normalizeTier) });
    }

    if (view === "rewards" || view === "available_rewards") {
      const { data: program, error: programError } = await admin
        .from("pos_loyalty_programs")
        .select("id, active")
        .eq("brand_slug", brand.slug)
        .maybeSingle();

      assertDatabaseResult(
        programError,
        "No se pudo cargar el programa de fidelización."
      );

      if (!program || (view === "available_rewards" && !program.active)) {
        return ok({
          ...(view === "available_rewards" ? { member: null } : {}),
          rewards: [],
        });
      }

      if (view === "rewards") {
        const { data, error } = await admin
          .from("pos_loyalty_rewards")
          .select(
            "id, name, description, points_cost, reward_value, active, created_at, updated_at"
          )
          .eq("brand_slug", brand.slug)
          .eq("program_id", program.id)
          .eq("reward_type", "discount_fixed")
          .order("created_at", { ascending: false });

        assertDatabaseResult(error, "No se pudieron cargar las recompensas.");

        return ok({
          rewards: (data || []).map((reward) => ({
            id: reward.id,
            name: reward.name,
            description: reward.description,
            pointsCost: Number(reward.points_cost),
            rewardValue: Number(reward.reward_value),
            active: reward.active,
            createdAt: reward.created_at,
            updatedAt: reward.updated_at,
          })),
        });
      }

      const customerId = uuidValue(
        url.searchParams.get("customerId"),
        "customerId"
      ) as string;
      const [{ data: member, error: memberError }, { data: rewards, error: rewardsError }] =
        await Promise.all([
          admin
            .from("pos_loyalty_members")
            .select("id, points_balance, lifetime_points, tier:pos_loyalty_tiers(id, name, minimum_lifetime_points, points_multiplier)")
            .eq("brand_slug", brand.slug)
            .eq("program_id", program.id)
            .eq("customer_id", customerId)
            .eq("status", "active")
            .maybeSingle(),
          admin
            .from("pos_loyalty_rewards")
            .select("id, name, description, points_cost, reward_value")
            .eq("brand_slug", brand.slug)
            .eq("program_id", program.id)
            .eq("reward_type", "discount_fixed")
            .eq("active", true)
            .order("points_cost", { ascending: true }),
        ]);

      assertDatabaseResult(memberError, "No se pudo cargar la membresía de fidelización.");
      assertDatabaseResult(rewardsError, "No se pudieron cargar las recompensas disponibles.");

      const pointsBalance = Number(member?.points_balance || 0);

      return ok({
        member: member
          ? {
              id: member.id,
              pointsBalance,
              lifetimePoints: Number(member.lifetime_points || 0),
              tier: firstRelation(member.tier)
                ? {
                    id: firstRelation(member.tier)?.id,
                    name: firstRelation(member.tier)?.name,
                    minimumLifetimePoints: Number(firstRelation(member.tier)?.minimum_lifetime_points || 0),
                    pointsMultiplier: Number(firstRelation(member.tier)?.points_multiplier || 1),
                  }
                : null,
            }
          : null,
        rewards: (rewards || []).map((reward) => {
          const pointsCost = Number(reward.points_cost);
          const available = Boolean(member) && pointsCost <= pointsBalance;
          return {
            id: reward.id,
            name: reward.name,
            description: reward.description,
            pointsCost,
            rewardValue: Number(reward.reward_value),
            available,
            unavailableReason: !member
              ? "El cliente no tiene una membresía activa."
              : available
                ? null
                : "Saldo de puntos insuficiente.",
          };
        }),
      });
    }

    if (view === "transactions") {
      const { page, pageSize, from, to } = getPagination(request);
      const { data, error, count } = await admin
        .from("pos_loyalty_transactions")
        .select(
          `
          id,
          created_at,
          transaction_type,
          points,
          balance_after,
          description,
          created_by,
          member:pos_loyalty_members!inner(
            id,
            customer:pos_customers!inner(
              id,
              first_name,
              last_name
            )
          ),
          sale:pos_sales(
            id,
            sale_number,
            total,
            currency
          )
          `,
          { count: "exact" }
        )
        .eq("brand_slug", brand.slug)
        .order("created_at", { ascending: false })
        .range(from, to);

      assertDatabaseResult(
        error,
        "No se pudo cargar el historial de puntos."
      );

      const transactions = (data || []).map((row) => {
        const member = firstRelation(row.member);
        const customer = firstRelation(member?.customer);
        const sale = firstRelation(row.sale);

        return {
          id: row.id,
          createdAt: row.created_at,
          transactionType: row.transaction_type,
          points: row.points,
          balanceAfter: row.balance_after,
          description: row.description,
          member: {
            id: member?.id || null,
            customer: {
              id: customer?.id || null,
              firstName: customer?.first_name || "",
              lastName: customer?.last_name || null,
            },
          },
          sale: sale
            ? {
                id: sale.id,
                saleNumber: sale.sale_number,
                total: sale.total,
                currency: sale.currency,
              }
            : null,
          createdBy: row.created_by,
        };
      });

      return ok({
        transactions,
        pagination: {
          page,
          pageSize,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / pageSize),
        },
      });
    }

    const [
      programResult,
      membersResult,
      rewardsResult,
      walletPassesResult,
    ] = await Promise.all([
      admin
        .from("pos_loyalty_programs")
        .select(
          "*, tiers:pos_loyalty_tiers(*), rewards:pos_loyalty_rewards(*)"
        )
        .eq("brand_slug", brand.slug)
        .maybeSingle(),
      admin
        .from("pos_loyalty_members")
        .select("id", { count: "exact", head: true })
        .eq("brand_slug", brand.slug)
        .eq("status", "active"),
      admin
        .from("pos_loyalty_rewards")
        .select("id", { count: "exact", head: true })
        .eq("brand_slug", brand.slug)
        .eq("active", true),
      admin
        .from("pos_wallet_passes")
        .select("id", { count: "exact", head: true })
        .eq("brand_slug", brand.slug)
        .eq("pass_status", "active"),
    ]);

    assertDatabaseResult(
      programResult.error,
      "No se pudo cargar el programa de lealtad."
    );
    assertDatabaseResult(
      membersResult.error,
      "No se pudieron contar los miembros."
    );
    assertDatabaseResult(
      rewardsResult.error,
      "No se pudieron contar las recompensas."
    );
    assertDatabaseResult(
      walletPassesResult.error,
      "No se pudieron contar las tarjetas Wallet."
    );

    return ok({
      brand,
      program: programResult.data || null,
      counts: {
        members: membersResult.count || 0,
        rewards: rewardsResult.count || 0,
        walletPasses: walletPassesResult.count || 0,
      },
    });
  } catch (error) {
    return handlePosError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<LoyaltyBody>(request);
    const brandSlug = requiredText(
      body.brandSlug,
      "brandSlug",
      120
    );
    const action = requiredText(body.action, "action", 40);
    const { admin, brand, user } =
      await requirePosOperationalAccess({ brandSlug, entitlement: "pos.loyalty" });

    if (
      action === "create_visit_program" ||
      action === "update_visit_program" ||
      action === "set_visit_program_active"
    ) {
      const visitProgramId = action === "create_visit_program"
        ? null
        : uuidValue(body.visitProgramId, "visitProgramId") as string;

      if (action === "set_visit_program_active") {
        if (typeof body.active !== "boolean") {
          return fail(
            "active debe ser boolean.",
            400,
            "POS_LOYALTY_VISIT_INVALID_PAYLOAD"
          );
        }

        const { data, error } = await admin.rpc(
          "pos_set_loyalty_visit_program_active",
          {
            p_brand_slug: brand.slug,
            p_visit_program_id: visitProgramId,
            p_active: body.active,
          }
        );

        const mappedError = mapVisitProgramRpcError(error);
        if (mappedError) return mappedError;
        assertDatabaseResult(error, "No se pudo actualizar el estado del programa por visitas.");

        const result = asRecord(data);
        const visitProgram = await loadVisitProgramForResponse(
          admin,
          brand.slug,
          String(result?.id || visitProgramId)
        );
        return ok({ visitProgram });
      }

      const payload = parseVisitProgramPayload(body, action === "create_visit_program");
      const rpcName = action === "create_visit_program"
        ? "pos_create_loyalty_visit_program"
        : "pos_update_loyalty_visit_program";
      const { data, error } = await admin.rpc(rpcName, {
        p_brand_slug: brand.slug,
        ...(visitProgramId ? { p_visit_program_id: visitProgramId } : {}),
        p_name: payload.name,
        p_required_visits: payload.requiredVisits,
        p_minimum_sale_amount: payload.minimumSaleAmount,
        p_reward_id: payload.rewardId,
        p_active: payload.active,
        p_starts_at: payload.startsAt,
        p_ends_at: payload.endsAt,
        ...(action === "create_visit_program" ? { p_user_id: user.userId } : {}),
      });

      const mappedError = mapVisitProgramRpcError(error);
      if (mappedError) return mappedError;
      assertDatabaseResult(
        error,
        action === "create_visit_program"
          ? "No se pudo crear el programa por visitas."
          : "No se pudo actualizar el programa por visitas."
      );

      const result = asRecord(data);
      if (!result?.id) {
        throw new PosApiError(
          500,
          "POS_LOYALTY_VISIT_PROGRAM_INVALID_RESPONSE",
          "El programa por visitas no devolvió un identificador válido."
        );
      }
      const visitProgram = await loadVisitProgramForResponse(
        admin,
        brand.slug,
        String(result.id)
      );
      return ok(
        { visitProgram },
        action === "create_visit_program" ? 201 : 200
      );
    }

    if (action === "configure_program") {
      const payload = {
        brand_id: brand.id,
        brand_slug: brand.slug,
        name:
          optionalText(body.name, 140) ||
          `${brand.name} Rewards`,
        points_per_currency: numberValue(
          body.pointsPerCurrency,
          "pointsPerCurrency",
          {
            min: 0,
            defaultValue: 1,
          }
        ),
        redemption_value: numberValue(
          body.redemptionValue,
          "redemptionValue",
          {
            min: 0,
            defaultValue: 0.01,
          }
        ),
        minimum_redeem_points: numberValue(
          body.minimumRedeemPoints,
          "minimumRedeemPoints",
          {
            min: 0,
            defaultValue: 100,
          }
        ),
        points_expire_days:
          body.pointsExpireDays === null
            ? null
            : numberValue(
                body.pointsExpireDays,
                "pointsExpireDays",
                {
                  min: 1,
                  defaultValue: 365,
                }
              ),
        active: booleanValue(body.active, true),
        created_by: user.userId,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await admin
        .from("pos_loyalty_programs")
        .upsert(payload, {
          onConflict: "brand_slug",
        })
        .select("*")
        .single();

      assertDatabaseResult(
        error,
        "No se pudo configurar fidelización."
      );

      return ok({
        program: data,
      });
    }

    if (action === "register_member") {
      const customerId = uuidValue(
        body.customerId,
        "customerId"
      ) as string;

      const { data, error } = await admin.rpc(
        "pos_register_loyalty_member_v2",
        {
          p_brand_slug: brand.slug,
          p_customer_id: customerId,
          p_user_id: user.userId,
        }
      );

      assertDatabaseResult(
        error,
        "No se pudo registrar al cliente en fidelización."
      );

      return ok(
        {
          member: Array.isArray(data) ? data[0] : data,
        },
        201
      );
    }

    if (action === "adjust_points") {
      const customerId = uuidValue(
        body.customerId,
        "customerId"
      ) as string;
      const points = numberValue(
        body.points,
        "points"
      );
      const description = requiredText(
        body.description,
        "description",
        500
      );

      if (!Number.isInteger(points)) {
        return fail(
          "El ajuste de puntos debe ser un nÃºmero entero.",
          400,
          "POS_VALIDATION_ERROR"
        );
      }

      if (points === 0) {
        return fail(
          "El ajuste de puntos debe ser distinto de cero.",
          400,
          "POS_VALIDATION_ERROR"
        );
      }

      const { data, error } = await admin.rpc(
        "pos_loyalty_adjust_points",
        {
          p_brand_slug: brand.slug,
          p_customer_id: customerId,
          p_points: points,
          p_description: description,
          p_user_id: user.userId,
        }
      );

      assertDatabaseResult(
        error,
        "No se pudieron ajustar los puntos."
      );

      return ok({
        member: Array.isArray(data) ? data[0] : data,
      });
    }

    if (
      action === "create_tier" ||
      action === "update_tier" ||
      action === "set_tier_active"
    ) {
      const tierId = action === "create_tier"
        ? null
        : uuidValue(body.tierId, "tierId") as string;

      if (action === "set_tier_active") {
        if (typeof body.active !== "boolean") {
          return fail("active debe ser boolean.", 400, "POS_VALIDATION_ERROR");
        }
        const { data, error } = await admin.rpc("pos_set_loyalty_tier_active", {
          p_brand_slug: brand.slug,
          p_tier_id: tierId,
          p_active: body.active,
        });
        assertDatabaseResult(error, "No se pudo actualizar el estado del nivel.");
        return ok({ tier: normalizeTier(Array.isArray(data) ? data[0] : data) });
      }

      const name = requiredText(body.name, "name", 120);
      const minimum = numberValue(body.minimumLifetimePoints, "minimumLifetimePoints", { min: 0 });
      const multiplier = numberValue(body.pointsMultiplier, "pointsMultiplier", { min: 0.0001 });
      const sortOrder = numberValue(body.sortOrder, "sortOrder", { defaultValue: minimum });
      if (!Number.isInteger(minimum) || !Number.isInteger(sortOrder)) {
        return fail("El umbral y el orden deben ser enteros.", 400, "POS_VALIDATION_ERROR");
      }
      if (typeof body.active !== "boolean") {
        return fail("active debe ser boolean.", 400, "POS_VALIDATION_ERROR");
      }

      const rpc = action === "create_tier" ? "pos_create_loyalty_tier" : "pos_update_loyalty_tier";
      const params = {
        p_brand_slug: brand.slug,
        ...(tierId ? { p_tier_id: tierId } : {}),
        p_name: name,
        p_minimum_lifetime_points: minimum,
        p_points_multiplier: multiplier,
        p_sort_order: sortOrder,
        p_active: body.active,
      };
      const { data, error } = await admin.rpc(rpc, params);
      assertDatabaseResult(error, action === "create_tier" ? "No se pudo crear el nivel." : "No se pudo actualizar el nivel.");
      return ok({ tier: normalizeTier(Array.isArray(data) ? data[0] : data) }, action === "create_tier" ? 201 : 200);
    }

    if (
      action === "create_reward" ||
      action === "update_reward" ||
      action === "set_reward_active"
    ) {
      const { data: program, error: programError } = await admin
        .from("pos_loyalty_programs")
        .select("id")
        .eq("brand_slug", brand.slug)
        .maybeSingle();

      assertDatabaseResult(
        programError,
        "No se pudo cargar el programa de fidelización."
      );

      if (!program) {
        return fail(
          "Configura el programa de fidelización antes de administrar recompensas.",
          400,
          "POS_LOYALTY_PROGRAM_REQUIRED"
        );
      }

      if (action === "create_reward") {
        if (typeof body.active !== "boolean") {
          return fail("active debe ser boolean.", 400, "POS_VALIDATION_ERROR");
        }
        const payload = rewardPayload(body);
        const { data, error } = await admin
          .from("pos_loyalty_rewards")
          .insert({
            brand_id: brand.id,
            brand_slug: brand.slug,
            program_id: program.id,
            reward_type: "discount_fixed",
            metadata: {},
            ...payload,
          })
          .select("*")
          .single();

        assertDatabaseResult(error, "No se pudo crear la recompensa.");
        return ok({ reward: data }, 201);
      }

      const rewardId = uuidValue(body.rewardId, "rewardId") as string;
      const { data: existingReward, error: rewardError } = await admin
        .from("pos_loyalty_rewards")
        .select("id")
        .eq("id", rewardId)
        .eq("brand_slug", brand.slug)
        .eq("program_id", program.id)
        .eq("reward_type", "discount_fixed")
        .maybeSingle();

      assertDatabaseResult(rewardError, "No se pudo validar la recompensa.");
      if (!existingReward) {
        return fail("La recompensa no existe para esta marca.", 404, "POS_LOYALTY_REWARD_NOT_FOUND");
      }

      if (typeof body.active !== "boolean") {
        return fail("active debe ser boolean.", 400, "POS_VALIDATION_ERROR");
      }
      const updates = action === "set_reward_active"
        ? { active: body.active }
        : rewardPayload(body);
      const { data, error } = await admin
        .from("pos_loyalty_rewards")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", rewardId)
        .eq("brand_slug", brand.slug)
        .eq("program_id", program.id)
        .select("*")
        .single();

      assertDatabaseResult(error, "No se pudo actualizar la recompensa.");
      return ok({ reward: data });
    }

    return fail(
      "Acción de fidelización no reconocida.",
      400,
      "POS_LOYALTY_ACTION_INVALID"
    );
  } catch (error) {
    return handlePosError(error);
  }
}

function firstRelation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function rewardPayload(body: LoyaltyBody) {
  const name = requiredText(body.name, "name", 140);
  const description = optionalText(body.description, 500);
  const pointsCost = numberValue(body.pointsCost, "pointsCost", { min: 1 });
  const rewardValue = numberValue(body.rewardValue, "rewardValue", { min: 0.01 });

  if (!Number.isInteger(pointsCost)) {
    throw new PosApiError(400, "POS_VALIDATION_ERROR", "pointsCost debe ser un número entero.");
  }

  if (Math.abs(rewardValue * 100 - Math.round(rewardValue * 100)) > 1e-8) {
    throw new PosApiError(400, "POS_VALIDATION_ERROR", "rewardValue admite como máximo dos decimales.");
  }

  return {
    name,
    description,
    points_cost: pointsCost,
    reward_value: rewardValue,
    active: booleanValue(body.active, true),
  };
}

function normalizeTier(tier: Record<string, unknown> | null) {
  if (!tier) return null;
  return {
    id: String(tier.id),
    name: String(tier.name),
    minimumLifetimePoints: Number(tier.minimum_lifetime_points || 0),
    pointsMultiplier: Number(tier.points_multiplier || 1),
    sortOrder: Number(tier.sort_order || 0),
    active: Boolean(tier.active),
    createdAt: tier.created_at ? String(tier.created_at) : null,
    updatedAt: tier.updated_at ? String(tier.updated_at) : null,
  };
}

function normalizeVisitProgram(program: Record<string, unknown>) {
  const reward = firstRelation(
    program.reward as Record<string, unknown> | Record<string, unknown>[] | null
  );
  return {
    id: String(program.id),
    name: String(program.name),
    requiredVisits: Number(program.required_visits),
    minimumSaleAmount: Number(program.minimum_sale_amount),
    rewardId: String(program.reward_id),
    reward: reward
      ? {
          id: String(reward.id),
          name: String(reward.name),
          rewardType: String(reward.reward_type),
          rewardValue: Number(reward.reward_value),
          active: Boolean(reward.active),
        }
      : null,
    active: Boolean(program.active),
    startsAt: program.starts_at ? String(program.starts_at) : null,
    endsAt: program.ends_at ? String(program.ends_at) : null,
    createdAt: program.created_at ? String(program.created_at) : null,
    updatedAt: program.updated_at ? String(program.updated_at) : null,
  };
}

function normalizeRewardUnlock(unlock: Record<string, unknown>) {
  return {
    id: String(unlock.id),
    visitProgramId: String(unlock.visit_program_id),
    memberId: String(unlock.member_id),
    rewardId: String(unlock.reward_id),
    cycleNumber: Number(unlock.cycle_number),
    rewardName: String(unlock.reward_name),
    rewardType: String(unlock.reward_type),
    rewardValue: Number(unlock.reward_value),
    requiredVisits: Number(unlock.required_visits_snapshot),
    minimumSaleAmount: Number(unlock.minimum_sale_amount_snapshot),
    unlockedAt: String(unlock.unlocked_at),
  };
}

type VisitProgramPayload = {
  name: string;
  requiredVisits: number;
  minimumSaleAmount: number;
  rewardId: string;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
};

type DatabaseErrorLike = {
  code?: string;
  message?: string;
} | null;

function parseVisitProgramPayload(
  body: LoyaltyBody,
  isCreate: boolean
): VisitProgramPayload {
  const name = requiredText(body.name, "name", 140).trim();
  const requiredVisits = numberValue(
    body.requiredVisits,
    "requiredVisits",
    { min: 1 }
  );
  const minimumSaleAmount = numberValue(
    body.minimumSaleAmount,
    "minimumSaleAmount",
    { min: 0 }
  );
  const rewardId = uuidValue(body.rewardId, "rewardId") as string;

  if (!Number.isInteger(requiredVisits)) {
    throw new PosApiError(
      400,
      "POS_LOYALTY_VISIT_INVALID_PAYLOAD",
      "requiredVisits debe ser un número entero mayor que cero."
    );
  }
  if (!Number.isFinite(minimumSaleAmount)) {
    throw new PosApiError(
      400,
      "POS_LOYALTY_VISIT_INVALID_PAYLOAD",
      "minimumSaleAmount debe ser un número válido."
    );
  }
  if (!isCreate && typeof body.active !== "boolean") {
    throw new PosApiError(
      400,
      "POS_LOYALTY_VISIT_INVALID_PAYLOAD",
      "active debe ser boolean."
    );
  }
  if (body.active !== undefined && typeof body.active !== "boolean") {
    throw new PosApiError(
      400,
      "POS_LOYALTY_VISIT_INVALID_PAYLOAD",
      "active debe ser boolean."
    );
  }

  const startsAt = parseOptionalIsoDate(body.startsAt, "startsAt");
  const endsAt = parseOptionalIsoDate(body.endsAt, "endsAt");
  if (startsAt && endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    throw new PosApiError(
      400,
      "POS_LOYALTY_VISIT_INVALID_PAYLOAD",
      "endsAt debe ser posterior a startsAt."
    );
  }

  return {
    name,
    requiredVisits,
    minimumSaleAmount,
    rewardId,
    active: isCreate ? booleanValue(body.active, true) : body.active as boolean,
    startsAt,
    endsAt,
  };
}

function parseOptionalIsoDate(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new PosApiError(400, "POS_LOYALTY_VISIT_INVALID_PAYLOAD", `${field} debe ser una fecha ISO válida o null.`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new PosApiError(400, "POS_LOYALTY_VISIT_INVALID_PAYLOAD", `${field} debe ser una fecha ISO válida o null.`);
  }
  return new Date(timestamp).toISOString();
}

function mapVisitProgramRpcError(error: DatabaseErrorLike) {
  if (!error) return null;
  const message = error.message || "";

  if (error.code === "23505") {
    return fail(
      "Ya existe un programa por visitas con ese nombre.",
      409,
      "POS_LOYALTY_VISIT_PROGRAM_DUPLICATE"
    );
  }
  if (message.includes("mecánica") || message.includes("mecÃ¡nica")) {
    return fail(
      "Esta campaña ya tiene visitas registradas. Para cambiar la mecánica, desactívala y crea una nueva.",
      409,
      "POS_LOYALTY_VISIT_PROGRAM_FROZEN"
    );
  }
  if (message.includes("programa de visitas no existe o pertenece a otra marca")) {
    return fail(
      "El programa por visitas no existe para esta marca.",
      404,
      "POS_LOYALTY_VISIT_PROGRAM_NOT_FOUND"
    );
  }
  if (message.includes("recompensa no existe") || message.includes("recompensa no est")) {
    return fail(
      "La recompensa no existe, no está activa o no es compatible con programas por visitas.",
      400,
      "POS_LOYALTY_VISIT_REWARD_INVALID"
    );
  }
  if (
    message.includes("meta de visitas") ||
    message.includes("compra mínima") ||
    message.includes("compra mÃ­nima") ||
    message.includes("fecha final") ||
    message.includes("nombre del programa") ||
    message.includes("estado del programa")
  ) {
    return fail(
      "Los datos del programa por visitas no son válidos.",
      400,
      "POS_LOYALTY_VISIT_INVALID_PAYLOAD"
    );
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  const item = Array.isArray(value) ? value[0] : value;
  return typeof item === "object" && item !== null
    ? item as Record<string, unknown>
    : null;
}

async function loadVisitProgramForResponse(
  admin: Awaited<ReturnType<typeof requirePosOperationalAccess>>["admin"],
  brandSlug: string,
  visitProgramId: string
) {
  const { data, error } = await admin
    .from("pos_loyalty_visit_programs")
    .select(`
      id, name, required_visits, minimum_sale_amount, reward_id,
      active, starts_at, ends_at, created_at, updated_at,
      reward:pos_loyalty_rewards(id, name, reward_type, reward_value, active)
    `)
    .eq("id", visitProgramId)
    .eq("brand_slug", brandSlug)
    .maybeSingle();

  assertDatabaseResult(error, "No se pudo cargar el programa por visitas actualizado.");
  if (!data) {
    throw new PosApiError(
      404,
      "POS_LOYALTY_VISIT_PROGRAM_NOT_FOUND",
      "El programa por visitas no existe para esta marca."
    );
  }
  return normalizeVisitProgram(data);
}
