import { describe, expect, it } from 'vitest'
import { band, expectedScore, glicko, seedRating } from '../src/lib/rating.ts'

// Golden vectors produced by the database implementation, private.glicko(), on 2026-10-30:
//   select ... from (values ...) v, lateral private.glicko(v.r, v.d, v.opp_r, v.opp_d, v.s, v.min_rd) g
const GOLDEN: [r: number, rd: number, oppR: number, oppRd: number, s: number, minRd: number, rating: number, newRd: number][] = [
  [1200, 350, 700, 200, 1, 60, 1239.64123556922, 317.503985872068],
  [1200, 350, 700, 200, 0, 60, 749.703003242289, 317.503985872068],
  [1200, 350, 2020, 200, 1, 60, 1755.68902997005, 341.26646735512],
  [1500, 80, 1500, 200, 0, 60, 1485.01411459384, 78.5298409240269],
  [1800, 60, 1300, 50, 1, 60, 1801.12017761275, 60],
  [1350, 200, 1900, 120, 1, 50, 1544.03527210345, 194.783344495581],
  [2020, 200, 1200, 350, 1, 50, 2026.13840330363, 197.719191116656],
  [900, 50, 1600, 300, 0, 50, 899.466915349499, 50],
]

describe('glicko (mirror of private.glicko)', () => {
  it.each(GOLDEN)('r=%d rd=%d vs %d/%d score=%d', (r, rd, oppR, oppRd, s, minRd, rating, newRd) => {
    const out = glicko(r, rd, oppR, oppRd, s, minRd)
    expect(out.rating).toBeCloseTo(rating, 6)
    expect(out.rd).toBeCloseTo(newRd, 6)
  })

  it('wins never lower and losses never raise a rating', () => {
    for (const opp of [600, 1200, 2400]) {
      expect(glicko(1200, 200, opp, 150, 1, 60).rating).toBeGreaterThan(1200)
      expect(glicko(1200, 200, opp, 150, 0, 60).rating).toBeLessThan(1200)
    }
  })

  it('upsets move ratings more than expected results', () => {
    const upsetWin = glicko(1200, 200, 2000, 150, 1, 60).rating - 1200
    const expectedWin = glicko(1200, 200, 800, 150, 1, 60).rating - 1200
    expect(upsetWin).toBeGreaterThan(expectedWin)
  })

  it('deviation shrinks with each game but respects the floor', () => {
    let rd = 200
    for (let i = 0; i < 200; i++) rd = glicko(1200, rd, 1200, 150, i % 2, 60).rd
    expect(rd).toBe(60)
  })

  it('is zero-sum-ish between a player and a problem with equal deviations', () => {
    const user = glicko(1400, 150, 1400, 150, 1, 50)
    const prob = glicko(1400, 150, 1400, 150, 0, 50)
    expect(user.rating - 1400).toBeCloseTo(1400 - prob.rating, 9)
  })
})

describe('seed ratings and bands', () => {
  it('runs from easy #1 to hard #25 on both tests', () => {
    expect(seedRating('10', 1)).toBe(700)
    expect(seedRating('10', 25)).toBe(2020)
    expect(seedRating('12', 1)).toBe(800)
    expect(seedRating('12', 25)).toBe(2240)
  })

  it('roughly agrees on real shared problems (2023: 10A #5 = 12A #4, #22 = #18, #25 = #21)', () => {
    for (const [a, b] of [[5, 4], [22, 18], [25, 21]]) expect(Math.abs(seedRating('10', a) - seedRating('12', b))).toBeLessThan(80)
  })

  it('maps ratings to bands like private.band()', () => {
    expect(band(700)).toBe('warmup')
    expect(band(1099.9)).toBe('warmup')
    expect(band(1100)).toBe('medium')
    expect(band(1500)).toBe('hard')
    expect(band(1900)).toBe('boss')
  })

  it('expected score is 50% at equal ratings and symmetric', () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5)
    expect(expectedScore(1500, 1700) + expectedScore(1700, 1500)).toBeCloseTo(1)
  })
})
