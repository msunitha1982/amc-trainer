/**
 * Merge classifier output (data/topics/batch-*.json) into data/topics.json, keeping only valid
 * tags (max 3, deduplicated). Manual fixes in data/topic-fixes.json win over classifier output.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ALL_TAGS } from '../src/lib/taxonomy.ts'

const ROOT = join(import.meta.dirname, '..')
const dir = join(ROOT, 'data', 'topics')
const out: Record<string, string[]> = existsSync(join(ROOT, 'data', 'topics.json'))
  ? JSON.parse(readFileSync(join(ROOT, 'data', 'topics.json'), 'utf8'))
  : {}
let invalid = 0
if (existsSync(dir)) {
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const batch = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Record<string, string[]>
    for (const [id, tags] of Object.entries(batch)) {
      const valid = [...new Set(tags.filter((t) => ALL_TAGS.includes(t)))].slice(0, 3)
      invalid += tags.length - valid.length
      if (valid.length) out[id] = valid
    }
  }
}
const fixesPath = join(ROOT, 'data', 'topic-fixes.json')
const fixes = existsSync(fixesPath) ? (JSON.parse(readFileSync(fixesPath, 'utf8')) as Record<string, string[]>) : {}
for (const [id, tags] of Object.entries(fixes)) if (!id.startsWith('_')) out[id] = tags.filter((t) => ALL_TAGS.includes(t))
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })))
writeFileSync(join(ROOT, 'data', 'topics.json'), JSON.stringify(sorted, null, 0).replace(/\],"/g, '],\n"'))
console.log(`topics: ${Object.keys(sorted).length} problems tagged; ${invalid} invalid tags dropped; ${Object.keys(fixes).filter((k) => !k.startsWith('_')).length} manual fixes`)
