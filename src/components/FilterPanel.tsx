/* eslint-disable react-refresh/only-export-components */
import { useState, type ReactNode } from 'react'
import { DEFAULT_FILTERS, type Filters, type Mode, type Status } from '../lib/filters.ts'
import { BANDS, type Band } from '../lib/rating.ts'
import { useStore } from '../lib/store.tsx'
import { MAJOR_TOPICS, tagLabel, TOPICS } from '../lib/taxonomy.ts'
import { cx, Segmented, Toggle } from './ui.tsx'

const NUMS = Array.from({ length: 25 }, (_, i) => i + 1)
const selectCls = 'h-8 rounded-[3px] border border-line-2 bg-raised px-2 text-sm text-ink'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 py-3 sm:grid-cols-[9rem_1fr] sm:items-start">
      <div className="pt-1.5 text-sm text-ink-3">{label}</div>
      <div>{children}</div>
    </div>
  )
}

/** One-line description of the active filters, shown when the panel is collapsed. */
export function filterSummary(f: Filters): string {
  const parts = [
    f.contest === 'both' ? 'AMC 10 and 12' : `AMC ${f.contest}`,
    `${f.yearMin}–${Math.min(f.yearMax, 2024)}`,
    f.numMin !== 1 || f.numMax !== 25 ? `problems ${f.numMin}–${f.numMax}` : null,
    f.bands.length ? f.bands.map((b) => BANDS.find((x) => x.id === b)!.label).join(', ') : null,
    f.topics.length ? f.topics.map(tagLabel).join(', ') : null,
    f.status !== 'any' ? f.status : null,
    { random: 'random order', order: 'in order', recommended: 'matched to your rating' }[f.mode],
  ]
  return parts.filter(Boolean).join(' · ')
}

export function FilterPanel({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const [openTopic, setOpenTopic] = useState<string | null>(null)
  const { problems } = useStore()
  // Only offer years that have problems (2025 isn't archived yet).
  const lastYear = problems.reduce((m, p) => Math.max(m, p.y), 2000)
  const years = Array.from({ length: lastYear - 1999 }, (_, i) => 2000 + i)
  const yearMax = Math.min(filters.yearMax, lastYear)
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  return (
    <div className="divide-y divide-line">
      <Row label="Order">
        <Segmented<Mode>
          label="Order"
          value={filters.mode}
          onChange={(mode) => set({ mode })}
          options={[['random', 'Random'], ['order', 'In order'], ['recommended', 'Matched to my rating']]}
        />
      </Row>

      <Row label="Contest">
        <Segmented label="Contest" value={filters.contest} onChange={(contest) => set({ contest })} options={[['both', 'Both'], ['10', 'AMC 10'], ['12', 'AMC 12']]} />
      </Row>

      <Row label="Years">
        <div className="flex items-center gap-2 text-sm text-ink-2">
          <select aria-label="From year" className={selectCls} value={filters.yearMin} onChange={(e) => set({ yearMin: Number(e.target.value), yearMax: Math.max(yearMax, Number(e.target.value)) })}>
            {years.map((y) => <option key={y}>{y}</option>)}
          </select>
          to
          <select aria-label="To year" className={selectCls} value={yearMax} onChange={(e) => set({ yearMax: Number(e.target.value), yearMin: Math.min(filters.yearMin, Number(e.target.value)) })}>
            {years.map((y) => <option key={y}>{y}</option>)}
          </select>
        </div>
      </Row>

      <Row label="Problem numbers">
        <div className="flex items-center gap-2 text-sm text-ink-2">
          <select aria-label="From problem number" className={selectCls} value={filters.numMin} onChange={(e) => set({ numMin: Number(e.target.value), numMax: Math.max(filters.numMax, Number(e.target.value)) })}>
            {NUMS.map((n) => <option key={n}>{n}</option>)}
          </select>
          to
          <select aria-label="To problem number" className={selectCls} value={filters.numMax} onChange={(e) => set({ numMax: Number(e.target.value), numMin: Math.min(filters.numMin, Number(e.target.value)) })}>
            {NUMS.map((n) => <option key={n}>{n}</option>)}
          </select>
        </div>
      </Row>

      <Row label="Difficulty">
        <div className="flex flex-wrap gap-1.5">
          {BANDS.map((b) => (
            <Toggle key={b.id} active={filters.bands.includes(b.id)} onClick={() => set({ bands: toggle<Band>(filters.bands, b.id) })}>
              {b.label}
            </Toggle>
          ))}
        </div>
      </Row>

      <Row label="Topics">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {MAJOR_TOPICS.map((m) => (
              <Toggle
                key={m}
                active={filters.topics.includes(m)}
                onClick={() => set({ topics: toggle(filters.topics.filter((t) => !t.startsWith(m + '.')), m) })}
              >
                {TOPICS[m].label}
              </Toggle>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span className="text-ink-3">Subtopics:</span>
            {MAJOR_TOPICS.map((m) => {
              const anySub = filters.topics.some((t) => t.startsWith(m + '.'))
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setOpenTopic(openTopic === m ? null : m)}
                  aria-expanded={openTopic === m}
                  className={cx('underline-offset-4 hover:text-ink', openTopic === m || anySub ? 'text-ink underline' : 'text-ink-3')}
                >
                  {TOPICS[m].label}
                </button>
              )
            })}
          </div>
          {openTopic && (
            <div className="flex flex-wrap gap-1.5">
              {(Object.entries(TOPICS[openTopic as keyof typeof TOPICS].subs) as [string, string][]).map(([s, label]) => {
                const tag = `${openTopic}.${s}`
                return (
                  <Toggle key={tag} active={filters.topics.includes(tag)} onClick={() => set({ topics: toggle(filters.topics.filter((t) => t !== openTopic), tag) })}>
                    {label}
                  </Toggle>
                )
              })}
            </div>
          )}
        </div>
      </Row>

      <Row label="Status">
        <Segmented<Status>
          label="Status"
          value={filters.status}
          onChange={(status) => set({ status })}
          options={[['any', 'All'], ['unsolved', 'Unsolved'], ['solved', 'Solved'], ['missed', 'Missed'], ['bookmarked', 'Bookmarked']]}
        />
      </Row>

      <div className="pt-3">
        <button type="button" className="text-sm text-ink-3 hover:text-ink" onClick={() => onChange({ ...DEFAULT_FILTERS, mode: filters.mode })}>
          Reset filters
        </button>
      </div>
    </div>
  )
}
