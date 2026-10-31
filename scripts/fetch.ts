/**
 * Step 1 of the data pipeline: download raw AoPS Wiki pages into data/cache/.
 *
 * Source order:
 *   1. The AoPS Wiki MediaWiki API (action=parse). As of 2026-10 this is behind a
 *      Cloudflare bot challenge, so we probe it once and fall back if blocked.
 *      We never try to bypass the challenge.
 *   2. The Internet Archive's Wayback Machine copy of the rendered wiki page.
 *
 * Polite by design: custom User-Agent, a small worker pool sharing one global rate cap
 * (default 4 workers, at most one request start per 300 ms), a global pause on 429/5xx with
 * exponential backoff, and an on-disk cache so re-runs only fetch what is missing.
 *
 * Usage: tsx scripts/fetch.ts [--from 2000] [--to 2025] [--only 2023-10A] [--refresh]
 * Env:   FETCH_CONCURRENCY (default 4), FETCH_INTERVAL_MS (default 300)
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib'
import https from 'node:https'
import { allTests, answerKeyTitle, problemTitle, testPageTitle, wikiUrl, PROBLEMS_PER_TEST, type TestDef } from './lib/tests.ts'

const CACHE_DIR = join(import.meta.dirname, '..', 'data', 'cache')
const USER_AGENT =
  'AMCTrainerDataPipeline/1.0 (+https://github.com/msunitha1982/amc-trainer; non-commercial practice site; polite, cached, throttled)'
const MIN_INTERVAL_MS = Number(process.env.FETCH_INTERVAL_MS ?? 300)
const CONCURRENCY = Math.max(1, Number(process.env.FETCH_CONCURRENCY ?? 4))

const args = process.argv.slice(2)
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const REFRESH = args.includes('--refresh')

export interface CacheMeta {
  title: string
  source: 'mediawiki-api' | 'wayback'
  url: string
  /** Wayback capture timestamp (YYYYMMDDhhmmss) when source is wayback. */
  snapshot?: string
  fetchedAt: string
  status: 'ok' | 'missing'
}

export const cacheKey = (title: string) => title.replace(/[^A-Za-z0-9]+/g, '_')

/** Earliest time the next request may start; shared by all workers. */
let nextSlot = 0
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function takeSlot() {
  const now = Date.now()
  const slot = Math.max(now, nextSlot)
  nextSlot = slot + MIN_INTERVAL_MS
  if (slot > now) await sleep(slot - now)
}

/** Back off every worker at once, not just the one that got the 429. */
function pauseAll(ms: number) {
  nextSlot = Math.max(nextSlot, Date.now() + ms)
}

interface FetchResult {
  ok: boolean
  status: number
  url: string
  headers: Headers
  text: string
}

/**
 * Raw HTTPS GET that follows redirects and decodes the body ourselves: Wayback sometimes labels
 * replayed bodies as gzip when they are not, which makes fetch() throw.
 */
function rawGet(url: string, hops = 0): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip' }, timeout: 60_000 }, (res) => {
      const status = res.statusCode ?? 0
      const location = res.headers.location
      if (status >= 300 && status < 400 && location && hops < 8) {
        res.resume()
        resolve(rawGet(new URL(location, url).toString(), hops + 1))
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        const headers = new Headers()
        for (const [k, v] of Object.entries(res.headers)) if (typeof v === 'string') headers.set(k, v)
        resolve({ ok: status >= 200 && status < 300, status, url, headers, text: decodeBody(Buffer.concat(chunks)) })
      })
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
  })
}

function decodeBody(buf: Buffer): string {
  // Decide by the bytes, not the Content-Encoding header.
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    try {
      return decodeBody(gunzipSync(buf))
    } catch {
      /* fall through */
    }
  }
  for (const f of [inflateSync, brotliDecompressSync]) {
    if (buf.subarray(0, 512).toString('latin1').includes('<')) break
    try {
      return f(buf).toString('utf8')
    } catch {
      /* not this encoding */
    }
  }
  return buf.toString('utf8')
}

/** Throttled GET with retries on network errors and 429/5xx. */
async function politeFetch(url: string, attempt = 0): Promise<FetchResult> {
  await takeSlot()
  try {
    const res = await rawGet(url)
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      const retryAfter = Number(res.headers.get('retry-after')) || 2 ** attempt * 5
      console.warn(`  ${res.status} from ${new URL(url).host}; pausing all workers ${retryAfter}s`)
      pauseAll(retryAfter * 1000)
      return politeFetch(url, attempt + 1)
    }
    return res
  } catch (err) {
    if (attempt >= 5) throw err
    console.warn(`  ${(err as Error).message} for ${url}; retrying`)
    await sleep(2 ** attempt * 4000)
    return politeFetch(url, attempt + 1)
  }
}

const isChallengePage = (html: string) =>
  html.includes('<title>Just a moment...</title>') || html.includes('challenges.cloudflare.com')
const isWikiArticle = (html: string) => html.includes('mw-parser-output')

async function probeMediaWikiApi(): Promise<boolean> {
  const url = 'https://artofproblemsolving.com/wiki/api.php?action=query&meta=siteinfo&format=json'
  try {
    const res = await politeFetch(url)
    return res.ok && res.text.trimStart().startsWith('{')
  } catch {
    return false
  }
}

async function fetchViaApi(title: string): Promise<{ html: string; url: string } | null> {
  const url = `https://artofproblemsolving.com/wiki/api.php?action=parse&format=json&formatversion=2&redirects=1&prop=text|displaytitle&page=${encodeURIComponent(title)}`
  const res = await politeFetch(url)
  if (!res.ok) return null
  const json = JSON.parse(res.text) as { parse?: { text: string; title: string } }
  if (!json.parse) return null
  // Wrap so the parser sees the same markers as a full rendered page.
  const canonical = wikiUrl(json.parse.title)
  return { html: `<link rel="canonical" href="${canonical}"/><div class="mw-parser-output">${json.parse.text}</div>`, url }
}

async function fetchViaWayback(title: string): Promise<{ html: string; url: string; snapshot: string } | null> {
  const target = wikiUrl(title)
  // "2026" asks for the capture closest to now, i.e. the most recent one.
  const res = await politeFetch(`https://web.archive.org/web/2026id_/${target}`)
  if (res.ok) {
    const html = res.text
    const snapshot = res.url.match(/\/web\/(\d{14})/)?.[1] ?? ''
    if (isWikiArticle(html) && !isChallengePage(html)) return { html, url: res.url, snapshot }
  }
  // Latest capture missing or unusable (e.g. an archived Cloudflare page): walk older captures via CDX.
  const cdx = await politeFetch(
    `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(target)}&output=json&filter=statuscode:200&fl=timestamp&collapse=digest`,
  )
  if (!cdx.ok) return null
  const rows = JSON.parse(cdx.text || '[]') as string[][]
  const stamps = rows.slice(1).map((r) => r[0]).reverse().slice(0, 4)
  for (const ts of stamps) {
    const r = await politeFetch(`https://web.archive.org/web/${ts}id_/${target}`)
    if (!r.ok) continue
    const html = r.text
    if (isWikiArticle(html) && !isChallengePage(html)) return { html, url: r.url, snapshot: ts }
  }
  return null
}

let useApi = false

async function fetchTitle(title: string): Promise<CacheMeta> {
  const key = cacheKey(title)
  const metaPath = join(CACHE_DIR, `${key}.json`)
  if (!REFRESH && existsSync(metaPath)) return JSON.parse(readFileSync(metaPath, 'utf8')) as CacheMeta
  const fetchedAt = new Date().toISOString()
  let meta: CacheMeta
  const api = useApi ? await fetchViaApi(title) : null
  if (api) {
    writeFileSync(join(CACHE_DIR, `${key}.html`), api.html)
    meta = { title, source: 'mediawiki-api', url: api.url, fetchedAt, status: 'ok' }
  } else {
    const wb = await fetchViaWayback(title)
    if (wb) {
      writeFileSync(join(CACHE_DIR, `${key}.html`), wb.html)
      meta = { title, source: 'wayback', url: wb.url, snapshot: wb.snapshot, fetchedAt, status: 'ok' }
    } else {
      meta = { title, source: 'wayback', url: wikiUrl(title), fetchedAt, status: 'missing' }
    }
  }
  writeFileSync(metaPath, JSON.stringify(meta, null, 2))
  return meta
}

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true })
  const only = arg('only')
  const tests: TestDef[] = allTests(Number(arg('from') ?? 2000), Number(arg('to') ?? 2025)).filter(
    (t) => !only || t.id === only,
  )
  useApi = await probeMediaWikiApi()
  console.log(`MediaWiki API ${useApi ? 'reachable: using it' : 'blocked or unreachable: using the Wayback Machine'}`)

  // Answer keys and full-test pages first (small, and enough to start parsing), then per-problem pages.
  const titles = [
    ...tests.flatMap((t) => [answerKeyTitle(t), testPageTitle(t)]),
    ...tests.flatMap((t) => Array.from({ length: PROBLEMS_PER_TEST }, (_, i) => problemTitle(t, i + 1))),
  ]
  let done = 0
  let missing = 0
  let next = 0
  const started = Date.now()
  const worker = async () => {
    while (next < titles.length) {
      const title = titles[next++]
      let meta: CacheMeta
      try {
        meta = await fetchTitle(title)
      } catch (err) {
        console.warn(`  error: ${title}: ${(err as Error).message}`)
        meta = { title, source: 'wayback', url: wikiUrl(title), fetchedAt: new Date().toISOString(), status: 'missing' }
      }
      done++
      if (meta.status === 'missing') {
        missing++
        console.warn(`  missing: ${title}`)
      }
      if (done % 25 === 0 || done === titles.length) {
        const mins = ((Date.now() - started) / 60000).toFixed(1)
        console.log(`[${done}/${titles.length}] ${title} (missing so far: ${missing}, ${mins} min)`)
      }
    }
  }
  console.log(`Fetching ${titles.length} pages with ${CONCURRENCY} workers, ≥${MIN_INTERVAL_MS} ms between request starts`)
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  console.log(`Done. ${titles.length - missing} cached, ${missing} missing.`)
}

await main()
