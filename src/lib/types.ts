/** Shapes of the static data files in public/data/. Answers are deliberately absent. */

export type Segment =
  | { t: 'text'; v: string }
  /** `img` is AoPS's rendered image, kept only when KaTeX cannot render `v`. */
  | { t: 'math'; v: string; display: boolean; img?: string }
  | { t: 'img'; src: string; alt?: string; w?: number; h?: number }

export interface TestRef {
  /** Test id, e.g. "2023-10A", "2021F-12B", "2001-10". */
  t: string
  /** Problem number on that test. */
  n: number
}

/** One entry of public/data/index.json: everything filters need, no statement text. */
export interface ProblemMeta {
  id: string
  /** Year. */
  y: number
  /** Every test this problem appeared on (shared 10/12 problems have two). */
  tests: TestRef[]
  /** Topic tags such as "geometry.circles" (1-3). */
  tp: string[]
  /** Seed rating from test and problem number. */
  r: number
  /** AoPS Wiki page for the problem (solutions live there). */
  url: string
}

export interface Statement {
  s: Segment[]
  /** The five answer choices as LaTeX, or null when they could not be separated from the statement. */
  ch: string[] | null
}

export interface DataIndex {
  version: string
  generatedAt: string
  problems: ProblemMeta[]
}

export const LETTERS = ['A', 'B', 'C', 'D', 'E'] as const
export type Letter = (typeof LETTERS)[number]

export const contestOf = (testId: string) => (testId.includes('-10') ? '10' : '12')
export const variantOf = (testId: string) => testId.match(/-1[02]([AB])?$/)?.[1] ?? ''
export const isFall = (testId: string) => testId.includes('F-')

export function testLabel(testId: string): string {
  const [yr, rest] = testId.split('-')
  const fall = yr.endsWith('F')
  return `${fall ? yr.slice(0, -1) + ' Fall' : yr} AMC ${rest}`
}
export const refLabel = (r: TestRef) => `${testLabel(r.t)} #${r.n}`
