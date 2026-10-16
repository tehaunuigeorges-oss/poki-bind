-- =============================================================================
-- Pokibind : lancement quotidien des alertes email des chase cards
-- À coller dans « SQL Editor » puis « Run », APRÈS avoir déployé la fonction alertes-chase
-- et activé les extensions pg_cron et pg_net (Database → Extensions).
-- =============================================================================

-- 1. Secret partagé entre la base et la fonction, créé au hasard (une seule fois).
--    Pour le copier dans les secrets de la fonction (ALERTES_SECRET) :
--    select decrypted_secret from vault.decrypted_secrets where name = 'alertes_secret';
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'alertes_secret')
where not exists (select 1 from vault.secrets where name = 'alertes_secret');

-- 2. Tous les jours à 8 h 17 (heure de Paris en hiver ; pg_cron compte en UTC) : appel de la fonction.
select cron.unschedule('alertes-chase') where exists (select 1 from cron.job where jobname = 'alertes-chase');
select cron.schedule('alertes-chase', '17 7 * * *', $$
  select net.http_post(
    url := 'https://wjnqmdkfyvmndnwsxpul.supabase.co/functions/v1/alertes-chase',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-alertes-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'alertes_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);
