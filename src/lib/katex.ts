/**
 * KaTeX settings shared by the app and the build script that test-renders every formula.
 * `trust: false` means scraped LaTeX can never inject links, classes or raw HTML.
 */
import type { KatexOptions } from 'katex'

export const KATEX_MACROS: Record<string, string> = {
  '\\overarc': '\\overset{\\frown}{#1}',
  '\\arc': '\\overset{\\frown}{#1}',
  '\\degree': '^\\circ',
  '\\textdegree': '^\\circ',
  '\\emph': '\\textit{#1}',
  '\\textsc': '\\text{#1}',
  '\\textdollar': '\\$',
  '\\dollar': '\\$',
  '\\textendash': '\\text{–}',
  '\\textemdash': '\\text{—}',
  '\\hfill': '\\quad',
  '\\R': '\\mathbb{R}',
  '\\Z': '\\mathbb{Z}',
  '\\N': '\\mathbb{N}',
  '\\Q': '\\mathbb{Q}',
  '\\C': '\\mathbb{C}',
  '\\textless': '<',
  '\\textgreater': '>',
  '\\ensuremath': '#1',
  '\\mathdollar': '\\$',
  '\\cent': '\\text{¢}',
  '\\hdots': '\\dots',
}

export const katexOptions = (displayMode: boolean): KatexOptions => ({
  displayMode,
  macros: { ...KATEX_MACROS },
  trust: false,
  strict: 'ignore',
  throwOnError: true,
  output: 'htmlAndMathml',
})

/** Normalize AoPS-isms that KaTeX doesn't support, without changing meaning. */
export function normalizeLatex(src: string): string {
  return src
    .replace(/\\(?:vspace|vskip)\*?\s*\{[^}]*\}/g, '')
    .replace(/\\(?:noindent|par|centering|medskip|bigskip|smallskip|newpage|indent)\b/g, ' ')
    .replace(/\\(?:allowbreak)\b/g, ' ')
    // A bare $ inside math is a dollar sign (AoPS renders it literally); KaTeX needs \$.
    .replace(/(^|[^\\])\$/g, '$1\\$')
    .replace(/\\(begin|end)\{tabular\}/g, '\\$1{array}')
    .replace(/\\begin\{eqnarray\*?\}/g, '\\begin{array}{rcl}')
    .replace(/\\end\{eqnarray\*?\}/g, '\\end{array}')
    .replace(/\\begin\{array\}\s*\[[tbc]\]/g, '\\begin{array}')
    .trim()
}
