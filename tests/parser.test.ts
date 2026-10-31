import { describe, expect, it } from 'vitest'
import {
  boxedLetters, cleanChoice, parseAnswerKey, parseProblemPage, parseTestPage, splitChoices, unwayback, unwrapMath, type Segment,
} from '../scripts/lib/parse-html.ts'

const img = (alt: string, cls = 'latex') =>
  `<img src="//latex.artofproblemsolving.com/a/b/c/abc.png" class="${cls}" alt="${alt.replace(/"/g, '&quot;')}" width="10" height="10" />`

const page = (body: string, canonical = 'https://artofproblemsolving.com/wiki/index.php/2023_AMC_12A_Problems/Problem_4') =>
  `<html><head><link rel="canonical" href="${canonical}"/></head><body><div class="mw-parser-output">${body}</div></body></html>`

const SHARED = page(`
<dl><dd><i>The following problem is from both the <a href="/x">2023 AMC 10A #5</a> and <a class="mw-selflink selflink">2023 AMC 12A #4</a>, so both problems redirect to this page.</i></dd></dl>
<div id="toc" class="toc"><h2>Contents</h2><ul><li>Problem</li></ul></div>
<h2><span class="mw-headline" id="Problem">Problem</span></h2>
<p>How many digits are in the base-ten representation of ${img('$8^5 \\cdot 5^{10} \\cdot 15^5$')}?
</p><p>${img('$\\textbf{(A) } 14 \\qquad\\textbf{(B) }15 \\qquad\\textbf{(C) }16 \\qquad\\textbf{(D) }17 \\qquad\\textbf{(E) } 18$')}
</p>
<h2><span class="mw-headline" id="Solution_1">Solution 1</span></h2>
<p>So the answer is ${img('$\\boxed{\\textbf{(E) } 18}$')}</p>
<h2><span class="mw-headline" id="Video_Solution">Video Solution</span></h2>
<p>${img('$\\boxed{\\textbf{(A)}}$')}</p>
<h2><span class="mw-headline" id="Solution_2">Solution 2</span></h2>
<p>Thus ${img('$\\boxed{(E)}$')}</p>`)

describe('parseProblemPage', () => {
  const p = parseProblemPage(SHARED)

  it('reads the canonical title and the shared-problem notice', () => {
    expect(p.canonicalTitle).toBe('2023 AMC 12A Problems/Problem 4')
    expect(p.sharedWith).toEqual([
      { wikiName: '2023 AMC 10A', num: 5 },
      { wikiName: '2023 AMC 12A', num: 4 },
    ])
  })

  it('keeps LaTeX from image alt text and ignores the table of contents', () => {
    const [prob] = p.problems
    expect(prob.segments[0]).toEqual({ t: 'text', v: 'How many digits are in the base-ten representation of ' })
    expect(prob.segments[1]).toMatchObject({ t: 'math', v: '8^5 \\cdot 5^{10} \\cdot 15^5', display: false })
    expect(JSON.stringify(prob.segments)).not.toContain('Contents')
  })

  it('collects written solutions but skips video solutions', () => {
    expect(p.solutions.map((s) => s.heading)).toEqual(['Solution 1', 'Solution 2'])
    expect(p.solutions.flatMap((s) => boxedLetters(s.segments))).toEqual(['E', 'E'])
  })

  it('splits off five clean answer choices', () => {
    const { statement, choices } = splitChoices(p.problems[0].segments)
    expect(choices).toEqual(['14', '15', '16', '17', '18'])
    expect(statement.at(-1)).toEqual({ t: 'text', v: '?' })
  })

  it('treats scraped markup as data: no script content leaks into text', () => {
    const evil = parseProblemPage(page('<h2><span class="mw-headline" id="Problem">Problem</span></h2><p>Hi<script>alert(1)</script> there</p>'))
    expect(evil.problems[0].segments).toEqual([{ t: 'text', v: 'Hi there' }])
  })

  it('turns asy diagrams into image segments', () => {
    const d = parseProblemPage(page(`<h2><span class="mw-headline" id="Problem">Problem</span></h2><p>See:</p><p>${img('[asy] draw((0,0)--(1,1)); [/asy]', 'latexcenter')}</p>`))
    expect(d.problems[0].segments).toEqual([
      { t: 'text', v: 'See:\n\n' },
      { t: 'img', src: 'https://latex.artofproblemsolving.com/a/b/c/abc.png', alt: 'diagram', w: 10, h: 10 },
    ])
  })
})

describe('splitChoices', () => {
  const math = (v: string): Segment => ({ t: 'math', v, display: false })
  const cases: [string, string, string[]][] = [
    ['\\textbf{(A)}', '\\textbf{(A)}\\ 1 \\qquad\\textbf{(B)}\\ 2 \\qquad\\textbf{(C)}\\ 3 \\qquad\\textbf{(D)}\\ 4 \\qquad\\textbf{(E)}\\ 5', ['1', '2', '3', '4', '5']],
    ['(\\mathrm {A})', '(\\mathrm {A}) \\ 1 \\qquad (\\mathrm {B}) \\ 2 \\qquad (\\mathrm {C})\\ 5 \\qquad (\\mathrm {D}) \\ 10 \\qquad (\\mathrm {E})\\ 20', ['1', '2', '5', '10', '20']],
    ['(\\textbf{A})', '(\\textbf{A})\\: 1.6\\qquad(\\textbf{B}) \\: 1.8\\qquad(\\textbf{C}) \\: 2.0\\qquad(\\textbf{D}) \\: 2.2\\qquad(\\textbf{E}) \\: 2.4', ['1.6', '1.8', '2.0', '2.2', '2.4']],
    ['\\mathrm{(A) \\ }', '\\mathrm{(A) \\ } \\frac{5}{3} \\pi \\qquad \\mathrm{(B) \\ } 2 \\qquad \\mathrm{(C) \\ } 3 \\qquad \\mathrm{(D) \\ } 4 \\qquad \\mathrm{(E) \\ } 5', ['\\frac{5}{3} \\pi', '2', '3', '4', '5']],
    ['\\textbf{(A) }x', '\\textbf{(A) }\\frac{1}{14} \\qquad \\textbf{(B) }\\frac{1}{12} \\qquad \\textbf{(C) }\\frac{1}{10} \\qquad \\textbf{(D) }\\frac{3}{28} \\qquad \\textbf{(E) }\\frac{1}{9}', ['\\frac{1}{14}', '\\frac{1}{12}', '\\frac{1}{10}', '\\frac{3}{28}', '\\frac{1}{9}']],
  ]
  it.each(cases)('handles %s markers', (_name, latex, expected) => {
    expect(splitChoices([{ t: 'text', v: 'Q? ' }, math(latex)]).choices).toEqual(expected)
  })

  it('handles choices split across lines and segments', () => {
    const r = splitChoices([
      { t: 'text', v: 'Q?\n\n' },
      math('\\textbf{(A)}\\ 1 \\qquad\\textbf{(B)}\\ 2 \\qquad\\textbf{(C)}\\ 3'),
      { t: 'text', v: '\n' },
      math('\\textbf{(D)}\\ 4 \\qquad\\textbf{(E)}\\ 5'),
    ])
    expect(r.choices).toEqual(['1', '2', '3', '4', '5'])
  })

  it('handles plain-text choices', () => {
    expect(splitChoices([{ t: 'text', v: 'Which? (A) red (B) blue (C) green (D) gray (E) pink' }]).choices).toEqual([
      '\\text{red}', '\\text{blue}', '\\text{green}', '\\text{gray}', '\\text{pink}',
    ])
  })

  it('moves a diagram that follows the choices into the statement', () => {
    const diagram: Segment = { t: 'img', src: 'x.png' }
    const r = splitChoices([{ t: 'text', v: 'Area? ' }, math('\\textbf{(A)}\\ 1 \\qquad\\textbf{(B)}\\ 2 \\qquad\\textbf{(C)}\\ 3 \\qquad\\textbf{(D)}\\ 4 \\qquad\\textbf{(E)}\\ 5'), diagram])
    expect(r.choices).toHaveLength(5)
    expect(r.statement.at(-1)).toEqual(diagram)
  })

  it('gives up (null) when the choices are pictures or incomplete', () => {
    expect(splitChoices([{ t: 'text', v: 'Which graph? (A)' }, { t: 'img', src: 'g.png' }]).choices).toBeNull()
    expect(splitChoices([math('\\textbf{(A)}\\ 1 \\qquad\\textbf{(B)}\\ 2')]).choices).toBeNull()
    expect(splitChoices([{ t: 'text', v: 'No choices here.' }]).choices).toBeNull()
  })
})

describe('helpers', () => {
  it('unwrapMath recognizes delimiters', () => {
    expect(unwrapMath('$x$')).toEqual({ v: 'x', display: false })
    expect(unwrapMath('$$x^2$$')).toEqual({ v: 'x^2', display: true })
    expect(unwrapMath('\\[y\\]')).toEqual({ v: 'y', display: true })
    expect(unwrapMath('\\begin{align*}a\\end{align*}').display).toBe(true)
  })

  it('cleanChoice strips spacing and stray braces', () => {
    expect(cleanChoice(' \\ 14 \\qquad ')).toBe('14')
    expect(cleanChoice('} 18}')).toBe('18')
    expect(cleanChoice('\\quad\\frac{1}{2}\\qquad\\\\')).toBe('\\frac{1}{2}')
  })

  it('unwayback strips archive URL prefixes', () => {
    expect(unwayback('//web.archive.org/web/20250101000000im_/https://latex.artofproblemsolving.com/a.png')).toBe('https://latex.artofproblemsolving.com/a.png')
    expect(unwayback('//latex.artofproblemsolving.com/a.png')).toBe('https://latex.artofproblemsolving.com/a.png')
  })

  it('boxedLetters reads several boxed styles', () => {
    const s = (v: string): Segment[] => [{ t: 'math', v, display: false }]
    expect(boxedLetters(s('\\boxed{\\textbf{(C)}\\ 12}'))).toEqual(['C'])
    expect(boxedLetters(s('\\boxed{\\text{(B) }7}'))).toEqual(['B'])
    expect(boxedLetters(s('\\boxed{\\textbf{D}}'))).toEqual(['D'])
    expect(boxedLetters(s('\\boxed{42}'))).toEqual([])
  })
})

describe('parseAnswerKey and parseTestPage', () => {
  it('reads an ordered list of letters', () => {
    const html = page(`<ol>${'ABCDE'.repeat(5).split('').map((l) => `<li>${l}</li>`).join('\n')}</ol>`)
    expect(parseAnswerKey(html).join('')).toBe('ABCDE'.repeat(5))
  })

  it('reads the older "1. E" line format', () => {
    const lines = Array.from({ length: 25 }, (_, i) => `${i + 1}. ${'ABCDE'[i % 5]}`).join('\n')
    expect(parseAnswerKey(page(`<p>${lines}</p>`)).slice(0, 3)).toEqual(['A', 'B', 'C'])
  })

  it('splits a full-test page by problem heading and drops the solution link', () => {
    const html = page(`
      <h2><span class="mw-headline" id="Problem_1">Problem 1</span></h2><p>What is ${img('$1+1$')}?</p><p><a href="/s">Solution</a></p>
      <h2><span class="mw-headline" id="Problem_2">Problem 2</span></h2><p>Second.</p>`)
    const m = parseTestPage(html)
    expect([...m.keys()]).toEqual([1, 2])
    expect(m.get(1)).toEqual([{ t: 'text', v: 'What is ' }, { t: 'math', v: '1+1', display: false, img: 'https://latex.artofproblemsolving.com/a/b/c/abc.png' }, { t: 'text', v: '?' }])
  })
})
