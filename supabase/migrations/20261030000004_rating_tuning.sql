-- A starting deviation of 350 made a new player's first answers swing their rating by 400+ points.
-- 200 keeps early movement fast but sane (about -140 for missing a far easier problem).
alter table public.profiles alter column rating_rd set default 200;
alter table public.topic_ratings alter column rating_rd set default 200;
