-- Run ONLY on the empty, verified Preview backend after synthetic provisioning.
-- Caller supplies app.preview_project_ref on this database connection.
begin;
do $$
begin
 if session_user not in ('postgres','supabase_admin') then raise exception 'PREVIEW_INSTALLER_REQUIRED';end if;
 if coalesce(current_setting('app.preview_project_ref',true),'') !~ '^[a-z]{20}$'
 or current_setting('app.preview_project_ref',true) in ('zhtagqrzyovsrmsicaot','ofkvisonfllafkzihdvq','fvaruzjravbwzatnjfoe')
 then raise exception 'CONFIRMED_NEW_TEST_PROJECT_REQUIRED';end if;
 if (select count(*) from public.brands)<>1 or not exists(select 1 from public.brands where slug='magenta-preview' and name='Magenta — PRUEBAS SINTETICAS')
 then raise exception 'SYNTHETIC_ONLY_BACKEND_REQUIRED';end if;
 if exists(select 1 from auth.users where email is distinct from 'magenta-preview-admin@example.test') then raise exception 'SYNTHETIC_USERS_ONLY';end if;
end $$;
create extension if not exists pg_cron;
-- Cron authenticates as the database scheduling user, then drops to service_role.
-- No HTTP endpoint, bearer token, Vercel login bypass or live credentials required.
select cron.schedule('magenta-preview-expiry','* * * * *',
 $$set role service_role; select public.store_orders_expire_m6('magenta-preview');$$);
commit;
-- Verify after >60 s: SELECT status,return_message FROM cron.job_run_details
-- WHERE jobid=(SELECT jobid FROM cron.job WHERE jobname='magenta-preview-expiry')
-- ORDER BY start_time DESC LIMIT 3;
-- Disable only this job: SELECT cron.unschedule('magenta-preview-expiry');
