# Roadmap: designs for features not built yet

All four stay on the free tiers (GitHub Pages + Supabase Free) and keep the same rules as the current app: answers stay server-side, and the database is the source of truth for ratings.

---

## 1. Live 1v1 duels (Supabase Realtime)

**Experience.** Pick "Duel", get matched with someone near your rating (or send a friend a link), then race through the same 5 problems with a live opponent progress bar. The first correct answer on each problem wins its point, and a wrong answer locks you out of that problem for 20 seconds. The winner gains duel rating.

**Data.**
- `duels(id, status [waiting|active|done|abandoned], created_by, invited_user, problem_ids text[5], started_at, ends_at, winner)`
- `duel_players(duel_id, user_id, score, last_seen, primary key(duel_id, user_id))`
- `duel_events(id, duel_id, user_id, problem_id, correct, at)`, append-only
- `profiles.duel_rating`, `duel_rd`

**Flow.**
1. `create_duel()` or `join_queue()` (definer RPC). Matchmaking is a `duel_queue` table. A `pg_cron` job running every 10 seconds pairs queued users whose ratings are within ±150, widening over time, and picks 5 unseen problems near both ratings.
2. Clients subscribe to Realtime **Broadcast** on channel `duel:<id>` for ephemeral signals (typing, "opponent is on #3"). They also subscribe to **Postgres Changes** on `duel_events` filtered by `duel_id`, with RLS allowing select only to the duel's two players, for authoritative score updates.
3. `submit_duel_answer(duel_id, problem_id, choice)` checks the answer server-side, enforces the lockout and the problem-already-won rules under a row lock on `duels`, and inserts a `duel_events` row. When the duel ends, a definer function finalizes the scores and updates duel ratings with the same `private.glicko`, treating player-vs-player as one game.
4. Disconnects: Realtime **Presence** shows who is online. A cron job marks duels abandoned after 2 minutes without `last_seen` updates and awards the win.

**Free-tier fit.** The Realtime free quota is 200 concurrent connections and 2M messages a month. Send only state changes, never per-keystroke events.

**Anti-cheat.** Duel answers don't touch the practice "one rated attempt" table, but the server rejects duel problems either player attempted in the last 30 days to limit lookups.

---

## 2. Weekly leagues

**Experience.** Every Monday you're placed in a league of about 30 players near your activity level. Earn league points (XP) all week. On Sunday night the top 7 are promoted and the bottom 5 relegated through tiers Bronze → Silver → Gold → Platinum → Diamond.

**Data.**
- `leagues(id, week_start, tier)`
- `league_members(league_id, user_id, xp, final_rank)`
- `profiles.league_tier`

**XP rule** (computed in `submit_answer`): rated correct = 10 + 5·(band index), practice correct = 2, daily problem = +15. Earning XP doesn't affect rating, so grinding easy problems can't inflate ratings.

**Jobs** (`pg_cron`, Monday 00:05 ET):
1. Finalize last week: rank members, then promote or relegate by updating `profiles.league_tier`.
2. Form new leagues: take everyone active in the last 14 days, group by tier, order by last week's XP, and chunk into groups of 30.

Users who become active mid-week join the least-full league in their tier through a definer RPC. Leaderboard reads come straight from `league_members` (at most 30 rows), so no snapshot table is needed.

---

## 3. Timed mock-AMC mode

**Experience.** Pick a real past contest (e.g. 2019 AMC 10B) or a "synthetic" one (25 problems with the real difficulty curve, drawn from unseen problems). You get 75 minutes with no feedback until the end, then a scorecard: score out of 150, estimated AIME cutoff comparison, per-problem results, and time spent per problem.

**Data.**
- `mock_sessions(id, user_id, kind [real|synthetic], test_id, problem_ids text[25], started_at, deadline, submitted_at, score)`
- `mock_answers(session_id, problem_id, choice null, answered_at)`. Blank is allowed and scores 1.5.

**Flow.**
1. `start_mock(kind, test_id)` creates the session with `deadline = now() + 75 min`.
2. `save_mock_answer` upserts and is accepted only while `now() < deadline`.
3. `submit_mock()`, or a cron job sweeping expired sessions, grades everything server-side in one transaction and returns per-problem correctness. Only then does the client learn the results.

**Ratings.** Mock results feed the regular rating only for problems the user had never attempted (first-attempt rule preserved), using one batched Glicko period. The scorecard also stores AMC scoring (6 per correct, 1.5 per blank).

**Integrity.** The timer is server-side; the client only displays it. Statements are static as usual, but the answers stay hidden until grading.

---

## 4. Math-club groups

**Experience.** A coach creates a club, shares a join code, sees a roster dashboard (weekly solves, streaks, topic weaknesses), and assigns problem sets with due dates. Members see a club leaderboard and the assignments.

**Data.**
- `clubs(id, name, join_code, owner_id, created_at)`
- `club_members(club_id, user_id, role [owner|coach|member], joined_at)`
- `club_assignments(id, club_id, title, problem_ids, due_at, created_by)`
- `club_assignment_progress`: a view over `attempts` joined to assignments. Reading it goes through a definer RPC that checks the caller is a coach of that club, since `attempts` is private to its owner.

**RLS.**
- Clubs and assignments are visible to members.
- Membership changes go through RPCs: `join_club(code)`, `leave_club`, and `remove_member` (coach only).
- Coaches get aggregate data only: solved/attempted counts and topic ratings, never chosen letters.

**Privacy.** Clubs for minors: the profile has no real-name field, and coaches see usernames only. The coach dashboard uses a definer RPC, `club_report(club_id)`, that returns per-member aggregates for the last N weeks.

**Reuse.** Assignments are challenges with a due date and a fixed audience. `create_challenge` gains an optional `club_id`, and the existing challenge results grid becomes the assignment view.
