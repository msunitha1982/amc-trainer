/**
 * App-wide configuration. Rename the app by changing APP_NAME (and, if you move the repo,
 * REPO_SLUG). Nothing else in the code hard-codes the name.
 */
export const APP_NAME = 'AMC Trainer'
export const APP_TAGLINE = 'Level up on real AMC 10 & 12 problems'

export const REPO_SLUG = 'msunitha1982/amc-trainer'
export const REPO_URL = `https://github.com/${REPO_SLUG}`

// Public client credentials. The publishable key is designed to ship in browsers; row level
// security and SECURITY DEFINER RPCs are what protect the data. Never put a secret key here.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://utbollibgwaroqnynial.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_EbdxGkDuuej_SUG19ETQzg_n9eb0TF7'

/** The app's day boundary (daily problem, streaks). Must match private.app_today() in SQL. */
export const APP_TIMEZONE = 'America/New_York'
