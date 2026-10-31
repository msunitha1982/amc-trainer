import { band, type Band } from './rating.ts'
import { contestOf, isFall, variantOf, type ProblemMeta } from './types.ts'

export type Status = 'any' | 'unsolved' | 'solved' | 'missed' | 'bookmarked'
export type Mode = 'random' | 'order' | 'recommended'

export interface Filters {
  contest: 'both' | '10' | '12'
  yearMin: number
  yearMax: number
  /** 'any' includes 2000-2001 (no A/B split). */
  variant: 'any' | 'A' | 'B'
  /** Major topics ("geometry") or subtopic tags ("geometry.circles"); a problem matches any. */
  topics: string[]
  bands: Band[]
  numMin: number
  numMax: number
  status: Status
  mode: Mode
}

export const DEFAULT_FILTERS: Filters = {
  contest: 'both',
  yearMin: 2000,
  yearMax: 2025,
  variant: 'any',
  topics: [],
  bands: [],
  numMin: 1,
  numMax: 25,
  status: 'any',
  mode: 'random',
}

export interface Progress {
  status: Record<string, 'solved' | 'missed'>
  bookmarks: Set<string>
}

/** Live problem ratings from the database, falling back to the seed rating. */
export type LiveRatings = Record<string, [rating: number, attempts: number, solves: number]>
export const ratingOf = (p: ProblemMeta, live?: LiveRatings) => live?.[p.id]?.[0] ?? p.r

export function matches(p: ProblemMeta, f: Filters, progress: Progress, live?: LiveRatings): boolean {
  if (p.y < f.yearMin || p.y > f.yearMax) return false
  const testOk = p.tests.some(
    (r) =>
      (f.contest === 'both' || contestOf(r.t) === f.contest) &&
      (f.variant === 'any' || variantOf(r.t) === f.variant) &&
      r.n >= f.numMin &&
      r.n <= f.numMax,
  )
  if (!testOk) return false
  if (f.topics.length && !f.topics.some((t) => p.tp.some((tag) => tag === t || tag.startsWith(t + '.')))) return false
  if (f.bands.length && !f.bands.includes(band(ratingOf(p, live)))) return false
  const st = progress.status[p.id]
  switch (f.status) {
    case 'unsolved':
      return !st
    case 'solved':
      return st === 'solved'
    case 'missed':
      return st === 'missed'
    case 'bookmarked':
      return progress.bookmarks.has(p.id)
    default:
      return true
  }
}

export function applyFilters(all: ProblemMeta[], f: Filters, progress: Progress, live?: LiveRatings) {
  return all.filter((p) => matches(p, f, progress, live))
}

/** Chronological contest order: year, spring before fall, A before B, then 10 before 12, then number. */
export function orderKey(p: ProblemMeta): string {
  const r = p.tests[0]
  return `${p.y}|${isFall(r.t) ? 1 : 0}|${variantOf(r.t) || '0'}|${contestOf(r.t)}|${String(r.n).padStart(2, '0')}`
}

/**
 * Choose the next problem. `avoid` holds ids to skip (current problem, recent skips).
 * `rand` is injectable for tests.
 */
export function pickNext(
  candidates: ProblemMeta[],
  mode: Mode,
  opts: { currentId?: string; avoid?: Set<string>; userRating?: number; live?: LiveRatings; rand?: () => number },
): ProblemMeta | null {
  const rand = opts.rand ?? Math.random
  const avoid = opts.avoid ?? new Set<string>()
  const pool = candidates.filter((p) => !avoid.has(p.id) && p.id !== opts.currentId)
  if (!pool.length) return candidates.find((p) => p.id !== opts.currentId) ?? null
  if (mode === 'order') {
    const sorted = [...candidates].sort((a, b) => orderKey(a).localeCompare(orderKey(b)))
    const i = opts.currentId ? sorted.findIndex((p) => p.id === opts.currentId) : -1
    for (let k = 1; k <= sorted.length; k++) {
      const p = sorted[(i + k) % sorted.length]
      if (!avoid.has(p.id) && p.id !== opts.currentId) return p
    }
    return null
  }
  if (mode === 'recommended') {
    // Aim slightly above the player's rating: a ~40-50% solve chance is where learning happens.
    const target = (opts.userRating ?? 1200) + 75
    for (const width of [100, 200, 350, 600, Infinity]) {
      const near = pool.filter((p) => Math.abs(ratingOf(p, opts.live) - target) <= width)
      if (near.length) return near[Math.floor(rand() * near.length)]
    }
  }
  return pool[Math.floor(rand() * pool.length)]
}

/** Serialize/deserialize filters for localStorage and challenge records. */
export function sanitizeFilters(raw: unknown): Filters {
  const f = { ...DEFAULT_FILTERS, ...(typeof raw === 'object' && raw ? raw : {}) } as Filters
  if (!Array.isArray(f.topics)) f.topics = []
  if (!Array.isArray(f.bands)) f.bands = []
  return f
}
