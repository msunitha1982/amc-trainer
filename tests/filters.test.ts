import { describe, expect, it } from 'vitest'
import { applyFilters, DEFAULT_FILTERS, pickNext, type Progress } from '../src/lib/filters.ts'
import type { ProblemMeta } from '../src/lib/types.ts'

const P = (id: string, y: number, tests: [string, number][], tp: string[], r: number): ProblemMeta => ({
  id, y, tests: tests.map(([t, n]) => ({ t, n })), tp, r, url: '',
})
const ALL = [
  P('2023-10A-5', 2023, [['2023-10A', 5], ['2023-12A', 4]], ['number_theory.bases'], 950),
  P('2023-10A-24', 2023, [['2023-10A', 24]], ['geometry.circles'], 1965),
  P('2001-12-3', 2001, [['2001-12', 3]], ['algebra.functions'], 920),
  P('2021F-12B-20', 2021, [['2021F-12B', 20]], ['counting.casework', 'algebra.sequences'], 1940),
]
const none: Progress = { status: {}, bookmarks: new Set() }

describe('applyFilters', () => {
  it('filters by contest, matching shared problems through either test', () => {
    expect(applyFilters(ALL, { ...DEFAULT_FILTERS, contest: '12' }, none).map((p) => p.id)).toEqual(['2023-10A-5', '2001-12-3', '2021F-12B-20'])
  })
  it('filters by A/B; 2000-2001 have neither', () => {
    expect(applyFilters(ALL, { ...DEFAULT_FILTERS, variant: 'B' }, none).map((p) => p.id)).toEqual(['2021F-12B-20'])
  })
  it('matches major topics and subtopics', () => {
    expect(applyFilters(ALL, { ...DEFAULT_FILTERS, topics: ['algebra'] }, none)).toHaveLength(2)
    expect(applyFilters(ALL, { ...DEFAULT_FILTERS, topics: ['algebra.sequences', 'geometry.circles'] }, none)).toHaveLength(2)
  })
  it('uses live ratings for difficulty bands', () => {
    expect(applyFilters(ALL, { ...DEFAULT_FILTERS, bands: ['boss'] }, none)).toHaveLength(2)
    expect(applyFilters(ALL, { ...DEFAULT_FILTERS, bands: ['boss'] }, none, { '2023-10A-24': [1400, 9, 5] })).toHaveLength(1)
  })
  it('filters by number range and status', () => {
    const progress: Progress = { status: { '2023-10A-5': 'solved', '2001-12-3': 'missed' }, bookmarks: new Set(['2023-10A-24']) }
    expect(applyFilters(ALL, { ...DEFAULT_FILTERS, numMin: 20, numMax: 25 }, none)).toHaveLength(2)
    expect(applyFilters(ALL, { ...DEFAULT_FILTERS, status: 'unsolved' }, progress).map((p) => p.id)).toEqual(['2023-10A-24', '2021F-12B-20'])
    expect(applyFilters(ALL, { ...DEFAULT_FILTERS, status: 'missed' }, progress).map((p) => p.id)).toEqual(['2001-12-3'])
    expect(applyFilters(ALL, { ...DEFAULT_FILTERS, status: 'bookmarked' }, progress).map((p) => p.id)).toEqual(['2023-10A-24'])
  })
})

describe('pickNext', () => {
  it('walks in contest order and wraps around', () => {
    expect(pickNext(ALL, 'order', {})!.id).toBe('2001-12-3')
    expect(pickNext(ALL, 'order', { currentId: '2001-12-3' })!.id).toBe('2021F-12B-20')
    expect(pickNext(ALL, 'order', { currentId: '2023-10A-24' })!.id).toBe('2001-12-3')
  })
  it('recommends problems near the player rating', () => {
    expect(pickNext(ALL, 'recommended', { userRating: 1880, rand: () => 0 })!.id).toBe('2023-10A-24')
    expect(pickNext(ALL, 'recommended', { userRating: 850, rand: () => 0 })!.id).toBe('2023-10A-5')
  })
  it('avoids skipped problems when it can', () => {
    const avoid = new Set(['2023-10A-5', '2023-10A-24', '2001-12-3'])
    expect(pickNext(ALL, 'random', { avoid, rand: () => 0 })!.id).toBe('2021F-12B-20')
  })
})
