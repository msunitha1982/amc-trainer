/**
 * Step 2 of the data pipeline: turn cached pages into one record per distinct problem.
 *
 * Output (gitignored, contains answers): data/parsed.json
 * Output (gitignored, for topic classification): data/classify/batch-XX.json
 *
 * Shared AMC 10/12 problems become one record. Two slots are merged when the wiki says so
 * (redirect to the same canonical page, or the "from both the ... and ..." notice) or when their
 * statement and choices are textually identical, and only if their answer keys agree.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { allTests, answerKeyTitle, problemTitle, testPageTitle, wikiUrl, PROBLEMS_PER_TEST, type TestDef } from './lib/tests.ts'
import {
  boxedLetters, parseAnswerKey, parseProblemPage, parseTestPage, segmentsToPlainText, splitChoices,
  type Letter, type Segment,
} from './lib/parse-html.ts'
import type { CacheMeta } from './fetch.ts'

const ROOT = join(import.meta.dirname, '..')
const CACHE = join(ROOT, 'data', 'cache')
const cacheKey = (title: string) => title.replace(/[^A-Za-z0-9]+/g, '_')

function readCached(title: string): { html: string; meta: CacheMeta } | null {
  const k = cacheKey(title)
  const metaPath = join(CACHE, `${k}.json`)
  if (!existsSync(metaPath)) return null
  const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as CacheMeta
  if (meta.status !== 'ok') return null
  return { html: readFileSync(join(CACHE, `${k}.html`), 'utf8'), meta }
}

export interface Slot {
  test: TestDef
  n: number
  key: Letter | null
  statement: Segment[] | null
  statementSource: 'problem-page' | 'test-page' | null
  canonical: string | null
  sharedWith: { wikiName: string; num: number }[]
  solutions: { heading: string; text: string; boxed: Letter[] }[]
  pageUrl: string
  snapshot?: string
}

export interface ParsedProblem {
  id: string
  year: number
  tests: { t: string; n: number }[]
  /** Full statement including the choices, as scraped. */
  full: Segment[]
  statement: Segment[]
  choices: string[] | null
  answer: Letter | null
  answerSource: 'answer-key' | 'solutions' | null
  answerStatus: 'ok' | 'missing' | 'conflict'
  answerNote?: string
  url: string
  solutionText: string
  flags: string[]
  snapshots: string[]
}

function slotId(t: TestDef, n: number) {
  return `${t.id}-${n}`
}

function normalizeForMatch(segs: Segment[] | null): string {
  if (!segs) return ''
  return segmentsToPlainText(segs).replace(/\s+/g, '').replace(/\\(?:qquad|quad|[ ,;!])/g, '').toLowerCase()
}

function main() {
  const tests = allTests()
  const slots = new Map<string, Slot>()
  const byTitle = new Map<string, string>() // wiki problem title -> slot id

  for (const t of tests) {
    const keyPage = readCached(answerKeyTitle(t))
    const keys = keyPage ? parseAnswerKey(keyPage.html) : []
    const testPage = readCached(testPageTitle(t))
    const testStatements = testPage ? parseTestPage(testPage.html) : new Map<number, Segment[]>()
    for (let n = 1; n <= PROBLEMS_PER_TEST; n++) {
      const title = problemTitle(t, n)
      const page = readCached(title)
      const parsed = page ? parseProblemPage(page.html) : null
      let statement: Segment[] | null = null
      let statementSource: Slot['statementSource'] = null
      if (parsed && parsed.problems.length) {
        // Pages covering two differing versions label them, e.g. "Problem (AMC 12)".
        const mine = parsed.problems.find((p) => p.heading.includes(`AMC ${t.contest}`)) ?? parsed.problems[0]
        if (mine.segments.length) {
          statement = mine.segments
          statementSource = 'problem-page'
        }
      }
      if (!statement && testStatements.get(n)?.length) {
        statement = testStatements.get(n)!
        statementSource = 'test-page'
      }
      const solutions = (parsed?.solutions ?? []).map((s) => ({
        heading: s.heading,
        text: segmentsToPlainText(s.segments),
        boxed: boxedLetters(s.segments),
      }))
      const id = slotId(t, n)
      slots.set(id, {
        test: t,
        n,
        key: keys[n - 1] ?? null,
        statement,
        statementSource,
        canonical: parsed?.canonicalTitle ?? null,
        sharedWith: parsed?.sharedWith ?? [],
        solutions,
        pageUrl: parsed?.canonicalTitle ? wikiUrl(parsed.canonicalTitle) : wikiUrl(title),
        snapshot: page?.meta.snapshot,
      })
      byTitle.set(title, id)
    }
  }

  // --- Union-find over slots that are the same problem --------------------------------------
  const parent = new Map<string, string>([...slots.keys()].map((k) => [k, k]))
  const find = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!))
  const mergeNotes: string[] = []
  const tryUnion = (a: string, b: string, why: string) => {
    const sa = slots.get(a)!
    const sb = slots.get(b)!
    if (sa.test.contest === sb.test.contest) return // only 10/12 pairs are ever shared
    if (sa.key && sb.key && sa.key !== sb.key) {
      mergeNotes.push(`not merged (${why}) ${a} ~ ${b}: answer keys differ (${sa.key} vs ${sb.key})`)
      return
    }
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(rb, ra)
  }

  const testByWikiName = new Map(tests.map((t) => [t.wikiName, t]))
  const byCanonical = new Map<string, string[]>()
  for (const [id, s] of slots) {
    if (s.canonical) {
      const list = byCanonical.get(s.canonical) ?? []
      list.push(id)
      byCanonical.set(s.canonical, list)
      // A page that redirected to another slot's title links the two.
      const target = byTitle.get(s.canonical)
      if (target && target !== id) tryUnion(id, target, 'redirect')
    }
    for (const sw of s.sharedWith) {
      const t = testByWikiName.get(sw.wikiName)
      if (t && sw.num >= 1 && sw.num <= 25) {
        const other = slotId(t, sw.num)
        if (other !== id && slots.has(other)) tryUnion(id, other, 'notice')
      }
    }
  }
  for (const ids of byCanonical.values()) for (const other of ids.slice(1)) tryUnion(ids[0], other, 'canonical')

  // Identical statement text between the 10 and 12 of the same sitting.
  for (const t10 of tests.filter((t) => t.contest === '10')) {
    const t12 = tests.find((t) => t.contest === '12' && t.year === t10.year && t.variant === t10.variant && t.fall === t10.fall)
    if (!t12) continue
    const index12 = new Map<string, string>()
    for (let n = 1; n <= 25; n++) {
      const norm = normalizeForMatch(slots.get(slotId(t12, n))!.statement)
      if (norm.length > 40) index12.set(norm, slotId(t12, n))
    }
    for (let n = 1; n <= 25; n++) {
      const norm = normalizeForMatch(slots.get(slotId(t10, n))!.statement)
      const match = index12.get(norm)
      if (match) tryUnion(slotId(t10, n), match, 'identical text')
    }
  }

  // --- Build one record per group --------------------------------------------------------------
  const groups = new Map<string, string[]>()
  for (const id of slots.keys()) {
    const r = find(id)
    groups.set(r, [...(groups.get(r) ?? []), id])
  }
  const order = (a: Slot, b: Slot) => a.test.year - b.test.year || Number(a.test.contest) - Number(b.test.contest) || a.n - b.n
  const records: ParsedProblem[] = []
  for (const ids of groups.values()) {
    const members = ids.map((i) => slots.get(i)!).sort(order)
    // Prefer the AMC 10 slot's statement from its own problem page.
    const primary = members.find((m) => m.statementSource === 'problem-page') ?? members.find((m) => m.statement) ?? members[0]
    const flags: string[] = []
    const keys = [...new Set(members.map((m) => m.key).filter(Boolean))] as Letter[]
    const solutions = members.flatMap((m) => m.solutions)
    // Same solutions appear once per member page; dedupe by text.
    const uniqSolutions = [...new Map(solutions.map((s) => [s.text.slice(0, 200), s])).values()]
    const votes = new Map<Letter, number>()
    for (const s of uniqSolutions) {
      // One vote per solution: its last boxed letter is its final answer.
      const last = s.boxed[s.boxed.length - 1]
      if (last) votes.set(last, (votes.get(last) ?? 0) + 1)
    }
    const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1])
    let answer: Letter | null = null
    let answerSource: ParsedProblem['answerSource'] = null
    let answerStatus: ParsedProblem['answerStatus'] = 'missing'
    let answerNote: string | undefined
    const voteStr = ranked.map(([l, c]) => `${l}×${c}`).join(' ')
    if (keys.length > 1) {
      answerStatus = 'conflict'
      answerNote = `answer keys disagree: ${keys.join(' vs ')}`
    } else if (keys.length === 1) {
      const k = keys[0]
      const forKey = votes.get(k) ?? 0
      const top = ranked[0]
      if (top && top[0] !== k && top[1] >= 2 && top[1] > forKey) {
        answerStatus = 'conflict'
        answerNote = `answer key says ${k}; solutions vote ${voteStr}`
      } else {
        answer = k
        answerSource = 'answer-key'
        answerStatus = 'ok'
        if (top && top[0] !== k) flags.push(`minor solution disagreement (${voteStr})`)
      }
    } else if (ranked.length === 1 && ranked[0][1] >= 2) {
      answer = ranked[0][0]
      answerSource = 'solutions'
      answerStatus = 'ok'
      answerNote = `no answer key; ${ranked[0][1]} solutions agree on ${answer}`
      flags.push('answer from solutions')
    } else {
      answerNote = ranked.length ? `no answer key; solutions vote ${voteStr}` : 'no answer key and no boxed answers in solutions'
    }

    const full = primary.statement ?? []
    if (!primary.statement) flags.push('missing statement')
    if (primary.statementSource === 'test-page') flags.push('statement from full-test page')
    const { statement, choices } = splitChoices(full)
    if (!choices) flags.push('choices not parsed')
    if (!uniqSolutions.length) flags.push('no solutions')

    const first = members[0]
    records.push({
      id: slotId(first.test, first.n),
      year: first.test.year,
      tests: members.map((m) => ({ t: m.test.id, n: m.n })),
      full,
      statement,
      choices,
      answer,
      answerSource,
      answerStatus,
      answerNote,
      url: primary.pageUrl,
      solutionText: uniqSolutions
        .slice(0, 3)
        .map((s) => `[${s.heading}] ${s.text}`)
        .join('\n\n')
        .slice(0, 2500),
      flags,
      snapshots: members.map((m) => m.snapshot ?? '').filter(Boolean),
    })
  }
  records.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))

  writeFileSync(join(ROOT, 'data', 'parsed.json'), JSON.stringify({ generatedAt: new Date().toISOString(), mergeNotes, records }, null, 1))

  // Batches for topic classification: statement + choices + solution excerpts, no answer keys.
  const dir = join(ROOT, 'data', 'classify')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const BATCH = 100
  for (let i = 0; i * BATCH < records.length; i++) {
    const batch = records.slice(i * BATCH, (i + 1) * BATCH).map((r) => ({
      id: r.id,
      problem: segmentsToPlainText(r.full).slice(0, 1400),
      solutions: r.solutionText.slice(0, 900),
    }))
    writeFileSync(join(dir, `batch-${String(i).padStart(2, '0')}.json`), JSON.stringify(batch, null, 1))
  }

  const count = (f: (r: ParsedProblem) => boolean) => records.filter(f).length
  console.log(`slots: ${slots.size}, distinct problems: ${records.length}, shared: ${count((r) => r.tests.length > 1)}`)
  console.log(`answer ok: ${count((r) => r.answerStatus === 'ok')}, missing: ${count((r) => r.answerStatus === 'missing')}, conflict: ${count((r) => r.answerStatus === 'conflict')}`)
  console.log(`choices parsed: ${count((r) => !!r.choices)}, statements missing: ${count((r) => r.flags.includes('missing statement'))}`)
  console.log(`merge notes: ${mergeNotes.length}; batches: ${Math.ceil(records.length / BATCH)}`)
}

main()
