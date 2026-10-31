/**
 * Step 3 of the data pipeline: download diagram images referenced by parsed problems into
 * public/diagrams/ so the site doesn't hotlink AoPS. Falls back to the Wayback copy when the
 * original host refuses. Writes data/diagrams.json (url -> local path, or null if unavailable).
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ParsedProblem } from './parse.ts'

const ROOT = join(import.meta.dirname, '..')
const OUT = join(ROOT, 'public', 'diagrams')
const MANIFEST = join(ROOT, 'data', 'diagrams.json')
const UA = 'AMCTrainerDataPipeline/1.0 (+https://github.com/msunitha1982/amc-trainer)'
const INTERVAL = 400

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function getImage(url: string): Promise<{ buf: Buffer; ext: string } | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      const type = res.headers.get('content-type') ?? ''
      if (res.ok && type.startsWith('image/')) {
        const ext = type.includes('svg') ? 'svg' : type.includes('gif') ? 'gif' : type.includes('jpeg') ? 'jpg' : 'png'
        return { buf: Buffer.from(await res.arrayBuffer()), ext }
      }
      await res.arrayBuffer().catch(() => undefined)
      if (res.status < 500) return null
    } catch {
      /* retry */
    }
    await sleep(2000 * (attempt + 1))
  }
  return null
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const { records } = JSON.parse(readFileSync(join(ROOT, 'data', 'parsed.json'), 'utf8')) as { records: ParsedProblem[] }
  const urls = new Set<string>()
  for (const r of records) for (const s of r.full) if (s.t === 'img') urls.add(s.src)
  const manifest: Record<string, string | null> = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {}
  let fetched = 0
  let failed = 0
  for (const url of urls) {
    if (manifest[url] && existsSync(join(ROOT, 'public', manifest[url]!))) continue
    const name = createHash('sha1').update(url).digest('hex').slice(0, 16)
    let img = await getImage(url)
    await sleep(INTERVAL)
    if (!img) {
      img = await getImage(`https://web.archive.org/web/2026im_/${url}`)
      await sleep(INTERVAL)
    }
    if (!img) {
      manifest[url] = null
      failed++
      console.warn(`  unavailable: ${url}`)
      continue
    }
    const rel = `diagrams/${name}.${img.ext}`
    writeFileSync(join(ROOT, 'public', rel), img.buf)
    manifest[url] = rel
    fetched++
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1))
  console.log(`diagrams: ${urls.size} referenced, ${fetched} downloaded now, ${failed} unavailable`)
}

await main()
