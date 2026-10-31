import { REPO_URL } from '../config.ts'
import { tagLabel } from './taxonomy.ts'
import { refLabel, type ProblemMeta } from './types.ts'

/** Prefilled GitHub issue for a wrong topic tag or answer. No answer is included in the URL. */
export function reportUrl(p: ProblemMeta, kind: 'tag' | 'answer' | 'display'): string {
  const what = { tag: 'Wrong topic tag', answer: 'Wrong answer key', display: 'Rendering problem' }[kind]
  const title = `${what}: ${p.tests.map(refLabel).join(' / ')}`
  const body = [
    `**Problem:** ${p.tests.map(refLabel).join(' / ')} (id \`${p.id}\`)`,
    `**AoPS Wiki:** ${p.url}`,
    `**Current topics:** ${p.tp.map(tagLabel).join(', ') || 'none'}`,
    '',
    kind === 'tag'
      ? '**Suggested topics:** \n\n**Why:** '
      : kind === 'answer'
        ? '**What looks wrong:** (please describe; the answer key on the AoPS Wiki is our source)\n'
        : '**What looks wrong** (screenshot welcome): ',
  ].join('\n')
  const q = new URLSearchParams({ title, body, labels: kind === 'tag' ? 'data: topics' : 'data: problem' })
  return `${REPO_URL}/issues/new?${q.toString()}`
}
