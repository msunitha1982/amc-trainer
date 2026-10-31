// Catalogue of AMC 10/12 contests on the AoPS Wiki, 2000 to present.
// Data only; nothing here is fetched.

export type Contest = '10' | '12'

export interface TestDef {
  /** Stable id used in problem ids, e.g. "2023-10A", "2021F-12B", "2001-10". */
  id: string
  year: number
  contest: Contest
  /** "A" | "B" | "" (2000-2001 had a single sitting). */
  variant: 'A' | 'B' | ''
  fall: boolean
  /** Wiki page prefix, e.g. "2021 Fall AMC 10A". */
  wikiName: string
}

export const FIRST_YEAR = 2000
/** Last contest year whose problems are public. The 2026 contests are held in November 2026. */
export const LAST_YEAR = 2025
export const PROBLEMS_PER_TEST = 25

export function allTests(first = FIRST_YEAR, last = LAST_YEAR): TestDef[] {
  const out: TestDef[] = []
  for (let year = first; year <= last; year++) {
    for (const contest of ['10', '12'] as const) {
      if (year <= 2001) {
        out.push({ id: `${year}-${contest}`, year, contest, variant: '', fall: false, wikiName: `${year} AMC ${contest}` })
        continue
      }
      for (const variant of ['A', 'B'] as const) {
        out.push({ id: `${year}-${contest}${variant}`, year, contest, variant, fall: false, wikiName: `${year} AMC ${contest}${variant}` })
        if (year === 2021) {
          out.push({ id: `${year}F-${contest}${variant}`, year, contest, variant, fall: true, wikiName: `${year} Fall AMC ${contest}${variant}` })
        }
      }
    }
  }
  return out
}

export const problemTitle = (t: TestDef, n: number) => `${t.wikiName} Problems/Problem ${n}`
export const answerKeyTitle = (t: TestDef) => `${t.wikiName} Answer Key`
export const testPageTitle = (t: TestDef) => `${t.wikiName} Problems`
export const wikiUrl = (title: string) =>
  `https://artofproblemsolving.com/wiki/index.php/${title.replace(/ /g, '_')}`
