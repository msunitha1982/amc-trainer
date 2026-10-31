# AMC Trainer: build plan

A gamified practice site for AMC 10/12 problems. Static frontend on GitHub Pages, Supabase (free tier) for auth, answers, ratings and social features.

## Decisions already made

- **Data source.** The AoPS Wiki MediaWiki API is behind a Cloudflare bot challenge (HTTP 403 for scripts). We don't try to bypass it. The fetch script probes the API once per run and otherwise reads the Internet Archive's Wayback Machine copies of the same wiki pages. The content is CC BY-SA. Diagrams are AoPS's own rendered images from `latex.artofproblemsolving.com`, which is not blocked.
- **Scope.** AMC 10 and AMC 12, 2000–2025, including 2021 Fall. That's 104 contests and about 2,600 problem slots. Problems shared between the 10 and the 12 become one record.
- **Anti-cheat.** Answers never appear in static JSON or the JS bundle. They live in a non-exposed `private` schema, and answers are only checked through RPCs.

## Steps

1. **Scaffold.** Vite + React + TS + Tailwind v4, hash routing, KaTeX, ESLint, Vitest. All app naming lives in `src/config.ts`.
2. **Pipeline** (`scripts/`, run with `tsx`):
   - `fetch.ts`: polite, cached fetch of answer keys, full-test pages and per-problem pages into `data/cache/` (gitignored).
   - `parse.ts`: HTML → statement segments (text / LaTeX / diagram), five choices, answer, solution text, shared-problem detection via canonical redirect plus the "from both" notice plus a statement match. Every LaTeX snippet is test-rendered with KaTeX, and AoPS's rendered image is kept as a fallback when KaTeX fails.
   - Topic classification: Claude, in parallel batches, over statement and first solutions → `data/topics.json`. Then a spot-check of about 30 problems per major topic.
   - `build-data.ts`: merge everything → `public/data/problems.json` (no answers) plus `supabase/seed/answers.sql` (answers, applied privately). Write `docs/DATA_REPORT.md`.
   - Diagrams downloaded into `public/diagrams/` if the total is small; otherwise hotlinked.
3. **Database** (`supabase/migrations/*.sql`, applied through MCP):
   - `public`: profiles, problems (metadata + live rating), topic_ratings, attempts (own rows only), daily_activity, badges / user_badges, daily_problems, challenges / challenge_entries, follows, bookmarks, leaderboard snapshots.
   - `private`: answers, rating math and the security-definer implementations. Public RPCs are thin `security invoker` wrappers.
   - Glicko-1 ratings for users, problems and per-topic user ratings, all computed in SQL. One rated attempt per problem. Rate-limited submissions.
   - `pg_cron`: leaderboards refresh every 15 minutes.
   - RLS on every table, deny by default. Clients write only through RPCs. Run the security and performance advisors and fix what they flag.
4. **Frontend.** Practice (filters + solve loop), Daily, Leaderboards, Challenges, Profile (heatmap, streaks, rating graph, topic ratings, badges), Friends, Account (anonymous → email/password), About/attribution.
5. **Quality.** Unit tests for the parser and the rating math. The rating tests are golden vectors produced by the SQL implementation. CI runs lint, typecheck, test and build, then deploys to Pages. Workflows for re-running the pipeline and for a daily keep-alive ping.
6. **Docs.** README, DATA_REPORT, ROADMAP (duels, leagues, mock AMC, clubs). Smoke-test the live site.
