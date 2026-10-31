-- Scheduled jobs (pg_cron runs inside the database, so this is free-tier friendly).
create extension if not exists pg_cron with schema pg_catalog;

-- Leaderboards are snapshots, refreshed every 15 minutes instead of recomputed on every view.
select cron.schedule('refresh-leaderboards', '*/15 * * * *', $$select private.refresh_leaderboards()$$);

-- Pick tomorrow's daily problem a little after midnight Eastern, so the first visitor doesn't have to.
select cron.schedule('ensure-daily-problem', '10 4,5 * * *', $$select private.ensure_daily(private.app_today())$$);
