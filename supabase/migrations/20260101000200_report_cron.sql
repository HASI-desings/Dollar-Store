-- Scheduled report emails. Before running: store a secret named cron_secret with
--   select vault.create_secret('<same value as the CRON_SECRET function secret>', 'cron_secret');
-- Deploy the function with: supabase functions deploy report --no-verify-jwt
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('report-weekly', '0 4 * * 1', $$select net.http_post(url := 'https://ybtmbxqjazhkboctvojp.supabase.co/functions/v1/report', headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')), body := '{"period":"weekly"}'::jsonb)$$);
select cron.schedule('report-monthly', '0 4 1 * *', $$select net.http_post(url := 'https://ybtmbxqjazhkboctvojp.supabase.co/functions/v1/report', headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')), body := '{"period":"monthly"}'::jsonb)$$);
select cron.schedule('report-yearly', '0 4 1 1 *', $$select net.http_post(url := 'https://ybtmbxqjazhkboctvojp.supabase.co/functions/v1/report', headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')), body := '{"period":"yearly"}'::jsonb)$$);
