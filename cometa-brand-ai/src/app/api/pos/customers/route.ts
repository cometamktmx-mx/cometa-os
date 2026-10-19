import { requirePosMutationAccess } from "@/lib/pos/mutation-access";
import { getPosMode, requireRetailPermission } from "@/lib/pos/staff-server";
import {
  assertDatabaseResult,
  booleanValue,
  getBrandSlugFromUrl,
  fail,
  getPagination,
  handlePosError,
  ok,
  optionalText,
  readJsonBody,
  requiredText,
  uuidValue,
} from "@/lib/pos/server";
import { requirePosOperationalAccess } from "@/lib/pos/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CustomerBody = {
  factoryPriceBenefit?: unknown;
  brandSlug?: unknown;
  customerId?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  phone?: unknown;
  email?: unknown;
  birthday?: unknown;
  marketingConsent?: unknown;
  walletConsent?: unknown;
  notes?: unknown;
  tags?: unknown;
};

const hasOwn = (value: object, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);

export async function GET(request: Request) {
  try {
    const brandSlug = getBrandSlugFromUrl(request);
    const context = await requirePosOperationalAccess({ brandSlug, entitlement: "pos.customers" });
    const { admin, brand } = context;
    const { page, pageSize, from, to } =
      getPagination(request);

    const url = new URL(request.url);
    const search = String(
      url.searchParams.get("search") || ""
    ).trim();

    let query = admin
      .from("pos_customers")
      .select(
        `
        *,
        loyalty_member:pos_loyalty_members(
          id,
          member_number,
          points_balance,
          lifetime_points,
          status,
          tier:pos_loyalty_tiers(id,name,minimum_lifetime_points,points_multiplier)
        )
        `,
        { count: "exact" }
      )
      .eq("brand_slug", brand.slug)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`
      );
    }

    const { data, error, count } = await query;

    assertDatabaseResult(
      error,
      "No se pudieron cargar los clientes."
    );

    let customers = data || [];
    if (customers.length && await getPosMode(context) === "RETAIL") {
      const benefits = await admin.from("pos_customer_factory_benefits").select("customer_id,enabled").eq("brand_slug", brand.slug).in("customer_id", customers.map(c => c.id));
      assertDatabaseResult(benefits.error, "No se pudieron validar los beneficios de clientes.");
      const enabled = new Set((benefits.data || []).filter(b => b.enabled).map(b => b.customer_id));
      customers = customers.map(c => ({ ...c, factory_price_benefit: enabled.has(c.id) }));
    }
    return ok({
      brand,
      customers,
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
    });
  } catch (error) {
    return handlePosError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<CustomerBody>(request);
    const brandSlug = requiredText(
      body.brandSlug,
      "brandSlug",
      120
    );
    const context = await requirePosMutationAccess({ brandSlug: brandSlug, operation: "customers.create" });
    const { admin, brand, user } = context;
    let benefitSession: string | null = null;
    if (hasOwn(body, "factoryPriceBenefit")) {
      if (await getPosMode(context) !== "RETAIL" || typeof body.factoryPriceBenefit !== "boolean") return fail("Beneficio no válido para esta operación.", 400, "POS_VALIDATION_ERROR");
      benefitSession = (await requireRetailPermission(context, "SETTINGS"))?.id || null;
      if (!benefitSession) return fail("Selecciona un administrador.", 403, "POS_PERMISSION_REQUIRED");
    }

    const firstName = requiredText(
      body.firstName,
      "firstName",
      100
    );
    const phone = optionalText(body.phone, 40);
    const email = optionalText(body.email, 180);

    if (!phone && !email) {
      return fail(
        "Registra al menos teléfono o correo electrónico.",
        400,
        "POS_CUSTOMER_CONTACT_REQUIRED"
      );
    }

    const birthdayText = optionalText(body.birthday, 10);

    if (
      birthdayText &&
      !/^\d{4}-\d{2}-\d{2}$/.test(birthdayText)
    ) {
      return fail(
        "birthday debe utilizar el formato YYYY-MM-DD.",
        400,
        "POS_CUSTOMER_BIRTHDAY_INVALID"
      );
    }

    const customerFields = {
        brand_id: brand.id,
        brand_slug: brand.slug,
        first_name: firstName,
        last_name: optionalText(body.lastName, 100),
        phone,
        email: email?.toLowerCase() || null,
        birthday: birthdayText,
        marketing_consent: booleanValue(
          body.marketingConsent,
          false
        ),
        wallet_consent: booleanValue(
          body.walletConsent,
          false
        ),
        notes: optionalText(body.notes, 1500),
        tags:
          body.tags && typeof body.tags === "object"
            ? body.tags
            : [],
        active: true,
        created_by: user.userId,
      };
    const { data, error } = benefitSession
      ? await admin.rpc("pos_retail_customer_save_v1", { p_brand: brand.slug, p_actor: user.userId, p_session: benefitSession, p_customer: null, p_fields: customerFields, p_benefit: body.factoryPriceBenefit })
      : await admin.from("pos_customers").insert(customerFields).select("*").single();

    if (error?.code === "23505") {
      return fail(
        "Ya existe un cliente con ese teléfono o correo.",
        409,
        "POS_CUSTOMER_DUPLICATED"
      );
    }

    assertDatabaseResult(
      error,
      "No se pudo crear el cliente."
    );

    return ok(
      {
        customer: data,
      },
      201
    );
  } catch (error) {
    return handlePosError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await readJsonBody<CustomerBody>(request);
    const brandSlug = requiredText(body.brandSlug, "brandSlug", 120);
    const customerId = uuidValue(body.customerId, "customerId") as string;
    const context = await requirePosMutationAccess({ brandSlug: brandSlug, operation: "customers.write" });
    const { admin, brand } = context;
    let benefitSession: string | null = null;
    if (hasOwn(body, "factoryPriceBenefit")) {
      if (await getPosMode(context) !== "RETAIL" || typeof body.factoryPriceBenefit !== "boolean") return fail("Beneficio no válido para esta operación.", 400, "POS_VALIDATION_ERROR");
      benefitSession = (await requireRetailPermission(context, "SETTINGS"))?.id || null;
      if (!benefitSession) return fail("Selecciona un administrador.", 403, "POS_PERMISSION_REQUIRED");
    }

    const { data: existing, error: existingError } = await admin
      .from("pos_customers")
      .select("id,first_name,last_name,phone,email,notes")
      .eq("brand_slug", brand.slug)
      .eq("id", customerId)
      .maybeSingle();

    assertDatabaseResult(existingError, "No se pudo validar el cliente.");

    if (!existing) {
      return fail("Cliente no encontrado.", 404, "POS_CUSTOMER_NOT_FOUND");
    }

    const updates: Record<string, string | null> = {};

    if (hasOwn(body, "firstName")) {
      updates.first_name = requiredText(body.firstName, "firstName", 100);
    }
    if (hasOwn(body, "lastName")) {
      updates.last_name = optionalText(body.lastName, 100);
    }
    if (hasOwn(body, "phone")) {
      updates.phone = optionalText(body.phone, 40);
    }
    if (hasOwn(body, "email")) {
      updates.email = optionalText(body.email, 180)?.toLowerCase() || null;
    }
    if (hasOwn(body, "notes")) {
      updates.notes = optionalText(body.notes, 1500);
    }

    if (Object.keys(updates).length === 0 && !benefitSession) {
      return fail("No hay cambios editables para guardar.", 400, "POS_CUSTOMER_UPDATE_EMPTY");
    }

    const finalPhone = hasOwn(updates, "phone") ? updates.phone : existing.phone;
    const finalEmail = hasOwn(updates, "email") ? updates.email : existing.email;
    if (!finalPhone && !finalEmail) {
      return fail(
        "Registra al menos teléfono o correo electrónico.",
        400,
        "POS_CUSTOMER_CONTACT_REQUIRED"
      );
    }

    const { data, error } = benefitSession ? await admin.rpc("pos_retail_customer_save_v1", { p_brand: brand.slug, p_actor: context.user.userId, p_session: benefitSession, p_customer: customerId, p_fields: updates, p_benefit: body.factoryPriceBenefit }) : await admin
      .from("pos_customers")
      .update(updates)
      .eq("brand_slug", brand.slug)
      .eq("id", customerId)
      .select("*")
      .maybeSingle();

    if (error?.code === "23505") {
      return fail(
        "Ya existe un cliente con ese teléfono o correo.",
        409,
        "POS_CUSTOMER_DUPLICATED"
      );
    }
    assertDatabaseResult(error, "No se pudo actualizar el cliente.");
    if (!data) return fail("Cliente no encontrado.", 404, "POS_CUSTOMER_NOT_FOUND");

    return ok({ customer: data });
  } catch (error) {
    return handlePosError(error);
  }
}
