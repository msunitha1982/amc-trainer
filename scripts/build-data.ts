/**
 * Step 4 of the data pipeline: produce the files the site and database use.
 *
 *   public/data/index.json              metadata for filters (no statements, no answers)
 *   public/data/statements/<year>.json  statements and choices, loaded on demand (no answers)
 *   supabase/seed/problems.sql          problem metadata + seed ratings (committed)
 *   supabase/seed/answers.sql           answers (GITIGNORED; apply privately, never publish)
 *   docs/DATA_REPORT.md                 counts and data-quality notes
 *
 * Only records with a confirmed answer and a statement are shipped.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import katex from 'katex'
import { katexOptions, normalizeLatex } from '../src/lib/katex.ts'
import { seedRating } from '../src/lib/rating.ts'
import { ALL_TAGS, majorOf } from '../src/lib/taxonomy.ts'
import type { ProblemMeta, Segment, Statement } from '../src/lib/types.ts'
import { allTests, PROBLEMS_PER_TEST } from './lib/tests.ts'
import type { ParsedProblem } from './parse.ts'

const ROOT = join(import.meta.dirname, '..')
const read = <T>(p: string, fallback: T): T => (existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as T) : fallback)

const renders = (latex: string, display = false) => {
  try {
    katex.renderToString(normalizeLatex(latex), katexOptions(display))
    return true
  } catch {
    return false
  }
}

function main() {
  const { records, mergeNotes } = read<{ records: ParsedProblem[]; mergeNotes: string[] }>(join(ROOT, 'data', 'parsed.json'), { records: [], mergeNotes: [] })
  const topics = read<Record<string, string[]>>(join(ROOT, 'data', 'topics.json'), {})
  const diagrams = read<Record<string, string | null>>(join(ROOT, 'data', 'diagrams.json'), {})

  const stats = { katexFail: 0, katexTotal: 0, choiceFallback: 0, hotlinked: 0, localDiagrams: 0, untagged: 0, badTags: 0 }
  const katexFailures: string[] = []
  const shipped: ParsedProblem[] = []
  const excluded: { r: ParsedProblem; why: string }[] = []
  const index: ProblemMeta[] = []
  const byYear = new Map<number, Record<string, Statement>>()

  const fixSegments = (segs: Segment[]): Segment[] =>
    segs.map((s) => {
      if (s.t === 'math') {
        stats.katexTotal++
        if (renders(s.v, s.display)) return { t: 'math', v: s.v, display: s.display }
        stats.katexFail++
        if (katexFailures.length < 40) katexFailures.push(s.v.slice(0, 120))
        return s // keep AoPS's rendered image as the fallback
      }
      if (s.t === 'img') {
        const local = diagrams[s.src]
        if (local) stats.localDiagrams++
        else stats.hotlinked++
        return { ...s, src: local ?? s.src }
      }
      return s
    })

  for (const r of records) {
    if (r.answerStatus !== 'ok' || !r.answer) {
      excluded.push({ r, why: r.answerStatus === 'conflict' ? `answer uncertain: ${r.answerNote}` : `no answer: ${r.answerNote ?? ''}` })
      continue
    }
    if (!r.full.length) {
      excluded.push({ r, why: 'no statement in any archived copy' })
      continue
    }
    let statement: Segment[]
    let choices = r.choices
    if (choices && !choices.every((c) => renders(c))) {
      // A choice KaTeX can't draw: show the original choice line (with image fallbacks) instead.
      stats.choiceFallback++
      choices = null
    }
    if (choices) statement = fixSegments(r.statement)
    else statement = fixSegments(r.full)

    let tags = (topics[r.id] ?? []).filter((t) => ALL_TAGS.includes(t))
    if ((topics[r.id] ?? []).length !== tags.length) stats.badTags++
    tags = [...new Set(tags)].slice(0, 3)
    if (!tags.length) stats.untagged++

    const seeds = r.tests.map((t) => seedRating(t.t.includes('-10') ? '10' : '12', t.n))
    const seed = Math.round(seeds.reduce((a, b) => a + b, 0) / seeds.length)
    index.push({ id: r.id, y: r.year, tests: r.tests, tp: tags, r: seed, url: r.url })
    const yr = byYear.get(r.year) ?? {}
    yr[r.id] = { s: statement, ch: choices }
    byYear.set(r.year, yr)
    shipped.push(r)
  }

  // --- Static files ------------------------------------------------------------------------------
  const dataDir = join(ROOT, 'public', 'data')
  rmSync(join(dataDir, 'statements'), { recursive: true, force: true })
  mkdirSync(join(dataDir, 'statements'), { recursive: true })
  for (const [year, m] of byYear) writeFileSync(join(dataDir, 'statements', `${year}.json`), JSON.stringify(m))
  const version = createHash('sha1').update(JSON.stringify(index)).digest('hex').slice(0, 12)
  writeFileSync(join(dataDir, 'index.json'), JSON.stringify({ version, generatedAt: new Date().toISOString(), problems: index }))

  // --- SQL seeds ------------------------------------------------------------------------------------
  mkdirSync(join(ROOT, 'supabase', 'seed'), { recursive: true })
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`
  const arr = (a: string[]) => `array[${a.map(q).join(',')}]::text[]`
  const problemRows = index.map((p) => {
    const contests = [...new Set(p.tests.map((t) => (t.t.includes('-10') ? '10' : '12')))].sort()
    const majors = [...new Set(p.tp.map(majorOf))]
    const maxN = Math.max(...p.tests.map((t) => t.n))
    return `(${q(p.id)},${p.y},${arr(contests)},${arr(majors)},${maxN},${p.r},${p.r},150)`
  })
  writeFileSync(
    join(ROOT, 'supabase', 'seed', 'problems.sql'),
    `-- Generated by scripts/build-data.ts (data version ${version}). Safe to re-run: live ratings are kept.\n` +
      `insert into public.problems (id, year, contests, topics, max_number, seed_rating, rating, rating_rd) values\n` +
      problemRows.join(',\n') +
      `\non conflict (id) do update set year = excluded.year, contests = excluded.contests, topics = excluded.topics,\n` +
      `  max_number = excluded.max_number, seed_rating = excluded.seed_rating;\n`,
  )
  // Answers: compact letter string in id order, so they can be applied with one short statement.
  const ids = shipped.map((r) => r.id)
  const letters = shipped.map((r) => r.answer).join('')
  writeFileSync(
    join(ROOT, 'supabase', 'seed', 'answers.sql'),
    `-- GENERATED, GITIGNORED: correct answers. Apply privately (SQL editor or psql); never commit or publish.\n` +
      `insert into private.answers (problem_id, answer)\n` +
      `select ids[i], substr(${q(letters)}, i, 1)\n` +
      `  from (select ${arr(ids)} as ids) x, generate_series(1, ${ids.length}) i\n` +
      `on conflict (problem_id) do update set answer = excluded.answer;\n`,
  )

  writeReport({ records, shipped, excluded, stats, katexFailures, mergeNotes, version, topics })
  console.log(`shipped ${shipped.length}/${records.length} problems (version ${version}); excluded ${excluded.length}`)
  console.log(`katex failures ${stats.katexFail}/${stats.katexTotal}; choice fallbacks ${stats.choiceFallback}; diagrams local ${stats.localDiagrams}, hotlinked ${stats.hotlinked}; untagged ${stats.untagged}`)
}

function writeReport(ctx: {
  records: ParsedProblem[]
  shipped: ParsedProblem[]
  excluded: { r: ParsedProblem; why: string }[]
  stats: Record<string, number>
  katexFailures: string[]
  mergeNotes: string[]
  version: string
  topics: Record<string, string[]>
}) {
  const { records, shipped, excluded, stats } = ctx
  const tests = allTests()
  const shippedIds = new Set(shipped.map((r) => r.id))
  const slotsShipped = new Map<string, number>()
  for (const r of records) for (const t of r.tests) if (shippedIds.has(r.id)) slotsShipped.set(t.t, (slotsShipped.get(t.t) ?? 0) + 1)
  const years = [...new Set(tests.map((t) => t.year))]
  const rowFor = (y: number) => {
    const cells = ['10A', '10B', '12A', '12B'].map((v) => {
      const ids = y <= 2001 ? (v.endsWith('A') ? [`${y}-${v.slice(0, 2)}`] : []) : [`${y}-${v}`, ...(y === 2021 ? [`${y}F-${v}`] : [])]
      if (!ids.length) return '—'
      return ids.map((id) => `${slotsShipped.get(id) ?? 0}/${PROBLEMS_PER_TEST}`).join(' + F ')
    })
    return `| ${y}${y <= 2001 ? ' (10 / 12)' : y === 2021 ? ' (Spring + Fall)' : ''} | ${cells.join(' | ')} |`
  }
  const flagCount = (f: string) => shipped.filter((r) => r.flags.includes(f)).length
  const flagLike = (f: string) => shipped.filter((r) => r.flags.some((x) => x.startsWith(f))).length
  const shared = shipped.filter((r) => r.tests.length > 1).length
  const majors = new Map<string, number>()
  for (const r of shipped) for (const m of new Set((ctx.topics[r.id] ?? []).map(majorOf))) majors.set(m, (majors.get(m) ?? 0) + 1)
  const exclByReason = new Map<string, number>()
  for (const e of excluded) {
    const k = e.why.split(':')[0]
    exclByReason.set(k, (exclByReason.get(k) ?? 0) + 1)
  }

  const md = `# Data report

Generated by \`scripts/build-data.ts\` (data version \`${ctx.version}\`, ${new Date().toISOString().slice(0, 10)}).

## Summary

| | count |
|---|---:|
| Test slots scanned (104 contests × 25) | ${tests.length * PROBLEMS_PER_TEST} |
| Distinct problems after merging shared 10/12 problems | ${records.length} |
| **Shipped** (statement + confirmed answer) | **${shipped.length}** |
| Shipped problems that appear on both the AMC 10 and AMC 12 | ${shared} |
| Excluded | ${excluded.length} |

## Shipped problems per contest

"F" is the 2021 Fall contest. For 2000–2001 (one AMC 10 and one AMC 12, no A/B), the counts are in the A columns.

| Year | 10A | 10B | 12A | 12B |
|---|---|---|---|---|
${years.map(rowFor).join('\n')}

## Excluded records

| reason | count |
|---|---:|
${[...exclByReason].map(([k, v]) => `| ${k} | ${v} |`).join('\n') || '| none | 0 |'}

${excluded.length ? `<details><summary>All excluded records</summary>\n\n${excluded.map((e) => `- \`${e.r.id}\` (${e.r.tests.map((t) => `${t.t} #${t.n}`).join(', ')}): ${e.why}`).join('\n')}\n\n</details>` : ''}

**What we did:** problems without a confirmed answer are not shipped. An answer is confirmed when the contest's answer-key page has it and the wiki solutions don't contradict it: at least two solutions boxing a different letter, outnumbering the key, counts as a contradiction. Where the answer key isn't archived, we accept an answer only when two or more solutions agree unanimously.

## Quality flags on shipped problems

| flag | count | handling |
|---|---:|---|
| Choices not separated from the statement | ${flagCount('choices not parsed') + stats.choiceFallback} | The original choice line (often a picture) stays in the statement; buttons show letters A–E only. |
| KaTeX can't render a formula | ${stats.katexFail} of ${stats.katexTotal} formulas | AoPS's own rendered image of that formula is shown instead. |
| Statement taken from the full-contest page | ${flagCount('statement from full-test page')} | The per-problem page wasn't archived; the statement is identical, but there are no solutions to help topic tagging. |
| Answer from unanimous solutions (no archived key) | ${flagCount('answer from solutions')} | Shipped; listed here for transparency. |
| One solution disagrees with the key | ${flagLike('minor solution disagreement')} | Key wins: usually a typo in one community solution. |
| No topic tags | ${stats.untagged} | Shows up only under "all topics". |
| Diagrams stored in the repo | ${stats.localDiagrams} | \`public/diagrams/\` |
| Diagrams hotlinked (couldn't be downloaded) | ${stats.hotlinked} | Served from AoPS's servers. |

## Topics (major, shipped problems)

${[...majors].sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`).join('\n') || '- (not classified yet)'}

## Source and coverage notes

- **Source.** The AoPS Wiki's MediaWiki API (and every other wiki URL) returns a Cloudflare bot challenge (HTTP 403) to scripts. We don't try to bypass it. \`scripts/fetch.ts\` probes the API once per run and otherwise reads the Internet Archive's Wayback Machine copies of the same pages. The content is CC BY-SA. Diagrams come from AoPS's image server (\`latex.artofproblemsolving.com\`), which isn't blocked, or else from Wayback.
- **2025 contests.** The Wayback Machine has only pre-contest placeholder copies of the 2025 pages (taken before November 2025), plus a September 2026 copy that is itself a Cloudflare 403 page. So 2025 problems are absent. Re-running the pipeline picks them up automatically once an archived copy exists or the API opens.
- **Difficulty.** The AoPS Wiki publishes only coarse, contest-level difficulty ratings (on its "AoPS Wiki:Competition ratings" page), not per-problem ones. Seed ratings therefore come from test and problem number (AMC 10: 700 + 55·(n−1); AMC 12: 800 + 60·(n−1); shared problems average the two). Bands: Warm-up < 1100 ≤ Medium < 1500 ≤ Hard < 1900 ≤ Boss. Ratings then adapt from real results in the database.
- **Shared problems.** Slots are merged when the wiki redirects both to one page, when it shows the "from both the … and …" notice, or when statement and choices are textually identical. Merges happen only if the answer keys agree.
${ctx.mergeNotes.length ? `\nMerge notes:\n${ctx.mergeNotes.map((m) => `- ${m}`).join('\n')}\n` : ''}
${ctx.katexFailures.length ? `\n<details><summary>Sample of formulas KaTeX couldn't render (image fallback used)</summary>\n\n${ctx.katexFailures.map((f) => '- `' + f.replace(/`/g, "'") + '`').join('\n')}\n\n</details>\n` : ''}`
  writeFileSync(join(ROOT, 'docs', 'DATA_REPORT.md'), md)
}

main()
