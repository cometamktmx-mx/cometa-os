alter table public.mercury_content_items
  add column if not exists calendar_slot_key text,
  add column if not exists delivery_type text;

alter table public.mercury_content_items
  drop constraint if exists mercury_content_items_delivery_type_check;

alter table public.mercury_content_items
  add constraint mercury_content_items_delivery_type_check
  check (delivery_type is null or delivery_type in ('contractual','extra','replacement'));

create unique index if not exists mercury_content_items_calendar_slot_key_unique
  on public.mercury_content_items (calendar_id, calendar_slot_key)
  where calendar_slot_key is not null;
