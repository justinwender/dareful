-- The scheduler (docs/decisions.md 2026-09-21). Not a Drizzle migration: it creates no table the app's schema
-- knows about. Applied through the Supabase MCP. The secret is NOT in this file; step 2 is run by hand with the
-- real value, which also lives in Vercel as TICK_SECRET.

-- 1. Extensions.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. The shared secret, in Vault (run once, by hand, with the real value):
--    select vault.create_secret('<TICK_SECRET>', 'dareful_tick_secret', 'Bearer token for /api/tick');
--    To rotate: select vault.update_secret((select id from vault.secrets where name = 'dareful_tick_secret'), '<new>');

-- 3. The job: once a minute, POST to the app with the secret read from Vault at call time. pg_net is
--    fire-and-forget, so a slow or failing tick never holds a database connection.
select cron.schedule(
  'dareful-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://dareful.app/api/tick',
    headers := jsonb_build_object('content-type', 'application/json', 'authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'dareful_tick_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- To stop it:   select cron.unschedule('dareful-tick');
-- To see runs:  select status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
-- To see replies: select status_code, created from net._http_response order by created desc limit 10;
