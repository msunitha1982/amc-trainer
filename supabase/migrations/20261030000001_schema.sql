-- AMC Trainer: core schema.
--
-- Security model
--   * Every table in `public` has RLS enabled. Policies only ever grant SELECT; there are no
--     INSERT/UPDATE/DELETE policies, so clients cannot write tables directly.
--   * All writes go through RPCs. Public RPCs are thin SECURITY INVOKER wrappers around
--     SECURITY DEFINER implementations in the `private` schema, which PostgREST does not expose.
--   * Correct answers live in `private.answers`, which no client role can read.

create extension if not exists citext with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
-- Wrappers run as the caller, so callers need USAGE to reach the definer functions. No table in
-- `private` is granted to these roles, so this exposes nothing else.
grant usage on schema private to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Problems (metadata only; statements are static JSON on the site)
-- ---------------------------------------------------------------------------
create table public.problems (
  id text primary key,
  year int not null,
  contests text[] not null,                 -- e.g. {10,12} for shared problems
  topics text[] not null default '{}',      -- major topics: algebra, geometry, number_theory, counting
  max_number int not null,                  -- highest problem number across its tests (for "#25" badges)
  seed_rating real not null,
  rating real not null,
  rating_rd real not null default 200,
  attempts int not null default 0,
  solves int not null default 0
);
alter table public.problems enable row level security;
create policy "problems are public" on public.problems for select to anon, authenticated using (true);

create table private.answers (
  problem_id text primary key references public.problems(id) on delete cascade,
  answer char(1) not null check (answer in ('A','B','C','D','E'))
);
alter table private.answers enable row level security;  -- defence in depth; no policies, no grants

-- ---------------------------------------------------------------------------
-- Profiles and ratings
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username extensions.citext not null unique
    check (username::text ~ '^[A-Za-z0-9_]{3,20}$'),
  avatar text not null default '🦊' check (char_length(avatar) between 1 and 16),
  bio text not null default '' check (char_length(bio) <= 280),
  is_guest boolean not null default true,
  rating real not null default 1200,
  rating_rd real not null default 350,
  peak_rating real not null default 1200,
  solved_count int not null default 0,
  attempted_count int not null default 0,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_active_day date,
  daily_streak int not null default 0,
  daily_longest int not null default 0,
  last_daily_day date,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles are public" on public.profiles for select to anon, authenticated using (true);
create index profiles_rating_idx on public.profiles (rating desc) where attempted_count > 0;

create table public.topic_ratings (
  user_id uuid not null references public.profiles(id) on delete cascade,
  topic text not null check (topic in ('algebra','geometry','number_theory','counting')),
  rating real not null default 1200,
  rating_rd real not null default 350,
  attempts int not null default 0,
  solves int not null default 0,
  primary key (user_id, topic)
);
alter table public.topic_ratings enable row level security;
create policy "topic ratings are public" on public.topic_ratings for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Attempts (private to their owner: the chosen letter would leak answers)
-- ---------------------------------------------------------------------------
create table public.attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  problem_id text not null references public.problems(id) on delete cascade,
  choice char(1) not null check (choice in ('A','B','C','D','E')),
  correct boolean not null,
  rated boolean not null,
  challenge_id text,
  rating_before real,
  rating_after real,
  problem_rating_before real,
  problem_rating_after real,
  created_at timestamptz not null default now()
);
-- One rated attempt per problem per user, enforced by the database.
create unique index attempts_one_rated on public.attempts (user_id, problem_id) where rated;
create index attempts_user_time on public.attempts (user_id, created_at desc);
create index attempts_problem on public.attempts (problem_id);
create index attempts_rated_time on public.attempts (created_at) where rated;
alter table public.attempts enable row level security;
create policy "own attempts" on public.attempts for select to authenticated
  using ((select auth.uid()) = user_id);

create table public.daily_activity (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  attempts int not null default 0,
  solves int not null default 0,
  primary key (user_id, day)
);
alter table public.daily_activity enable row level security;
create policy "activity is public" on public.daily_activity for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Badges
-- ---------------------------------------------------------------------------
create table public.badges (
  id text primary key,
  name text not null,
  description text not null,
  icon text not null,
  sort int not null default 0
);
alter table public.badges enable row level security;
create policy "badges are public" on public.badges for select to anon, authenticated using (true);

create table public.user_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id text not null references public.badges(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);
create index user_badges_badge on public.user_badges (badge_id);
alter table public.user_badges enable row level security;
create policy "user badges are public" on public.user_badges for select to anon, authenticated using (true);

insert into public.badges (id, name, description, icon, sort) values
  ('first_solve',   'First Blood',      'Solve your first problem',                         '🩸', 10),
  ('solved_10',     'Getting Warm',     'Solve 10 problems',                                '🔥', 20),
  ('solved_100',    'Centurion',        'Solve 100 problems',                               '💯', 30),
  ('solved_500',    'Problem Machine',  'Solve 500 problems',                               '⚙️', 40),
  ('streak_7',      'Week Warrior',     'Practice 7 days in a row',                         '📅', 50),
  ('streak_30',     'Monthly Grind',    'Practice 30 days in a row',                        '🗓️', 60),
  ('streak_100',    'Unstoppable',      'Practice 100 days in a row',                       '🚀', 70),
  ('daily_7',       'Daily Devotee',    'Solve the daily problem 7 days in a row',          '☀️', 80),
  ('problem_25',    'The Last Word',    'Solve a #25',                                      '🏁', 90),
  ('boss_slayer',   'Boss Slayer',      'Solve a Boss-band problem',                        '🐉', 100),
  ('all_topics',    'Well Rounded',     'Solve a problem in every major topic',             '🧭', 110),
  ('rating_1500',   'Rising Star',      'Reach a 1500 rating',                              '⭐', 120),
  ('rating_1800',   'Contender',        'Reach an 1800 rating',                             '🌟', 130),
  ('rating_2100',   'AIME Bound',       'Reach a 2100 rating',                              '🏆', 140),
  ('challenge_win', 'Clean Sweep',      'Answer every problem right in a 5+ problem challenge', '🧹', 150);

-- ---------------------------------------------------------------------------
-- Daily problem, bookmarks, follows, challenges
-- ---------------------------------------------------------------------------
create table public.daily_problems (
  day date primary key,
  problem_id text not null references public.problems(id) on delete cascade
);
create index daily_problems_problem on public.daily_problems (problem_id);
alter table public.daily_problems enable row level security;
create policy "daily problems are public" on public.daily_problems for select to anon, authenticated using (true);

create table public.bookmarks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  problem_id text not null references public.problems(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, problem_id)
);
create index bookmarks_problem on public.bookmarks (problem_id);
alter table public.bookmarks enable row level security;
create policy "own bookmarks" on public.bookmarks for select to authenticated
  using ((select auth.uid()) = user_id);

create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee on public.follows (followee_id);
alter table public.follows enable row level security;
create policy "follows are public" on public.follows for select to anon, authenticated using (true);

create table public.challenges (
  id text primary key,                                -- short shareable code
  creator_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  problem_ids text[] not null check (cardinality(problem_ids) between 1 and 25),
  filters jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index challenges_creator on public.challenges (creator_id, created_at desc);
alter table public.challenges enable row level security;
create policy "challenges are public" on public.challenges for select to anon, authenticated using (true);

create table public.challenge_entries (
  challenge_id text not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  problem_id text not null references public.problems(id) on delete cascade,
  correct boolean not null,
  created_at timestamptz not null default now(),
  primary key (challenge_id, user_id, problem_id)
);
create index challenge_entries_user on public.challenge_entries (user_id);
create index challenge_entries_problem on public.challenge_entries (problem_id);
alter table public.challenge_entries enable row level security;
create policy "challenge results are public" on public.challenge_entries for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Leaderboard snapshots (refreshed by pg_cron, never computed per view)
-- ---------------------------------------------------------------------------
create table public.leaderboard_global (
  rank int primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  username text not null,
  avatar text not null,
  rating real not null,
  solved int not null,
  refreshed_at timestamptz not null
);
create index leaderboard_global_user on public.leaderboard_global (user_id);
alter table public.leaderboard_global enable row level security;
create policy "leaderboard is public" on public.leaderboard_global for select to anon, authenticated using (true);

create table public.leaderboard_weekly (
  rank int primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  username text not null,
  avatar text not null,
  week_start date not null,
  gain real not null,
  solves int not null,
  refreshed_at timestamptz not null
);
create index leaderboard_weekly_user on public.leaderboard_weekly (user_id);
alter table public.leaderboard_weekly enable row level security;
create policy "weekly leaderboard is public" on public.leaderboard_weekly for select to anon, authenticated using (true);

-- Clients never write tables directly.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
