import type { DataIndex, Statement } from './types.ts'

const base = import.meta.env.BASE_URL

let indexPromise: Promise<DataIndex> | null = null
export function loadIndex(): Promise<DataIndex> {
  indexPromise ??= fetch(`${base}data/index.json`).then((r) => {
    if (!r.ok) throw new Error(`Could not load problem index (${r.status})`)
    return r.json() as Promise<DataIndex>
  })
  return indexPromise
}

const yearCache = new Map<number, Promise<Record<string, Statement>>>()
export function loadStatement(id: string, year: number): Promise<Statement | undefined> {
  let p = yearCache.get(year)
  if (!p) {
    p = fetch(`${base}data/statements/${year}.json`).then((r) => {
      if (!r.ok) throw new Error(`Could not load ${year} problems (${r.status})`)
      return r.json() as Promise<Record<string, Statement>>
    })
    p.catch(() => yearCache.delete(year))
    yearCache.set(year, p)
  }
  return p.then((m) => m[id])
}

/** Resolve a diagram path from the data files to a URL. */
export const assetUrl = (src: string) => (/^https?:/.test(src) ? src : `${base}${src}`)
