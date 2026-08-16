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
    const { admin, brand } = await requirePosOperationalAccess({ brandSlug, entitlement: "pos.customers" });
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

    return ok({
      brand,
      customers: data || [],
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
    const { admin, brand, user } =
      await requirePosOperationalAccess({ brandSlug, entitlement: "pos.customers" });

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

    const { data, error } = await admin
      .from("pos_customers")
      .insert({
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
      })
      .select("*")
      .single();

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
    const { admin, brand } = await requirePosOperationalAccess({
      brandSlug,
      entitlement: "pos.customers",
    });

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

    if (Object.keys(updates).length === 0) {
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

    const { data, error } = await admin
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
