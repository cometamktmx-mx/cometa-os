import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireBrandAccess, requireBrandOsAccess } from "@/lib/brand-os/server";
import { requireAdminWorkspace } from "@/lib/workspace/admin-brands";

export const COMETA_ACTIVITY_SCHEMA_VERSION = 1 as const;

export const COMETA_ACTIVITY_EVENT_TYPES = [
  "content.created",
  "content.updated",
  "content.asset_uploaded",
  "content.sent_for_review",
  "content.resent_for_review",
  "content.changes_requested",
  "content.approved",
  "content.scheduled",
  "content.published",
  "content.analyzed",
] as const;

export type CometaActivityEventType =
  (typeof COMETA_ACTIVITY_EVENT_TYPES)[number];
export type CometaActivityVisibility = "internal" | "client";
export type CometaActivityActorType = "admin" | "client" | "system";
export type CometaActivityEntityType =
  | "content_item"
  | "content_review"
  | "content_asset";

export const COMETA_ACTIVITY_VISIBILITY: Readonly<
  Record<CometaActivityEventType, CometaActivityVisibility>
> = {
  "content.created": "internal",
  "content.updated": "internal",
  "content.asset_uploaded": "internal",
  "content.sent_for_review": "client",
  "content.resent_for_review": "client",
  "content.changes_requested": "client",
  "content.approved": "client",
  "content.scheduled": "client",
  "content.published": "client",
  "content.analyzed": "client",
};

type CanonicalBrand = { id: string; slug: string };
type ActivityActor = {
  type: CometaActivityActorType;
  userId: string | null;
};

type CommonEventInput = {
  brand: CanonicalBrand;
  actor: ActivityActor;
  contentItemId: string;
  contentTitle: string;
  contentType?: string | null;
  platform?: string | null;
  occurredAt: string;
};

export type RecordCometaActivityEventInput = CommonEventInput &
  (
    | {
        eventType: "content.created";
        entityType: "content_item";
        entityId: string;
      }
    | {
        eventType:
          | "content.updated"
          | "content.scheduled"
          | "content.published"
          | "content.analyzed";
        entityType: "content_item";
        entityId: string;
        persistedMutationAt: string;
        statusFrom?: string | null;
        statusTo?: string | null;
      }
    | {
        eventType: "content.asset_uploaded";
        entityType: "content_asset";
        entityId: string;
        assetType?: string | null;
      }
    | {
        eventType:
          | "content.sent_for_review"
          | "content.resent_for_review"
          | "content.changes_requested"
          | "content.approved";
        entityType: "content_review";
        entityId: string;
        reviewId: string;
        statusFrom?: string | null;
        statusTo?: string | null;
      }
  );

export type CometaActivityEvent = {
  id: string;
  eventType: CometaActivityEventType;
  entityType: CometaActivityEntityType;
  entityId: string;
  actorType: CometaActivityActorType;
  visibility: CometaActivityVisibility;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
};

export type BrandActivityPage = {
  events: CometaActivityEvent[];
  nextCursor: string | null;
};

type ActivityAudience = "admin" | "client";

const EVENT_FIELDS =
  "id,event_type,entity_type,entity_id,actor_type,visibility,title,description,metadata,occurred_at";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function activityClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("COMETA_ACTIVITY_SERVER_CONFIG_INVALID");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function requiredUuid(value: string, code: string): string {
  if (!UUID_PATTERN.test(value)) throw new Error(code);
  return value;
}

function requiredTimestamp(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) throw new Error(code);
  return value;
}

function safeContentTitle(value: string): string {
  const title = value.trim().replace(/\s+/g, " ").slice(0, 180);
  return title || "Contenido sin título";
}

function eventPresentation(
  eventType: CometaActivityEventType,
  contentTitle: string
): { title: string; description: string | null } {
  const quoted = `“${safeContentTitle(contentTitle)}”`;
  const titles: Record<CometaActivityEventType, string> = {
    "content.created": `Se creó ${quoted}.`,
    "content.updated": `Se actualizó ${quoted}.`,
    "content.asset_uploaded": `Se agregó un recurso a ${quoted}.`,
    "content.sent_for_review": `Se envió ${quoted} para tu revisión.`,
    "content.resent_for_review": `Cometa envió una nueva versión de ${quoted}.`,
    "content.changes_requested": `Solicitaste cambios en ${quoted}.`,
    "content.approved": `Aprobaste ${quoted}.`,
    "content.scheduled": `${quoted} fue programado.`,
    "content.published": `Se publicó ${quoted}.`,
    "content.analyzed": `Se completó el análisis de ${quoted}.`,
  };
  return { title: titles[eventType], description: null };
}

function compactMetadata(
  input: RecordCometaActivityEventInput
): Record<string, string> {
  const metadata: Record<string, string> = {
    content_item_id: requiredUuid(
      input.contentItemId,
      "COMETA_ACTIVITY_CONTENT_ITEM_INVALID"
    ),
  };
  if (input.contentType) metadata.content_type = String(input.contentType).slice(0, 80);
  if (input.platform) metadata.platform = String(input.platform).slice(0, 80);

  if (input.entityType === "content_asset") {
    metadata.asset_id = requiredUuid(
      input.entityId,
      "COMETA_ACTIVITY_ASSET_INVALID"
    );
    if (input.assetType) metadata.asset_type = String(input.assetType).slice(0, 80);
  }

  if (input.entityType === "content_review") {
    metadata.review_id = requiredUuid(
      input.reviewId,
      "COMETA_ACTIVITY_REVIEW_INVALID"
    );
  }

  if ("statusFrom" in input && input.statusFrom) {
    metadata.status_from = String(input.statusFrom).slice(0, 80);
  }
  if ("statusTo" in input && input.statusTo) {
    metadata.status_to = String(input.statusTo).slice(0, 80);
  }
  return metadata;
}

function dedupeKey(input: RecordCometaActivityEventInput): string {
  const prefix = `mercury:${input.brand.id}`;
  if (input.eventType === "content.created") {
    return `${prefix}:content:${input.entityId}:created`;
  }
  if (input.eventType === "content.asset_uploaded") {
    return `${prefix}:asset:${input.entityId}:uploaded`;
  }
  if (input.entityType === "content_review") {
    return `${prefix}:review:${input.reviewId}:${input.eventType.slice("content.".length)}`;
  }
  const persistedAt = requiredTimestamp(
    input.persistedMutationAt,
    "COMETA_ACTIVITY_PERSISTED_MUTATION_REQUIRED"
  );
  return `${prefix}:content:${input.entityId}:${input.eventType.slice("content.".length)}:${persistedAt}`;
}

async function validateCanonicalBrand(
  client: SupabaseClient,
  brand: CanonicalBrand
) {
  requiredUuid(brand.id, "COMETA_ACTIVITY_BRAND_ID_INVALID");
  const { data, error } = await client
    .from("brands")
    .select("id,slug")
    .eq("id", brand.id)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.slug !== brand.slug) {
    throw new Error("COMETA_ACTIVITY_CANONICAL_BRAND_MISMATCH");
  }
}

export async function recordCometaActivityEvent(
  input: RecordCometaActivityEventInput
): Promise<{ id: string; duplicate: boolean }> {
  const client = activityClient();
  await validateCanonicalBrand(client, input.brand);
  requiredUuid(input.entityId, "COMETA_ACTIVITY_ENTITY_INVALID");
  const occurredAt = requiredTimestamp(
    input.occurredAt,
    "COMETA_ACTIVITY_OCCURRED_AT_INVALID"
  );
  const actorUserId =
    input.actor.type === "system"
      ? input.actor.userId
        ? requiredUuid(input.actor.userId, "COMETA_ACTIVITY_ACTOR_INVALID")
        : null
      : requiredUuid(
          input.actor.userId || "",
          "COMETA_ACTIVITY_ACTOR_REQUIRED"
        );
  const presentation = eventPresentation(input.eventType, input.contentTitle);
  const key = dedupeKey(input);
  const payload = {
    brand_id: input.brand.id,
    brand_slug: input.brand.slug,
    source: "mercury",
    event_type: input.eventType,
    entity_type: input.entityType,
    entity_id: input.entityId,
    actor_type: input.actor.type,
    actor_user_id: actorUserId,
    visibility: COMETA_ACTIVITY_VISIBILITY[input.eventType],
    title: presentation.title,
    description: presentation.description,
    metadata: compactMetadata(input),
    dedupe_key: key,
    schema_version: COMETA_ACTIVITY_SCHEMA_VERSION,
    occurred_at: occurredAt,
  };
  const { data, error } = await client
    .from("cometa_activity_events")
    .insert(payload)
    .select("id")
    .single();
  if (!error && data) return { id: String(data.id), duplicate: false };
  if (error?.code !== "23505") throw error;

  const existing = await client
    .from("cometa_activity_events")
    .select("id")
    .eq("dedupe_key", key)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) throw error;
  return { id: String(existing.data.id), duplicate: true };
}

/**
 * Entity mutations and activity inserts are separate Supabase operations in
 * V1. Activity is therefore recorded only after a confirmed mutation and a
 * ledger outage must not make the already-completed domain action look
 * reversible to its caller. The structured log contains identifiers only.
 */
export async function recordCometaActivityEventAfterMutation(
  input: RecordCometaActivityEventInput
): Promise<void> {
  try {
    await recordCometaActivityEvent(input);
  } catch (error: unknown) {
    console.error("[COMETA_ACTIVITY_EVENT_WRITE_FAILED]", {
      brandId: input.brand.id,
      brandSlug: input.brand.slug,
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      errorCode: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    });
  }
}

function encodeCursor(occurredAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ occurredAt, id }), "utf8").toString(
    "base64url"
  );
}

function decodeCursor(cursor: string): { occurredAt: string; id: string } {
  try {
    const value = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    ) as { occurredAt?: unknown; id?: unknown };
    if (
      typeof value.occurredAt !== "string" ||
      typeof value.id !== "string" ||
      Number.isNaN(Date.parse(value.occurredAt)) ||
      !UUID_PATTERN.test(value.id)
    ) {
      throw new Error("invalid");
    }
    return { occurredAt: value.occurredAt, id: value.id };
  } catch {
    throw new Error("COMETA_ACTIVITY_CURSOR_INVALID");
  }
}

export async function getBrandActivity(input: {
  brandSlug: string;
  audience: ActivityAudience;
  limit?: number;
  cursor?: string | null;
}): Promise<BrandActivityPage> {
  const access =
    input.audience === "admin"
      ? (await requireAdminWorkspace(), await requireBrandAccess(input.brandSlug))
      : await requireBrandOsAccess(input.brandSlug);
  const limit = Math.min(Math.max(Math.trunc(input.limit || 10), 1), 50);
  let query = activityClient()
    .from("cometa_activity_events")
    .select(EVENT_FIELDS)
    .eq("brand_id", access.brand.id)
    .eq("brand_slug", access.brand.slug)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  query =
    input.audience === "client"
      ? query.eq("visibility", "client")
      : query.in("visibility", ["internal", "client"]);

  if (input.cursor) {
    const cursor = decodeCursor(input.cursor);
    query = query.or(
      `occurred_at.lt.${cursor.occurredAt},and(occurred_at.eq.${cursor.occurredAt},id.lt.${cursor.id})`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = data || [];
  const pageRows = rows.slice(0, limit);
  const events = pageRows.map((row) => ({
    id: String(row.id),
    eventType: row.event_type as CometaActivityEventType,
    entityType: row.entity_type as CometaActivityEntityType,
    entityId: String(row.entity_id),
    actorType: row.actor_type as CometaActivityActorType,
    visibility: row.visibility as CometaActivityVisibility,
    title: String(row.title),
    description: typeof row.description === "string" ? row.description : null,
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
    occurredAt: String(row.occurred_at),
  }));
  const last = pageRows.at(-1);
  return {
    events,
    nextCursor:
      rows.length > limit && last
        ? encodeCursor(String(last.occurred_at), String(last.id))
        : null,
  };
}
