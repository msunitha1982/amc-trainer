/**
 * Rating math. The database (private.glicko in supabase/migrations) is the source of truth; this
 * mirror exists for previews and is pinned to the SQL implementation by golden-vector tests.
 */

const Q = Math.LN10 / 400

export const USER_START = { rating: 1200, rd: 200 }
export const USER_MIN_RD = 60
export const PROBLEM_START_RD = 150
export const PROBLEM_MIN_RD = 50

/** Single-game Glicko-1 update. score: 1 = solved (win), 0 = missed (loss). */
export function glicko(r: number, rd: number, oppR: number, oppRd: number, score: number, minRd: number) {
  const g = 1 / Math.sqrt(1 + (3 * Q * Q * oppRd * oppRd) / (Math.PI * Math.PI))
  const e = 1 / (1 + Math.pow(10, (-g * (r - oppR)) / 400))
  const d2 = 1 / (Q * Q * g * g * e * (1 - e))
  const denom = 1 / (rd * rd) + 1 / d2
  return { rating: r + (Q / denom) * g * (score - e), rd: Math.max(Math.sqrt(1 / denom), minRd) }
}

/** Expected probability that a player rated `r` solves a problem rated `p`. */
export const expectedScore = (r: number, p: number) => 1 / (1 + Math.pow(10, (p - r) / 400))

/** Contests have grown harder over the years; each year before this one lowers a seed. */
export const YEAR_ANCHOR = 2024
export const PER_YEAR = 6

/**
 * Seed difficulty from test, problem number and year. The AoPS Wiki publishes only coarse
 * competition-level ratings, not per-problem ones, so position on the test is the main signal.
 * The two scales line up on problems shared by both tests (e.g. 10A #22 = 12A #18 ≈ 1850), and a
 * 2000 problem starts 144 lower than the same slot in 2024. Must match migration 0009.
 */
export function seedRating(contest: '10' | '12', n: number, year: number = YEAR_ANCHOR): number {
  const base = contest === '10' ? 700 + 55 * (n - 1) : 800 + 60 * (n - 1)
  return base + PER_YEAR * (year - YEAR_ANCHOR)
}

export type Band = 'warmup' | 'medium' | 'hard' | 'boss'
export const BANDS: { id: Band; label: string; min: number; max: number }[] = [
  { id: 'warmup', label: 'Warm-up', min: -Infinity, max: 1100 },
  { id: 'medium', label: 'Medium', min: 1100, max: 1500 },
  { id: 'hard', label: 'Hard', min: 1500, max: 1900 },
  { id: 'boss', label: 'Boss', min: 1900, max: Infinity },
]
/** Must match private.band() in SQL. */
export function band(rating: number): Band {
  return rating < 1100 ? 'warmup' : rating < 1500 ? 'medium' : rating < 1900 ? 'hard' : 'boss'
}
export const bandLabel = (b: Band) => BANDS.find((x) => x.id === b)!.label
