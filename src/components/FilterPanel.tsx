import { useState } from 'react'
import { DEFAULT_FILTERS, type Filters, type Mode, type Status } from '../lib/filters.ts'
import { BANDS, type Band } from '../lib/rating.ts'
import { MAJOR_TOPICS, TOPICS } from '../lib/taxonomy.ts'
import { Chip, cx } from './ui.tsx'

const YEARS = Array.from({ length: 26 }, (_, i) => 2000 + i)
const NUMS = Array.from({ length: 25 }, (_, i) => i + 1)

function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T
  options: [T, string][]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-lg border border-slate-300 p-0.5 dark:border-slate-600">
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cx(
            'rounded-md px-2.5 py-1 text-xs font-semibold',
            value === v ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
          )}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      {children}
    </div>
  )
}

const selectCls = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800'

export function FilterPanel({ filters, onChange, count }: { filters: Filters; onChange: (f: Filters) => void; count: number }) {
  const [openTopic, setOpenTopic] = useState<string | null>(null)
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm">
          <strong className="tabular-nums">{count.toLocaleString()}</strong> problems match
        </p>
        <button type="button" className="text-xs text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => onChange({ ...DEFAULT_FILTERS, mode: filters.mode })}>
          Reset
        </button>
      </div>

      <Field label="Mode">
        <Segmented<Mode>
          label="Mode"
          value={filters.mode}
          onChange={(mode) => set({ mode })}
          options={[['random', 'Random'], ['order', 'In order'], ['recommended', 'For my rating']]}
        />
      </Field>

      <Field label="Test">
        <div className="flex flex-wrap gap-2">
          <Segmented label="Contest" value={filters.contest} onChange={(contest) => set({ contest })} options={[['both', 'Both'], ['10', 'AMC 10'], ['12', 'AMC 12']]} />
          <Segmented label="Sitting" value={filters.variant} onChange={(variant) => set({ variant })} options={[['any', 'A & B'], ['A', 'A'], ['B', 'B']]} />
        </div>
      </Field>

      <Field label="Years">
        <div className="flex items-center gap-2 text-sm">
          <select aria-label="From year" className={selectCls} value={filters.yearMin} onChange={(e) => set({ yearMin: Number(e.target.value), yearMax: Math.max(filters.yearMax, Number(e.target.value)) })}>
            {YEARS.map((y) => <option key={y}>{y}</option>)}
          </select>
          to
          <select aria-label="To year" className={selectCls} value={filters.yearMax} onChange={(e) => set({ yearMax: Number(e.target.value), yearMin: Math.min(filters.yearMin, Number(e.target.value)) })}>
            {YEARS.map((y) => <option key={y}>{y}</option>)}
          </select>
        </div>
      </Field>

      <Field label="Problem number">
        <div className="flex items-center gap-2 text-sm">
          <select aria-label="From problem number" className={selectCls} value={filters.numMin} onChange={(e) => set({ numMin: Number(e.target.value), numMax: Math.max(filters.numMax, Number(e.target.value)) })}>
            {NUMS.map((n) => <option key={n}>{n}</option>)}
          </select>
          to
          <select aria-label="To problem number" className={selectCls} value={filters.numMax} onChange={(e) => set({ numMax: Number(e.target.value), numMin: Math.min(filters.numMin, Number(e.target.value)) })}>
            {NUMS.map((n) => <option key={n}>{n}</option>)}
          </select>
        </div>
      </Field>

      <Field label="Difficulty">
        <div className="flex flex-wrap gap-1.5">
          {BANDS.map((b) => (
            <Chip key={b.id} active={filters.bands.includes(b.id)} onClick={() => set({ bands: toggle<Band>(filters.bands, b.id) })}>
              {b.label}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="Topics">
        <div className="space-y-2">
          {MAJOR_TOPICS.map((m) => {
            const subs = Object.entries(TOPICS[m].subs) as [string, string][]
            const anySub = subs.some(([s]) => filters.topics.includes(`${m}.${s}`))
            return (
              <div key={m}>
                <div className="flex items-center gap-1">
                  <Chip active={filters.topics.includes(m)} onClick={() => set({ topics: toggle(filters.topics.filter((t) => !t.startsWith(m + '.')), m) })}>
                    {TOPICS[m].label}
                  </Chip>
                  <button
                    type="button"
                    className="rounded px-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    aria-expanded={openTopic === m || anySub}
                    aria-label={`${TOPICS[m].label} subtopics`}
                    onClick={() => setOpenTopic(openTopic === m ? null : m)}
                  >
                    {openTopic === m || anySub ? '▾' : '▸'}
                  </button>
                </div>
                {(openTopic === m || anySub) && (
                  <div className="mt-1.5 ml-3 flex flex-wrap gap-1.5">
                    {subs.map(([s, label]) => {
                      const tag = `${m}.${s}`
                      return (
                        <Chip key={tag} active={filters.topics.includes(tag)} onClick={() => set({ topics: toggle(filters.topics.filter((t) => t !== m), tag) })}>
                          {label}
                        </Chip>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Field>

      <Field label="Status">
        <Segmented<Status>
          label="Status"
          value={filters.status}
          onChange={(status) => set({ status })}
          options={[['any', 'All'], ['unsolved', 'Unsolved'], ['solved', 'Solved'], ['missed', 'Missed'], ['bookmarked', '★']]}
        />
      </Field>
    </div>
  )
}
