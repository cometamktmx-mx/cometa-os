begin;

create table public.cometa_activity_events (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on update cascade on delete restrict,
  brand_slug text not null,
  source text not null,
  event_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  actor_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  visibility text not null,
  title text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  schema_version smallint not null default 1,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint cometa_activity_events_source_ck
    check (source in ('mercury')),
  constraint cometa_activity_events_type_ck
    check (event_type in (
      'content.created',
      'content.updated',
      'content.asset_uploaded',
      'content.sent_for_review',
      'content.resent_for_review',
      'content.changes_requested',
      'content.approved',
      'content.scheduled',
      'content.published',
      'content.analyzed'
    )),
  constraint cometa_activity_events_entity_type_ck
    check (entity_type in ('content_item', 'content_review', 'content_asset')),
  constraint cometa_activity_events_actor_type_ck
    check (actor_type in ('admin', 'client', 'system')),
  constraint cometa_activity_events_visibility_ck
    check (visibility in ('internal', 'client')),
  constraint cometa_activity_events_metadata_object_ck
    check (jsonb_typeof(metadata) = 'object'),
  constraint cometa_activity_events_dedupe_key_ck
    check (btrim(dedupe_key) <> ''),
  constraint cometa_activity_events_schema_version_ck
    check (schema_version >= 1)
);

create unique index cometa_activity_events_dedupe_uidx
  on public.cometa_activity_events (dedupe_key);

create index cometa_activity_events_brand_feed_idx
  on public.cometa_activity_events
  (brand_id, visibility, occurred_at desc, id desc);

alter table public.cometa_activity_events enable row level security;

revoke all on table public.cometa_activity_events from public, anon, authenticated;
grant select, insert on table public.cometa_activity_events to service_role;

comment on table public.cometa_activity_events is
  'Append-only canonical activity ledger. V1 producers are limited to verified Mercury content operations.';
comment on column public.cometa_activity_events.brand_slug is
  'Human-readable canonical slug snapshot. brand_id remains the tenant authority.';
comment on column public.cometa_activity_events.metadata is
  'Event-specific allowlisted context only. Never stores private notes, raw AI payloads, signed URLs, tokens, storage paths, or review snapshots.';

commit;
