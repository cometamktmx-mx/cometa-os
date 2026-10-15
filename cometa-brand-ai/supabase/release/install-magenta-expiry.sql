-- Prepared only. Run after explicit production launch approval and M7 installation.
-- In this same connection set app.confirmed_project_ref and app.confirmed_brand_id.
begin;
do $$
begin
 if session_user not in ('postgres','supabase_admin') then raise exception 'INSTALLER_REQUIRED'; end if;
 if current_setting('app.confirmed_project_ref',true) is distinct from 'zhtagqrzyovsrmsicaot'
 or current_setting('app.confirmed_brand_id',true) is distinct from '70880b54-b6fe-4775-bb39-c9ff19c47c39'
 then raise exception 'CONFIRMED_PRODUCTION_TARGET_REQUIRED'; end if;
 if not exists(select 1 from public.brands where id='70880b54-b6fe-4775-bb39-c9ff19c47c39' and slug='magenta-fitwear')
 then raise exception 'BRAND_MISMATCH'; end if;
 if to_regprocedure('public.store_orders_expire_m6(text)') is null then raise exception 'MIGRATIONS_REQUIRED'; end if;
end $$;
create extension if not exists pg_cron;
-- Named schedule updates this job on retry; never removes other tenants' jobs.
-- Database scheduler authenticates locally; no public HTTP route or bearer secret.
select cron.schedule('magenta-store-expiry','* * * * *',
 $$set role service_role; select public.store_orders_expire_m6('magenta-fitwear');$$);
commit;
-- Check two successful runs through cron.job_run_details for this job only.
-- Stop only this job, if explicitly approved: select cron.unschedule('magenta-store-expiry');
