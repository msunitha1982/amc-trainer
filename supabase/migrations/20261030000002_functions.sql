-- AMC Trainer: rating math, game logic and RPCs.
--
-- Pattern: private.<name> holds the implementation (SECURITY DEFINER where it must touch rows
-- the caller cannot), and public.<name> is a SECURITY INVOKER wrapper that PostgREST exposes.

alter default privileges in schema private revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- Constants and pure helpers
-- ---------------------------------------------------------------------------

-- The app's "day" is US Eastern time, so the daily problem and streaks roll over at midnight ET.
create or replace function private.app_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/New_York')::date
$$;

-- Glicko-1 update for a single game. Mirrored in src/lib/rating.ts and checked by golden-vector tests.
--   p_r, p_rd         : player rating and rating deviation
--   p_opp_r, p_opp_rd : opponent rating and deviation
--   p_score           : 1 = win, 0 = loss
--   p_min_rd          : floor on the new deviation so ratings keep adapting
create or replace function private.glicko(p_r float8, p_rd float8, p_opp_r float8, p_opp_rd float8, p_score float8, p_min_rd float8)
returns table (rating float8, rd float8)
language sql immutable set search_path = '' as $$
  with k as (
    select ln(10.0) / 400.0 as q
  ), g as (
    select q, 1.0 / sqrt(1.0 + 3.0 * q * q * p_opp_rd * p_opp_rd / (pi() * pi())) as g from k
  ), e as (
    select q, g, 1.0 / (1.0 + power(10.0, -g * (p_r - p_opp_r) / 400.0)) as e from g
  ), d as (
    select q, g, e, 1.0 / (q * q * g * g * e * (1.0 - e)) as d2 from e
  ), u as (
    select q, g, e, 1.0 / (p_rd * p_rd) + 1.0 / d2 as denom from d
  )
  select p_r + (q / denom) * g * (p_score - e), greatest(sqrt(1.0 / denom), p_min_rd) from u
$$;

create or replace function private.band(rating float8) returns text
language sql immutable set search_path = '' as $$
  select case when rating < 1100 then 'warmup' when rating < 1500 then 'medium' when rating < 1900 then 'hard' else 'boss' end
$$;

-- ---------------------------------------------------------------------------
-- New users: every auth user (anonymous or not) gets a profile.
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
begin
  loop
    v_name := 'solver_' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
    exit when not exists (select 1 from public.profiles where username = v_name::extensions.citext);
  end loop;
  insert into public.profiles (id, username, is_guest) values (new.id, v_name, coalesce(new.is_anonymous, false));
  return new;
end $$;

create or replace function private.handle_user_updated() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set is_guest = coalesce(new.is_anonymous, false) where id = new.id;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();
create trigger on_auth_user_anon_changed after update of is_anonymous on auth.users
  for each row when (old.is_anonymous is distinct from new.is_anonymous)
  execute function private.handle_user_updated();

-- ---------------------------------------------------------------------------
-- Daily problem: deterministic by date, same for everyone, stored once chosen.
-- ---------------------------------------------------------------------------
create or replace function private.ensure_daily(p_day date) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_id text;
  v_n int;
  v_seed bigint;
begin
  select problem_id into v_id from public.daily_problems where day = p_day;
  if v_id is not null then return v_id; end if;
  -- Deterministic pick among mid-difficulty problems, avoiding ones used in the last year.
  select count(*) into v_n from public.problems p
   where p.seed_rating between 900 and 1850
     and not exists (select 1 from public.daily_problems d where d.problem_id = p.id and d.day > p_day - 365);
  if v_n = 0 then return null; end if;
  v_seed := ('x' || substr(md5('amc-trainer-daily:' || p_day::text), 1, 8))::bit(32)::bigint;
  select p.id into v_id from public.problems p
   where p.seed_rating between 900 and 1850
     and not exists (select 1 from public.daily_problems d where d.problem_id = p.id and d.day > p_day - 365)
   order by p.id offset (v_seed % v_n) limit 1;
  insert into public.daily_problems (day, problem_id) values (p_day, v_id) on conflict (day) do nothing;
  select problem_id into v_id from public.daily_problems where day = p_day;
  return v_id;
end $$;

create or replace function private.get_daily_problem() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_day date := private.app_today();
begin
  return jsonb_build_object('day', v_day, 'problem_id', private.ensure_daily(v_day));
end $$;

-- ---------------------------------------------------------------------------
-- Badges
-- ---------------------------------------------------------------------------
create or replace function private.award(p_user uuid, p_badge text) returns text
language sql security definer set search_path = '' as $$
  insert into public.user_badges (user_id, badge_id) values (p_user, p_badge)
  on conflict do nothing returning badge_id
$$;

-- ---------------------------------------------------------------------------
-- Answer submission: the only way to check an answer.
-- ---------------------------------------------------------------------------
create or replace function private.submit_answer(p_problem_id text, p_choice text, p_challenge_id text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_choice text := upper(btrim(coalesce(p_choice, '')));
  v_today date := private.app_today();
  v_prof public.profiles%rowtype;
  v_prob public.problems%rowtype;
  v_answer text;
  v_correct boolean;
  v_rated boolean;
  v_score float8;
  v_u record;
  v_p record;
  v_t record;
  v_topic text;
  v_topic_row public.topic_ratings%rowtype;
  v_badges text[] := '{}';
  v_b text;
  v_daily_id text;
  v_daily_credit boolean := false;
  v_challenge_first boolean := false;
  v_streak int;
  v_longest int;
  v_dstreak int;
  v_dlongest int;
  v_last_daily date;
  v_new_rating float8;
  v_new_rd float8;
  v_prob_new float8;
  v_solved int;
begin
  if v_uid is null then
    raise exception 'Sign in to submit answers' using errcode = '28000';
  end if;
  if v_choice not in ('A','B','C','D','E') then
    raise exception 'Choice must be A-E' using errcode = '22023';
  end if;
  if (select count(*) from public.attempts a where a.user_id = v_uid and a.created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Too many submissions. Take a breath and try again in a minute.' using errcode = 'P0001';
  end if;

  select * into v_prof from public.profiles where id = v_uid for update;
  if not found then raise exception 'Profile not found' using errcode = 'P0002'; end if;
  select * into v_prob from public.problems where id = p_problem_id for update;
  if not found then raise exception 'Unknown problem' using errcode = 'P0002'; end if;
  select answer into v_answer from private.answers where problem_id = p_problem_id;
  if v_answer is null then raise exception 'This problem has no answer on file' using errcode = 'P0002'; end if;

  v_correct := v_choice = v_answer;
  v_score := case when v_correct then 1 else 0 end;
  v_rated := not exists (select 1 from public.attempts a where a.user_id = v_uid and a.problem_id = p_problem_id and a.rated);

  if p_challenge_id is not null then
    if not exists (select 1 from public.challenges c where c.id = p_challenge_id and p_problem_id = any (c.problem_ids)) then
      raise exception 'That problem is not part of this challenge' using errcode = '22023';
    end if;
    insert into public.challenge_entries (challenge_id, user_id, problem_id, correct)
    values (p_challenge_id, v_uid, p_problem_id, v_correct)
    on conflict do nothing
    returning true into v_challenge_first;
    v_challenge_first := coalesce(v_challenge_first, false);
  end if;

  v_new_rating := v_prof.rating;
  v_new_rd := v_prof.rating_rd;
  v_prob_new := v_prob.rating;
  v_solved := v_prof.solved_count;

  if v_rated then
    select * into v_u from private.glicko(v_prof.rating, v_prof.rating_rd, v_prob.rating, v_prob.rating_rd, v_score, 60);
    select * into v_p from private.glicko(v_prob.rating, v_prob.rating_rd, v_prof.rating, v_prof.rating_rd, 1 - v_score, 50);
    v_new_rating := v_u.rating;
    v_new_rd := v_u.rd;
    v_prob_new := v_p.rating;
    v_solved := v_solved + v_score::int;

    update public.problems
       set rating = v_p.rating, rating_rd = v_p.rd, attempts = attempts + 1, solves = solves + v_score::int
     where id = p_problem_id;

    foreach v_topic in array v_prob.topics loop
      insert into public.topic_ratings (user_id, topic) values (v_uid, v_topic) on conflict do nothing;
      select * into v_topic_row from public.topic_ratings where user_id = v_uid and topic = v_topic for update;
      select * into v_t from private.glicko(v_topic_row.rating, v_topic_row.rating_rd, v_prob.rating, v_prob.rating_rd, v_score, 60);
      update public.topic_ratings
         set rating = v_t.rating, rating_rd = v_t.rd, attempts = attempts + 1, solves = solves + v_score::int
       where user_id = v_uid and topic = v_topic;
    end loop;
  end if;

  insert into public.attempts (user_id, problem_id, choice, correct, rated, challenge_id,
                               rating_before, rating_after, problem_rating_before, problem_rating_after)
  values (v_uid, p_problem_id, v_choice, v_correct, v_rated, p_challenge_id,
          case when v_rated then v_prof.rating end, case when v_rated then v_new_rating end,
          case when v_rated then v_prob.rating end, case when v_rated then v_prob_new end);

  insert into public.daily_activity (user_id, day, attempts, solves)
  values (v_uid, v_today, 1, case when v_rated and v_correct then 1 else 0 end)
  on conflict (user_id, day) do update
    set attempts = public.daily_activity.attempts + 1,
        solves = public.daily_activity.solves + excluded.solves;

  -- Activity streak: any submission counts for the day.
  v_streak := case
    when v_prof.last_active_day = v_today then v_prof.current_streak
    when v_prof.last_active_day = v_today - 1 then v_prof.current_streak + 1
    else 1 end;
  v_longest := greatest(v_prof.longest_streak, v_streak);

  -- Daily-problem streak: a correct answer to today's daily problem (rated or practice).
  v_dstreak := v_prof.daily_streak;
  v_dlongest := v_prof.daily_longest;
  v_last_daily := v_prof.last_daily_day;
  if v_correct and v_prof.last_daily_day is distinct from v_today then
    v_daily_id := private.ensure_daily(v_today);
    if v_daily_id = p_problem_id then
      v_daily_credit := true;
      v_dstreak := case when v_prof.last_daily_day = v_today - 1 then v_prof.daily_streak + 1 else 1 end;
      v_dlongest := greatest(v_dlongest, v_dstreak);
      v_last_daily := v_today;
    end if;
  end if;

  update public.profiles
     set rating = v_new_rating,
         rating_rd = v_new_rd,
         peak_rating = greatest(peak_rating, v_new_rating),
         solved_count = v_solved,
         attempted_count = attempted_count + case when v_rated then 1 else 0 end,
         current_streak = v_streak,
         longest_streak = v_longest,
         last_active_day = v_today,
         daily_streak = v_dstreak,
         daily_longest = v_dlongest,
         last_daily_day = v_last_daily
   where id = v_uid;

  -- Badges
  if v_rated and v_correct then
    if v_solved >= 1 then v_b := private.award(v_uid, 'first_solve'); if v_b is not null then v_badges := v_badges || v_b; end if; end if;
    if v_solved >= 10 then v_b := private.award(v_uid, 'solved_10'); if v_b is not null then v_badges := v_badges || v_b; end if; end if;
    if v_solved >= 100 then v_b := private.award(v_uid, 'solved_100'); if v_b is not null then v_badges := v_badges || v_b; end if; end if;
    if v_solved >= 500 then v_b := private.award(v_uid, 'solved_500'); if v_b is not null then v_badges := v_badges || v_b; end if; end if;
    if v_prob.max_number = 25 then v_b := private.award(v_uid, 'problem_25'); if v_b is not null then v_badges := v_badges || v_b; end if; end if;
    if v_prob.rating >= 1900 then v_b := private.award(v_uid, 'boss_slayer'); if v_b is not null then v_badges := v_badges || v_b; end if; end if;
    if (select count(distinct t.topic) from public.topic_ratings t where t.user_id = v_uid and t.solves > 0) >= 4 then
      v_b := private.award(v_uid, 'all_topics'); if v_b is not null then v_badges := v_badges || v_b; end if;
    end if;
  end if;
  if v_streak >= 7 then v_b := private.award(v_uid, 'streak_7'); if v_b is not null then v_badges := v_badges || v_b; end if; end if;
  if v_streak >= 30 then v_b := private.award(v_uid, 'streak_30'); if v_b is not null then v_badges := v_badges || v_b; end if; end if;
  if v_streak >= 100 then v_b := private.award(v_uid, 'streak_100'); if v_b is not null then v_badges := v_badges || v_b; end if; end if;
  if v_dstreak >= 7 then v_b := private.award(v_uid, 'daily_7'); if v_b is not null then v_badges := v_badges || v_b; end if; end if;
  if v_new_rating >= 1500 then v_b := private.award(v_uid, 'rating_1500'); if v_b is not null then v_badges := v_badges || v_b; end if; end if;
  if v_new_rating >= 1800 then v_b := private.award(v_uid, 'rating_1800'); if v_b is not null then v_badges := v_badges || v_b; end if; end if;
  if v_new_rating >= 2100 then v_b := private.award(v_uid, 'rating_2100'); if v_b is not null then v_badges := v_badges || v_b; end if; end if;
  if v_challenge_first and v_correct then
    if (select cardinality(c.problem_ids) >= 5
               and count(*) filter (where e.correct) = cardinality(c.problem_ids)
          from public.challenges c join public.challenge_entries e on e.challenge_id = c.id and e.user_id = v_uid
         where c.id = p_challenge_id group by c.problem_ids) then
      v_b := private.award(v_uid, 'challenge_win'); if v_b is not null then v_badges := v_badges || v_b; end if;
    end if;
  end if;

  return jsonb_build_object(
    'correct', v_correct,
    'rated', v_rated,
    'rating', round(v_new_rating::numeric, 1),
    'rating_delta', round((v_new_rating - v_prof.rating)::numeric, 1),
    'problem_rating', round(v_prob_new::numeric, 1),
    'streak', v_streak,
    'daily_credit', v_daily_credit,
    'daily_streak', v_dstreak,
    'new_badges', to_jsonb(v_badges)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Profile, bookmarks, follows, challenges, account
-- ---------------------------------------------------------------------------
create or replace function private.update_profile(p_username text, p_avatar text, p_bio text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  if p_username !~ '^[A-Za-z0-9_]{3,20}$' then
    raise exception 'Usernames are 3-20 letters, digits or underscores' using errcode = '22023';
  end if;
  update public.profiles
     set username = p_username, avatar = coalesce(nullif(btrim(p_avatar), ''), avatar), bio = coalesce(p_bio, '')
   where id = auth.uid();
exception when unique_violation then
  raise exception 'That username is taken' using errcode = '23505';
end $$;

create or replace function private.toggle_bookmark(p_problem_id text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  delete from public.bookmarks where user_id = auth.uid() and problem_id = p_problem_id;
  if found then return false; end if;
  if (select count(*) from public.bookmarks where user_id = auth.uid()) >= 2000 then
    raise exception 'Bookmark limit reached' using errcode = 'P0001';
  end if;
  insert into public.bookmarks (user_id, problem_id) values (auth.uid(), p_problem_id);
  return true;
end $$;

create or replace function private.set_follow(p_user uuid, p_follow boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  if p_follow then
    if (select count(*) from public.follows where follower_id = auth.uid()) >= 1000 then
      raise exception 'Follow limit reached' using errcode = 'P0001';
    end if;
    insert into public.follows (follower_id, followee_id) values (auth.uid(), p_user) on conflict do nothing;
  else
    delete from public.follows where follower_id = auth.uid() and followee_id = p_user;
  end if;
end $$;

create or replace function private.create_challenge(p_title text, p_problem_ids text[], p_filters jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_id text;
  v_alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_bytes bytea;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  if coalesce(cardinality(p_problem_ids), 0) not between 1 and 25 then
    raise exception 'Challenges have 1-25 problems' using errcode = '22023';
  end if;
  if (select count(distinct x) from unnest(p_problem_ids) x) <> cardinality(p_problem_ids)
     or (select count(*) from public.problems where id = any (p_problem_ids)) <> cardinality(p_problem_ids) then
    raise exception 'Unknown or duplicate problem ids' using errcode = '22023';
  end if;
  if (select count(*) from public.challenges where creator_id = auth.uid() and created_at > now() - interval '1 day') >= 30 then
    raise exception 'Daily challenge limit reached' using errcode = 'P0001';
  end if;
  loop
    v_bytes := extensions.gen_random_bytes(8);
    select string_agg(substr(v_alphabet, 1 + (get_byte(v_bytes, i) % length(v_alphabet)), 1), '')
      into v_id from generate_series(0, 7) i;
    exit when not exists (select 1 from public.challenges where id = v_id);
  end loop;
  insert into public.challenges (id, creator_id, title, problem_ids, filters)
  values (v_id, auth.uid(), left(coalesce(nullif(btrim(p_title), ''), 'Challenge'), 80), p_problem_ids, coalesce(p_filters, '{}'));
  return v_id;
end $$;

create or replace function private.delete_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- ---------------------------------------------------------------------------
-- Read helpers that aggregate other users' private attempts into safe summaries
-- ---------------------------------------------------------------------------
create or replace function private.get_rating_history(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_array(extract(epoch from a.created_at)::bigint, round(a.rating_after::numeric, 1)) order by a.created_at), '[]'::jsonb)
    from public.attempts a
   where a.user_id = p_user and a.rated
$$;

create or replace function private.get_profile_stats(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'bands', coalesce((
      select jsonb_object_agg(band, jsonb_build_array(solved, attempted))
        from (select private.band(p.seed_rating) as band,
                     count(*) filter (where a.correct) as solved, count(*) as attempted
                from public.attempts a join public.problems p on p.id = a.problem_id
               where a.user_id = p_user and a.rated
               group by 1) b), '{}'::jsonb),
    'contests', coalesce((
      select jsonb_object_agg(c, jsonb_build_array(solved, attempted))
        from (select c, count(*) filter (where a.correct) as solved, count(*) as attempted
                from public.attempts a join public.problems p on p.id = a.problem_id, unnest(p.contests) c
               where a.user_id = p_user and a.rated
               group by c) x), '{}'::jsonb)
  )
$$;

-- ---------------------------------------------------------------------------
-- Leaderboards: snapshots refreshed by pg_cron
-- ---------------------------------------------------------------------------
create or replace function private.refresh_leaderboards() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := now();
  v_week date := date_trunc('week', private.app_today())::date;
  v_since timestamptz := (v_week::timestamp at time zone 'America/New_York');
begin
  delete from public.leaderboard_global where true;
  insert into public.leaderboard_global (rank, user_id, username, avatar, rating, solved, refreshed_at)
  select row_number() over (order by p.rating desc, p.solved_count desc, p.created_at), p.id, p.username, p.avatar,
         round(p.rating::numeric, 1), p.solved_count, v_now
    from public.profiles p
   where p.attempted_count > 0
   order by p.rating desc, p.solved_count desc, p.created_at
   limit 100;

  delete from public.leaderboard_weekly where true;
  insert into public.leaderboard_weekly (rank, user_id, username, avatar, week_start, gain, solves, refreshed_at)
  select row_number() over (order by w.gain desc, w.solves desc), w.user_id, p.username, p.avatar, v_week,
         round(w.gain::numeric, 1), w.solves, v_now
    from (select a.user_id, sum(a.rating_after - a.rating_before) as gain, count(*) filter (where a.correct) as solves
            from public.attempts a
           where a.rated and a.created_at >= v_since
           group by a.user_id) w
    join public.profiles p on p.id = w.user_id
   order by w.gain desc, w.solves desc
   limit 100;
end $$;

-- ---------------------------------------------------------------------------
-- Public API (SECURITY INVOKER wrappers exposed by PostgREST)
-- ---------------------------------------------------------------------------
create or replace function public.submit_answer(p_problem_id text, p_choice text, p_challenge_id text default null)
returns jsonb language sql volatile set search_path = '' as $$ select private.submit_answer(p_problem_id, p_choice, p_challenge_id) $$;

create or replace function public.get_daily_problem() returns jsonb
language sql volatile set search_path = '' as $$ select private.get_daily_problem() $$;

create or replace function public.update_profile(p_username text, p_avatar text, p_bio text) returns void
language sql volatile set search_path = '' as $$ select private.update_profile(p_username, p_avatar, p_bio) $$;

create or replace function public.toggle_bookmark(p_problem_id text) returns boolean
language sql volatile set search_path = '' as $$ select private.toggle_bookmark(p_problem_id) $$;

create or replace function public.set_follow(p_user uuid, p_follow boolean) returns void
language sql volatile set search_path = '' as $$ select private.set_follow(p_user, p_follow) $$;

create or replace function public.create_challenge(p_title text, p_problem_ids text[], p_filters jsonb default '{}') returns text
language sql volatile set search_path = '' as $$ select private.create_challenge(p_title, p_problem_ids, p_filters) $$;

create or replace function public.delete_account() returns void
language sql volatile set search_path = '' as $$ select private.delete_account() $$;

create or replace function public.get_rating_history(p_user uuid) returns jsonb
language sql stable set search_path = '' as $$ select private.get_rating_history(p_user) $$;

create or replace function public.get_profile_stats(p_user uuid) returns jsonb
language sql stable set search_path = '' as $$ select private.get_profile_stats(p_user) $$;

-- Own progress, read through RLS (invoker). One JSON value, so PostgREST's row cap doesn't apply.
create or replace function public.get_my_progress() returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'status', coalesce((select jsonb_object_agg(a.problem_id, case when a.correct then 'solved' else 'missed' end)
                          from public.attempts a where a.user_id = (select auth.uid()) and a.rated), '{}'::jsonb),
    'bookmarks', coalesce((select jsonb_agg(b.problem_id) from public.bookmarks b where b.user_id = (select auth.uid())), '[]'::jsonb)
  )
$$;

-- Live problem ratings for every problem, as {id: [rating, attempts, solves]}.
create or replace function public.get_problem_stats() returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_object_agg(p.id, jsonb_build_array(round(p.rating::numeric), p.attempts, p.solves)), '{}'::jsonb)
    from public.problems p
$$;

-- Keep-alive endpoint for the scheduled GitHub Action.
create or replace function public.ping() returns text
language sql stable set search_path = '' as $$ select 'ok'::text $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant execute on function
  private.submit_answer(text, text, text), private.update_profile(text, text, text), private.toggle_bookmark(text),
  private.set_follow(uuid, boolean), private.create_challenge(text, text[], jsonb), private.delete_account()
  to authenticated;
grant execute on function
  private.get_daily_problem(), private.get_rating_history(uuid), private.get_profile_stats(uuid)
  to anon, authenticated;

grant execute on function
  public.submit_answer(text, text, text), public.update_profile(text, text, text), public.toggle_bookmark(text),
  public.set_follow(uuid, boolean), public.create_challenge(text, text[], jsonb), public.delete_account(),
  public.get_my_progress()
  to authenticated;
grant execute on function
  public.get_daily_problem(), public.get_rating_history(uuid), public.get_profile_stats(uuid),
  public.get_problem_stats(), public.ping()
  to anon, authenticated;
