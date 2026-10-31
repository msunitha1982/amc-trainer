import { useEffect, useMemo, useRef, useState } from 'react'
import { FilterPanel } from '../components/FilterPanel.tsx'
import { ProblemCard } from '../components/ProblemCard.tsx'
import { Button, Card, Spinner } from '../components/ui.tsx'
import { applyFilters, pickNext } from '../lib/filters.ts'
import type { Route } from '../lib/router.ts'
import { useStore } from '../lib/store.tsx'
import { MAJOR_TOPICS, type MajorTopic } from '../lib/taxonomy.ts'
import type { ProblemMeta } from '../lib/types.ts'

export function PracticePage({ route }: { route: Route }) {
  const { problems, byId, filters, setFilters, progress, live, profile, dataError } = useStore()
  const [current, setCurrent] = useState<ProblemMeta | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set())

  // "#/practice?topic=geometry" (from the profile's weakest-topic shortcut) sets the filters once.
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

  const next = (avoidCurrent = true, avoid = skipped) => {
    const p = pickNext(matching, filters.mode, {
      currentId: avoidCurrent ? current?.id : undefined,
      avoid,
      userRating: profile?.rating,
      live,
    })
    setCurrent(p)
  }

  // Pick a problem when data arrives, on a deep link (#/practice?p=<id>), or when filters change
  // and the current one no longer matches. Progress updates after a submission must not swap the
  // problem out from under the result, so this keys on the filters rather than on `matching`.
  const matchingIds = useMemo(() => new Set(matching.map((p) => p.id)), [matching])
  const filterKey = JSON.stringify(filters)
  const lastFilterKey = useRef('')
  const pParam = route.query.get('p')
  useEffect(() => {
    if (!problems.length) return
    const deep = pParam ? byId.get(pParam) : undefined
    const filtersChanged = lastFilterKey.current !== filterKey
    lastFilterKey.current = filterKey
    let pick: ProblemMeta | null | undefined
    if (deep && deep.id !== current?.id) pick = deep
    else if (!current || (filtersChanged && !matchingIds.has(current.id))) {
      pick = pickNext(matching, filters.mode, { avoid: skipped, userRating: profile?.rating, live })
    }
    if (pick !== undefined) setCurrent(pick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problems.length, filterKey, pParam])

  if (dataError) return <Card><p>Couldn't load problems: {dataError}</p></Card>
  if (!problems.length) return <Spinner label="Loading problems" />

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="lg:hidden">
          <Button variant="secondary" className="w-full" onClick={() => setShowFilters((s) => !s)}>
            {showFilters ? 'Hide filters' : `Filters · ${matching.length.toLocaleString()} problems`}
          </Button>
        </div>
        <div className={showFilters ? 'mt-3 block' : 'hidden lg:block'}>
          <Card className="!p-4">
            <FilterPanel filters={filters} onChange={setFilters} count={matching.length} />
          </Card>
        </div>
      </aside>
      <div className="min-w-0">
        {current ? (
          <ProblemCard
            key={current.id}
            meta={current}
            onNext={() => next()}
            onSkip={() => {
              const s = new Set(skipped).add(current.id)
              setSkipped(s)
              next(true, s)
            }}
          />
        ) : (
          <Card>
            <h2 className="text-lg font-bold">No problems match these filters</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Try widening the year range, difficulty or topics.</p>
            {skipped.size > 0 && (
              <Button className="mt-4" variant="secondary" onClick={() => { const s = new Set<string>(); setSkipped(s); next(false, s) }}>
                Bring back skipped problems
              </Button>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}
