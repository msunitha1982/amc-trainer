# AMC Trainer

A free, gamified practice site for **AMC 10** and **AMC 12** problems: Glicko ratings for you and every problem, per-topic ratings, streaks, a daily problem, badges, leaderboards, shareable challenges and friends.

**Live:** https://msunitha1982.github.io/amc-trainer/

It runs entirely on free tiers: a static React app on GitHub Pages, and Supabase (Postgres, Auth, pg_cron) for accounts, answer checking and ratings.

> Problems are from the MAA's AMC 10 and AMC 12 contests, via the [AoPS Wiki](https://artofproblemsolving.com/wiki/) under [CC BY-SA](https://creativecommons.org/licenses/by-sa/4.0/). Every problem links to its wiki page. This project is not affiliated with, endorsed by, or sponsored by the MAA or Art of Problem Solving. The topic tags and difficulty data this repo adds are shared under CC BY-SA too.

## Features

- **Solve loop.** Pick a choice, submit, get instant feedback. On a correct answer you get a link to the wiki solutions and a "Next problem" button. Every problem has skip, bookmark, and "report wrong tag/answer" (which opens a prefilled GitHub issue). Keyboard: A–E or 1–5, Enter, N.
- **Instant filters** (collapsible, below the problem): contest (10/12/both), years, topics and subtopics, difficulty band, problem number, status (unsolved/solved/missed/bookmarked), and order (random, in order, or matched to your rating). The problem on screen is remembered, so reloading or leaving and coming back doesn't reroll it; only Skip, Next, or a filter change that excludes it moves on.
- **Ratings.** One rated attempt per problem; wrong answers cost rating. All rating math runs in the database.
- **Profile.** Activity heatmap, current and longest streaks, rating graph, per-topic ratings with a "practice my weakest topic" shortcut, stats and badges.
- **Daily problem.** Picked deterministically by date, the same for everyone, with its own streak.
- **Leaderboards.** All-time and weekly, refreshed every 15 minutes by `pg_cron`.
- **Async challenges.** Turn your current filters into an N-problem set, share the link, and compare results side by side. Includes follows/friends.
- **Accounts.** Guest play with no sign-up (anonymous auth), upgradable to email + password without losing progress. The full email flows are supported: sign-up confirmation, resending it, password reset, and changing email or password.

## Run locally

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # parser, rating-math and filter unit tests
npm run lint && npx tsc -b && npm run build
```

The app talks to the hosted Supabase project in `src/config.ts`. To point at another project, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (see *Database* below).

## Rename the app

Change `APP_NAME` (and `APP_TAGLINE`) in [`src/config.ts`](src/config.ts) and the `<title>` in `index.html`. If you rename or move the GitHub repo, also update `REPO_SLUG` in that file. The build uses a relative base path and hash routing, so it works at any GitHub Pages URL with no other changes.

## Data pipeline

Build-time scripts in `scripts/` (run with `tsx`). Their output is committed as static JSON.

| step | command | output |
|---|---|---|
| 1. Fetch | `npx tsx scripts/fetch.ts [--from 2000 --to 2025] [--refresh]` | `data/cache/` (gitignored) |
| 2. Parse | `npx tsx scripts/parse.ts` | `data/parsed.json` and `data/classify/` (gitignored; contain answers and solutions) |
| 3. Diagrams | `npx tsx scripts/diagrams.ts` | `public/diagrams/`, `data/diagrams.json` |
| 4. Topics | classification by Claude in batches (see below) | `data/topics.json` |
| 5. Build | `npx tsx scripts/build-data.ts` | `public/data/index.json`, `public/data/statements/<year>.json`, `supabase/seed/problems.sql`, `supabase/seed/answers.sql` (**gitignored**), `docs/DATA_REPORT.md` |

`npm run pipeline` runs fetch, parse and build.

- **Source.** The AoPS Wiki API sits behind a Cloudflare bot challenge, and this project does not try to bypass it. The fetcher probes the API once per run and otherwise reads the Internet Archive's Wayback Machine copies of the same pages. It sends a custom User-Agent, throttles requests, caches everything and backs off on errors. All scraped text is treated as data: only text, LaTeX source and image URLs are extracted, and they are rendered through React text nodes and KaTeX with `trust: false`.
- **Topics.** `data/topics.json` maps each problem id to 1–3 tags from the taxonomy in `src/lib/taxonomy.ts`. It was produced by Claude reading each problem and its wiki solutions in batches, then spot-checked by topic. New problems from a re-run show up untagged in `DATA_REPORT.md` until they're added.
- **Answers.** Answers come only from each contest's answer-key page, cross-checked against the answers boxed in the wiki solutions. Records with a missing or uncertain answer are not shipped. Answers are written to `supabase/seed/answers.sql`, which is gitignored and never part of the site.
- **Re-run in CI.** The **Re-run data pipeline** workflow (Actions tab → Run workflow) executes all steps and opens a PR from a `data-refresh-N` branch. If you add a `SUPABASE_DB_URL` repository secret, it also upserts problems and answers into the database. Use the **Session pooler** connection string from Supabase → Connect, not the direct one: free-tier direct hosts are IPv6-only, and GitHub's runners can't reach them.

## Database (Supabase)

Everything is in `supabase/migrations/` (apply in order with the Supabase CLI, `psql`, or the SQL editor). Then load the data:

```bash
psql "$SUPABASE_DB_URL" -f supabase/seed/problems.sql
psql "$SUPABASE_DB_URL" -f supabase/seed/answers.sql   # generated locally by the pipeline; never commit
```

**Security model**

- Row Level Security is on for every table. Policies grant only `SELECT`, and clients have no `INSERT`/`UPDATE`/`DELETE` privileges on any table.
- Every write goes through an RPC. The exposed functions in `public` are thin `SECURITY INVOKER` wrappers around `SECURITY DEFINER` implementations in a `private` schema that PostgREST doesn't expose.
- **Answers** live in `private.answers`, readable only by `private.submit_answer()`. They never appear in the static JSON or the JS bundle; CI fails the deploy if an answer-like field shows up in `dist/data`.
- **One rated attempt per problem** is enforced by a partial unique index, `attempts(user_id, problem_id) where rated`. Later tries are unrated practice. Each user can submit at most 20 answers a minute.
- `attempts` rows (which hold the chosen letter) are visible only to their owner. Public profile stats come from aggregate RPCs.

**Ratings.** Glicko-1, computed in SQL (`private.glicko`). Users start at 1200 ± 200. Problems are seeded from test and number (AMC 10 #n: 700 + 55(n−1); AMC 12 #n: 800 + 60(n−1)) at ±150 and adapt as people answer. Each answer also updates the user's rating for each major topic of the problem. `src/lib/rating.ts` mirrors the formula, and golden-vector tests pin it to the SQL.

**Scheduled jobs.** `pg_cron` refreshes the leaderboard snapshots every 15 minutes and pre-picks the daily problem. A GitHub Action (`keepalive.yml`) pings the `ping` RPC daily so the free project never auto-pauses.

### Auth settings (dashboard)

Authentication → Sign In / Providers:

- **Allow anonymous sign-ins:** on (guest play).
- **Email provider:** on. **Confirm email** can be on or off; if it's on, set up custom SMTP (below), because the built-in sender is slow.

Authentication → URL Configuration:

- **Site URL:** `https://msunitha1982.github.io/amc-trainer/`
- **Redirect URLs:** `https://msunitha1982.github.io/amc-trainer/**` and `http://localhost:5173/**`

Email links (confirmations, password resets, email changes) return to the URL the app asks for. Supabase only honors URLs in the Redirect URLs list and otherwise falls back to the Site URL, whose default is `http://localhost:3000`. The app reads the session from the link's `#access_token=…` fragment, then routes to the Account page with a message.

**Why the built-in email is slow:** Supabase's default sender is a shared, best-effort service for development. It is capped at a few emails per hour, can take many minutes to deliver, often lands in spam, and (on new projects) only delivers to members of your Supabase organization. Signing up again with an address that already exists sends nothing (Supabase logs it as `user_repeated_signup`); the app tells you to sign in or reset the password instead.

### Custom SMTP (fast, reliable email)

1. Get SMTP credentials. Two free options:
   - **Gmail:** turn on 2-step verification, then create an app password at myaccount.google.com/apppasswords. Use host `smtp.gmail.com`, port `465`, your Gmail address as the username, and the app password. This is good for testing (about 500 emails a day).
   - **Resend / Postmark / SendGrid / Amazon SES:** verify a sending domain and use the provider's SMTP host, port, user and password.
2. Supabase → Authentication → **Emails** → SMTP Settings → enable custom SMTP and enter those details plus a sender name and address.
3. Raise the email rate limit under Authentication → **Rate Limits**.
4. Turn **Confirm email** back on and add the site URL to **Redirect URLs**.

### Adding GitHub / Google login later

1. **GitHub:** create an OAuth App at github.com → Settings → Developer settings → OAuth Apps. Set the callback URL to `https://<project-ref>.supabase.co/auth/v1/callback`, then paste the client id and secret into Supabase → Authentication → Sign In / Providers → GitHub.
2. **Google:** create an OAuth client (Web) in Google Cloud Console → APIs & Services → Credentials, using the same callback URL, and paste it into the Google provider in Supabase.
3. Add `https://msunitha1982.github.io/amc-trainer/` to Authentication → URL Configuration → Redirect URLs.
4. In the app, call `supabase.auth.linkIdentity({ provider: 'github' })` for guests, so they keep their progress, or `signInWithOAuth` for returning users. Because the app uses hash routing, set `detectSessionInUrl: true` in `src/lib/supabase.ts` and use `redirectTo: location.origin + location.pathname`. Supabase returns the session in the URL fragment, so handle it before the router reads the hash.

## Project layout

```
src/            React app (pages/, components/, lib/)
scripts/        data pipeline (fetch, parse, diagrams, build-data)
supabase/       migrations/ and seed/
tests/          Vitest unit tests
docs/           PLAN, DATA_REPORT, ROADMAP
.github/        CI + Pages deploy, keep-alive ping, pipeline re-run
```

## License

Code: MIT. Problem content: CC BY-SA, from the AoPS Wiki; the problems originate from the MAA's AMC contests.
