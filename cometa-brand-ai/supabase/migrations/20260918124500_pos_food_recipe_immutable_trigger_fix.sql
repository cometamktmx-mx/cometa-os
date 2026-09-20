-- Preserve the immutable policy; discriminate rowtypes before field access.
begin;
create or replace function public.pos_food_recipe_immutable_v1() returns trigger
language plpgsql set search_path=public as $$
begin
 if tg_table_name='pos_food_recipe_components' then
   if tg_op<>'INSERT' then raise exception 'POS_FOOD_RECIPE_FROZEN'; end if;
   if exists(select 1 from public.pos_food_recipe_versions where id=new.recipe_version_id and published_at is not null) then raise exception 'POS_FOOD_RECIPE_FROZEN'; end if;
   return new;
 end if;
 if tg_table_name='pos_food_recipe_versions' then
   if tg_op='UPDATE' then
     if old.published_at is null and new.published_at is not null
     and (to_jsonb(old)-'published_at')=(to_jsonb(new)-'published_at') then return new; end if;
   end if;
 end if;
 raise exception 'POS_FOOD_RECIPE_FROZEN';
end $$;
commit;
