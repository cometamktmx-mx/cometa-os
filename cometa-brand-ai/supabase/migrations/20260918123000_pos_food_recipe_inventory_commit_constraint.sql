-- Admit recipe consumption markers without weakening direct/none or ticket rules.
-- inventory_mode is the server-derived, frozen item snapshot introduced in V1.
begin;
alter table public.pos_food_items drop constraint pos_food_items_check2;
alter table public.pos_food_items add constraint pos_food_items_check2 check (
  inventory_committed_at is null
  or (
    ticket_id is not null
    and (track_inventory or coalesce(inventory_mode = 'recipe', false))
  )
);
commit;
