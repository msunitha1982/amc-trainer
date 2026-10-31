import { useEffect, useMemo, useRef, useState } from 'react'
import { FilterPanel, filterSummary } from '../components/FilterPanel.tsx'
import { ProblemCard } from '../components/ProblemCard.tsx'
import { Button, Spinner } from '../components/ui.tsx'
import { applyFilters, pickNext } from '../lib/filters.ts'
import type { Route } from '../lib/router.ts'
import { useStore } from '../lib/store.tsx'
import { MAJOR_TOPICS, type MajorTopic } from '../lib/taxonomy.ts'
import type { ProblemMeta } from '../lib/types.ts'

// The problem on screen survives reloads and navigation, so refreshing can't reroll a hard one.
const CURRENT_KEY = 'amc.current'
const FILTERS_OPEN_KEY = 'amc.filtersOpen'
const readKey = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const writeKey = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* storage unavailable */
  }
}

export function PracticePage({ route }: { route: Route }) {
  const { problems, byId, filters, setFilters, progress, live, profile, dataError } = useStore()
  const [current, setCurrentState] = useState<ProblemMeta | null>(null)
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set())
  const [filtersOpen, setFiltersOpen] = useState(() => readKey(FILTERS_OPEN_KEY) === '1')

  const setCurrent = (p: ProblemMeta | null) => {
    setCurrentState(p)
    writeKey(CURRENT_KEY, p?.id ?? '')
  }

  // "#/practice?topic=geometry" (from the profile's weakest-topic link) sets the filters once.
  const topicParam = route.query.get('topic')
  useEffect(() => {
    if (topicParam && MAJOR_TOPICS.includes(topicParam as MajorTopic)) {
      setFilters({ ...filters, topics: [topicParam], status: 'unsolved', mode: 'recommended' })
      window.history.replaceState(null, '', '#/practice')
    }
    // Run only when the query changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicParam])

  const matching = useMemo(() => applyFilters(problems, filters, progress, live), [problems, filters, progress, live])
  const matchingIds = useMemo(() => new Set(matching.map((p) => p.id)), [matching])

  const next = (avoid = skipped) =>
    setCurrent(pickNext(matching, filters.mode, { currentId: current?.id, avoid, userRating: profile?.rating, live }))

  // Choose the problem: a deep link (#/practice?p=<id>) wins, then the saved problem, then a new
  // pick. Afterwards, only a filter change that excludes the current problem replaces it; progress
  // updates after an answer must not swap the problem out from under its result.
  const filterKey = JSON.stringify(filters)
  const lastFilterKey = useRef<string | null>(null)
  const pParam = route.query.get('p')
  /* eslint-disable react-hooks/set-state-in-effect -- syncs from the route and saved storage */
  useEffect(() => {
    if (!problems.length) return
    const firstRun = lastFilterKey.current === null
    const filtersChanged = !firstRun && lastFilterKey.current !== filterKey
    lastFilterKey.current = filterKey
    const deep = pParam ? byId.get(pParam) : undefined
    if (deep) {
      if (deep.id !== current?.id) setCurrent(deep)
      return
    }
    if (firstRun) {
      const saved = byId.get(readKey(CURRENT_KEY) ?? '')
      setCurrent(saved ?? pickNext(matching, filters.mode, { avoid: skipped, userRating: profile?.rating, live }))
      return
    }
    if (!current || (filtersChanged && !matchingIds.has(current.id))) {
      setCurrent(pickNext(matching, filters.mode, { avoid: skipped, userRating: profile?.rating, live }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problems.length, filterKey, pParam])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (dataError) return <p className="text-bad">Couldn't load problems: {dataError}</p>
  if (!problems.length) return <Spinner label="Loading problems" />

  return (
    <div className="mx-auto max-w-3xl">
      {current ? (
        <ProblemCard
          key={current.id}
          meta={current}
          onNext={() => next()}
          onSkip={() => {
            const s = new Set(skipped).add(current.id)
            setSkipped(s)
            next(s)
          }}
        />
      ) : (
        <div className="py-10">
          <h2 className="text-lg font-semibold">No problems match these filters</h2>
          <p className="mt-1 text-sm text-ink-2">Widen the years, difficulty or topics below.</p>
          {skipped.size > 0 && (
            <Button className="mt-4" variant="secondary" onClick={() => { const s = new Set<string>(); setSkipped(s); next(s) }}>
              Bring back skipped problems
            </Button>
          )}
        </div>
      )}

      <section className="mt-14 border-t border-line pt-4">
        <button
          type="button"
          aria-expanded={filtersOpen}
          aria-controls="filters"
          onClick={() => {
            setFiltersOpen(!filtersOpen)
            writeKey(FILTERS_OPEN_KEY, filtersOpen ? '0' : '1')
          }}
          className="flex w-full items-baseline justify-between gap-4 text-left"
        >
          <span>
            <span className="font-semibold">Filters</span>
            <span className="ml-3 text-sm text-ink-3 tabular-nums">{matching.length.toLocaleString()} problems</span>
          </span>
          <span className="text-sm text-ink-3">{filtersOpen ? 'Hide' : 'Show'}</span>
        </button>
        {!filtersOpen && <p className="mt-1 text-sm text-ink-3">{filterSummary(filters)}</p>}
        {filtersOpen && (
          <div id="filters" className="mt-2">
            <FilterPanel filters={filters} onChange={setFilters} />
          </div>
        )}
      </section>
    </div>
  )
}
