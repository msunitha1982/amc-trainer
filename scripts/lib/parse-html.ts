/**
 * Pure parsing helpers for rendered AoPS Wiki pages. No I/O; unit-tested in tests/parser.test.ts.
 *
 * All scraped content is treated as untrusted data: we only ever extract text, LaTeX source
 * strings and image URLs from it, and the app renders those through React text nodes and KaTeX
 * (with `trust: false`), never as raw HTML.
 */
import { parse, type HTMLElement, type Node } from 'node-html-parser'

export type Segment =
  | { t: 'text'; v: string }
  | { t: 'math'; v: string; display: boolean; img?: string }
  | { t: 'img'; src: string; alt?: string; w?: number; h?: number }

export interface Section {
  heading: string
  segments: Segment[]
}

export interface ProblemPage {
  canonicalTitle: string | null
  /** From the "The following problem is from both the X #n and Y #m" notice. */
  sharedWith: { wikiName: string; num: number }[]
  problems: Section[]
  solutions: Section[]
}

const ELEMENT = 1
const TEXT = 3
const LETTERS = ['A', 'B', 'C', 'D', 'E'] as const
export type Letter = (typeof LETTERS)[number]

const absUrl = (src: string) => (src.startsWith('//') ? `https:${src}` : src)

/** Undo Wayback's URL rewriting, if any, e.g. https://web.archive.org/web/2025im_/https://x → https://x */
export function unwayback(url: string): string {
  const m = url.match(/^(?:https?:)?\/\/web\.archive\.org\/web\/\d+[a-z_]*\/(.+)$/)
  return absUrl(m ? m[1] : url)
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/g, '\u00a0')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Strip the delimiters from an AoPS LaTeX alt text and report whether it is display math. */
export function unwrapMath(alt: string): { v: string; display: boolean } {
  const s = alt.trim()
  if (s.startsWith('$$') && s.endsWith('$$') && s.length >= 4) return { v: s.slice(2, -2).trim(), display: true }
  if (s.startsWith('\\[') && s.endsWith('\\]')) return { v: s.slice(2, -2).trim(), display: true }
  if (s.startsWith('\\(') && s.endsWith('\\)')) return { v: s.slice(2, -2).trim(), display: false }
  if (s.startsWith('$') && s.endsWith('$') && s.length >= 2) return { v: s.slice(1, -1).trim(), display: false }
  // Environments such as \begin{align*}...\end{align*} are display math without $ delimiters.
  return { v: s, display: true }
}

function pushText(out: Segment[], v: string) {
  if (!v) return
  const last = out[out.length - 1]
  if (last && last.t === 'text') last.v += v
  else out.push({ t: 'text', v })
}

const BLOCK_TAGS = new Set(['p', 'div', 'dl', 'dd', 'ul', 'ol', 'li', 'table', 'tr', 'center', 'blockquote', 'pre'])

/** Convert a run of nodes into segments. */
export function nodesToSegments(nodes: Node[]): Segment[] {
  const out: Segment[] = []
  const walk = (node: Node) => {
    if (node.nodeType === TEXT) {
      pushText(out, decodeEntities(node.rawText).replace(/[ \t\r\n]+/g, ' '))
      return
    }
    if (node.nodeType !== ELEMENT) return
    const el = node as HTMLElement
    const tag = (el.rawTagName ?? '').toLowerCase()
    if (tag === 'script' || tag === 'style' || el.classList?.contains('toc') || el.classList?.contains('mw-editsection')) return
    if (tag === 'br') return pushText(out, '\n')
    if (tag === 'img') {
      const src = unwayback(el.getAttribute('src') ?? '')
      const alt = decodeEntities(el.getAttribute('alt') ?? '')
      const cls = el.getAttribute('class') ?? ''
      const w = Number(el.getAttribute('width')) || undefined
      const h = Number(el.getAttribute('height')) || undefined
      const isLatexImg = /latex\.artofproblemsolving\.com/.test(src)
      if (isLatexImg && alt && !/^\s*\[asy\]/.test(alt) && (cls.includes('latex') || alt.includes('$') || alt.includes('\\'))) {
        const m = unwrapMath(alt)
        const display = m.display || cls.includes('latexcenter')
        if (display) pushText(out, '\n\n')
        out.push({ t: 'math', v: m.v, display, img: src })
        if (display) pushText(out, '\n\n')
        return
      }
      pushText(out, '\n\n')
      out.push({ t: 'img', src, alt: /^\s*\[asy\]/.test(alt) ? 'diagram' : alt || undefined, w, h })
      pushText(out, '\n\n')
      return
    }
    const block = BLOCK_TAGS.has(tag)
    if (block) pushText(out, '\n\n')
    if (tag === 'li') pushText(out, '• ')
    for (const child of el.childNodes) walk(child)
    if (block) pushText(out, '\n\n')
  }
  for (const n of nodes) walk(n)
  return normalizeSegments(out)
}

/** Collapse whitespace: at most one blank line between blocks, no leading/trailing blank text. */
export function normalizeSegments(segs: Segment[]): Segment[] {
  const out: Segment[] = []
  for (const s of segs) {
    if (s.t !== 'text') {
      out.push(s)
      continue
    }
    const v = s.v
      .replace(/[ \u00a0]*\n[ \u00a0]*/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/ {2,}/g, ' ')
    pushText(out, v)
  }
  // Re-run collapse after merges, then trim the ends.
  for (const s of out) if (s.t === 'text') s.v = s.v.replace(/\n{3,}/g, '\n\n')
  while (out.length && out[0].t === 'text' && !(out[0] as { v: string }).v.trim()) out.shift()
  while (out.length && out[out.length - 1].t === 'text' && !(out[out.length - 1] as { v: string }).v.trim()) out.pop()
  if (out.length && out[0].t === 'text') out[0] = { t: 'text', v: (out[0] as { v: string }).v.trimStart() }
  const last = out[out.length - 1]
  if (last && last.t === 'text') out[out.length - 1] = { t: 'text', v: last.v.trimEnd() }
  return out
}

function contentRoot(html: string): HTMLElement | null {
  const root = parse(html, { comment: false })
  return root.querySelector('.mw-parser-output')
}

/** Split the article body into [heading, nodes] sections at each <h2>/<h3>. */
function sections(body: HTMLElement): { heading: string; level: number; nodes: Node[] }[] {
  const out: { heading: string; level: number; nodes: Node[] }[] = [{ heading: '', level: 0, nodes: [] }]
  for (const child of body.childNodes) {
    const tag = child.nodeType === ELEMENT ? ((child as HTMLElement).rawTagName ?? '').toLowerCase() : ''
    if (/^h[2-4]$/.test(tag)) {
      const el = child as HTMLElement
      const headline = el.querySelector('.mw-headline')
      out.push({ heading: decodeEntities((headline ?? el).text).trim(), level: Number(tag[1]), nodes: [] })
    } else {
      out[out.length - 1].nodes.push(child)
    }
  }
  return out
}

const SHARED_RE = /(\d{4}(?: Fall)? AMC 1[02][AB]?)\s*(?:Problems\/Problem\s*|#\s*|Problem\s*)(\d{1,2})/g

export function parseProblemPage(html: string): ProblemPage {
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? null
  let canonicalTitle: string | null = null
  if (canonical) {
    const m = unwayback(canonical).match(/\/wiki\/index\.php\/(.+)$/) ?? unwayback(canonical).match(/[?&]title=([^&]+)/)
    if (m) canonicalTitle = decodeURIComponent(m[1]).replace(/_/g, ' ')
  }
  const body = contentRoot(html)
  const result: ProblemPage = { canonicalTitle, sharedWith: [], problems: [], solutions: [] }
  if (!body) return result

  for (const sec of sections(body)) {
    const h = sec.heading
    if (sec.level === 0) {
      // Preamble may carry the "from both the ... and ..." notice.
      const txt = decodeEntities(sec.nodes.map((n) => n.text).join(' '))
      if (/following problem is from both/i.test(txt)) {
        for (const m of txt.matchAll(SHARED_RE)) result.sharedWith.push({ wikiName: m[1], num: Number(m[2]) })
      }
      continue
    }
    if (/^problem\b/i.test(h)) {
      result.problems.push({ heading: h, segments: nodesToSegments(sec.nodes) })
    } else if (/solution/i.test(h) && !/video/i.test(h)) {
      result.solutions.push({ heading: h, segments: nodesToSegments(sec.nodes) })
    }
  }
  // Some pages put the statement before any heading.
  if (result.problems.length === 0) {
    const pre = sections(body)[0]
    const segs = nodesToSegments(pre.nodes.filter((n) => !/following problem is from both/i.test(n.text)))
    if (segs.length) result.problems.push({ heading: 'Problem', segments: segs })
  }
  return result
}

/** Full-test page ("2023 AMC 10A Problems"): map problem number → statement segments. */
export function parseTestPage(html: string): Map<number, Segment[]> {
  const out = new Map<number, Segment[]>()
  const body = contentRoot(html)
  if (!body) return out
  for (const sec of sections(body)) {
    const m = sec.heading.match(/^Problem\s*(\d{1,2})\b/i)
    if (!m) continue
    // Drop the trailing "Solution" link paragraph.
    const nodes = sec.nodes.filter((n) => !/^\s*(?:Solution|\[\s*Solution\s*\])\s*$/i.test(n.text))
    out.set(Number(m[1]), nodesToSegments(nodes))
  }
  return out
}

/** Answer key page: an ordered list of letters (some older pages use plain lines like "1. E"). */
export function parseAnswerKey(html: string): (Letter | null)[] {
  const body = contentRoot(html)
  if (!body) return []
  const items = body.querySelectorAll('ol > li')
  let raw: string[]
  if (items.length >= 20) raw = items.map((li) => li.text.trim())
  else {
    raw = []
    for (const m of body.text.matchAll(/^\s*(\d{1,2})\s*[.):]\s*\(?([A-E])\)?\s*$/gm)) raw[Number(m[1]) - 1] = m[2]
  }
  return raw.map((s) => {
    const m = (s ?? '').trim().match(/^\(?([A-E])\)?(?:\s|$)/)
    return m ? (m[1] as Letter) : null
  })
}

// ---------------------------------------------------------------------------
// Answer choices
// ---------------------------------------------------------------------------

/** Matches a choice marker such as \textbf{(A) } or \mathrm{(B)} or a bare (C), capturing the letter. */
const CMD = String.raw`\\(?:textbf|mathrm|text|mathbf|textrm|mbox|textsf|rm|bf)`
/**
 * Matches choice markers, capturing the letter: (A), \textbf{(A) }, \mathrm{(A) \ }, (\mathrm {A}),
 * (\textbf{A}). Group 1 is set when the marker opens a brace group that must be closed afterwards.
 */
const MARKER_RE = new RegExp(String.raw`(${CMD}\s*\{\s*)?\(\s*(?:${CMD}\s*\{?\s*)?([A-E])\s*\}?\s*\)`, 'g')
const markerFor = (letter: string) => new RegExp(String.raw`(?:${CMD}\s*\{\s*)?\(\s*(?:${CMD}\s*\{?\s*)?${letter}\s*\}?\s*\)`)

/** Remove spacing commands and wrappers that surround a choice value. */
export function cleanChoice(v: string): string {
  let s = v
  for (;;) {
    const before = s
    s = s
      .trim()
      .replace(/^(?:\\(?:qquad|quad|[ ,;:!>]|hspace\*?\{[^}]*\}|hfill|space|enspace|thinspace|medspace|thickspace|\\(?:\[[^\]]*\])?|newline|linebreak|text\{\s*\})|~|\s)+/, '')
      .replace(/(?:\\(?:qquad|quad|[ ,;:!>]|hspace\*?\{[^}]*\}|hfill|space|enspace|thinspace|medspace|thickspace|\\(?:\[[^\]]*\])?|newline|linebreak|text\{\s*\})|~|\s|&)+$/, '')
      .replace(/^\}+/, '')
    // Balance stray braces left over from splitting inside a \textbf{...} group.
    if (s.endsWith('}') && count(s, '}') > count(s, '{')) s = s.slice(0, -1)
    if (s === before) break
  }
  return s.trim()
}
const count = (s: string, ch: string) => s.split(ch).length - 1

/**
 * Split the statement into the question and the five choices. The choices are usually one math
 * segment, but are sometimes spread over several segments or partly written as plain text, so we
 * flatten everything from the first "(A)" marker onward into one LaTeX string before splitting.
 */
export function splitChoices(segs: Segment[]): { statement: Segment[]; choices: string[] | null } {
  const markerA = markerFor('A')
  const startIdx = segs.findIndex((s) => (s.t === 'math' || s.t === 'text') && markerA.test(s.v))
  if (startIdx < 0) return { statement: segs, choices: null }
  let tail = segs.slice(startIdx)
  // Diagrams placed after the choices belong to the statement; diagrams among them mean the
  // choices themselves are pictures, which we can't split.
  const markerE = markerFor('E')
  const eIdx = tail.findIndex((s) => s.t !== 'img' && markerE.test(s.v))
  const trailingImgs: Segment[] = []
  if (eIdx >= 0 && !tail.slice(0, eIdx + 1).some((s) => s.t === 'img')) {
    trailingImgs.push(...tail.slice(eIdx + 1).filter((s) => s.t === 'img'))
    tail = tail.filter((s) => s.t !== 'img')
  }
  if (tail.some((s) => s.t === 'img')) return { statement: segs, choices: null }

  // Text before "(A)" inside the starting segment stays in the statement.
  const first = tail[0] as { t: 'text' | 'math'; v: string }
  let lead: Segment | null = null
  let flat = ''
  if (first.t === 'text') {
    const i = first.v.search(markerA)
    if (first.v.slice(0, i).trim()) lead = { t: 'text', v: first.v.slice(0, i) }
    flat += textAsLatex(first.v.slice(i))
  } else {
    // Math segments that contain both question and choices are rare; only split at a clean marker.
    const i = Math.max(0, first.v.search(markerA))
    if (i > 0 && first.v.slice(0, i).replace(/\\qquad|\\quad|\\\\|\s/g, '')) {
      lead = { t: 'math', v: first.v.slice(0, i), display: false }
    }
    flat += first.v.slice(i)
  }
  for (const s of tail.slice(1)) flat += ' ' + (s.t === 'math' ? s.v : textAsLatex((s as { v: string }).v))

  const marks = [...flat.matchAll(MARKER_RE)]
  const order: { letter: string; start: number; end: number; grouped: boolean }[] = []
  let want = 0
  for (const m of marks) {
    if (m[2] === LETTERS[want]) {
      order.push({ letter: m[2], start: m.index, end: m.index + m[0].length, grouped: !!m[1] })
      want++
      if (want === 5) break
    }
  }
  if (order.length !== 5) return { statement: segs, choices: null }
  const choices = order.map((o, i) => {
    let v = flat.slice(o.end, i < 4 ? order[i + 1].start : flat.length)
    if (o.grouped) v = closeGroup(v)
    return cleanChoice(v)
  })
  if (choices.some((c) => !c)) return { statement: segs, choices: null }
  const statement = normalizeSegments([...segs.slice(0, startIdx), ...(lead ? [lead] : []), ...trailingImgs])
  return { statement, choices }
}

/** After a marker like "\textbf{(A)", the group may continue: "\textbf{(A) 14}" → "14". */
function closeGroup(v: string): string {
  let depth = 1
  for (let i = 0; i < v.length; i++) {
    if (v[i] === '\\') {
      i++
      continue
    }
    if (v[i] === '{') depth++
    else if (v[i] === '}' && --depth === 0) return v.slice(0, i) + ' ' + v.slice(i + 1)
  }
  return v
}

/** Plain text inside the choice region: keep "(A)" markers bare and wrap the words in \text{}. */
const textAsLatex = (t: string) =>
  t
    .split(/(\(\s*[A-E]\s*\))/)
    .map((part) => {
      if (/^\(\s*[A-E]\s*\)$/.test(part)) return part
      const words = part.replace(/\s+/g, ' ').trim().replace(/[{}\\]/g, '')
      return words ? `\\text{${words}}` : ' '
    })
    .join(' ')

// ---------------------------------------------------------------------------
// Answers stated in solutions, used to cross-check the answer key
// ---------------------------------------------------------------------------

/** Letters found in \boxed{...(X)...} or "answer is (X)" in one solution's LaTeX/text. */
export function boxedLetters(segs: Segment[]): Letter[] {
  const out: Letter[] = []
  for (const s of segs) {
    if (s.t === 'img') continue
    const v = s.v
    for (const m of v.matchAll(/\\boxed\s*\{/g)) {
      const inner = v.slice(m.index + m[0].length, m.index + m[0].length + 80)
      const lm = inner.match(/\(\s*([A-E])\s*\)/) ?? inner.match(/^\s*\\(?:textbf|text|mathrm)\s*\{\s*([A-E])\s*\}/)
      if (lm) out.push(lm[1] as Letter)
    }
  }
  return out
}

export function segmentsToPlainText(segs: Segment[]): string {
  return segs
    .map((s) => (s.t === 'text' ? s.v : s.t === 'math' ? (s.display ? ` $$${s.v}$$ ` : `$${s.v}$`) : ' [diagram] '))
    .join('')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
