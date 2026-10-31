import { useCallback, useEffect, useState } from 'react'
import { loadStatement } from '../lib/data.ts'
import { ratingOf } from '../lib/filters.ts'
import { reportUrl } from '../lib/report.ts'
import { useStore } from '../lib/store.tsx'
import { errorMessage, supabase, type SubmitResult } from '../lib/supabase.ts'
import { tagLabel } from '../lib/taxonomy.ts'
import { LETTERS, refLabel, type Letter, type ProblemMeta, type Statement } from '../lib/types.ts'
import { Formula, SegmentsView } from './MathText.tsx'
import { BandChip, Button, Card, Chip, cx, ErrorNote, Spinner } from './ui.tsx'

interface Props {
  meta: ProblemMeta
  challengeId?: string
  onNext?: () => void
  onSkip?: () => void
  nextLabel?: string
  /** Called after every graded submission. */
  onResult?: (r: SubmitResult) => void
}

export function ProblemCard({ meta, challengeId, onNext, onSkip, nextLabel = 'Next problem', onResult }: Props) {
  const { progress, live, badges, ensureUser, recordResult, toggleBookmark } = useStore()
  const [stmt, setStmt] = useState<Statement | null | undefined>(undefined)
  const [choice, setChoice] = useState<Letter | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reportOpen, setReportOpen] = useState(false)

  useEffect(() => {
    // Callers key this component by problem id, so state starts fresh for each problem.
    let alive = true
    loadStatement(meta.id, meta.y)
      .then((s) => alive && setStmt(s ?? null))
      .catch((e) => alive && setError(errorMessage(e)))
    return () => {
      alive = false
    }
  }, [meta.id, meta.y])

  const prior = progress.status[meta.id]
  const bookmarked = progress.bookmarks.has(meta.id)

  const submit = useCallback(async () => {
    if (!choice || busy) return
    setBusy(true)
    setError(null)
    try {
      await ensureUser()
      const { data, error: err } = await supabase.rpc('submit_answer', {
        p_problem_id: meta.id,
        p_choice: choice,
        ...(challengeId ? { p_challenge_id: challengeId } : {}),
      })
      if (err) throw err
      const r = data as SubmitResult
      setResult(r)
      recordResult(meta.id, r)
      onResult?.(r)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }, [choice, busy, ensureUser, meta.id, challengeId, recordResult, onResult])

  // Keyboard: A-E or 1-5 to choose, Enter to submit, N for next.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toUpperCase()
      const idx = LETTERS.indexOf(k as Letter) >= 0 ? LETTERS.indexOf(k as Letter) : '12345'.indexOf(k)
      if (idx >= 0 && !(result?.correct)) {
        setChoice(LETTERS[idx])
        if (result) setResult(null)
      } else if (e.key === 'Enter' && choice && !result) {
        e.preventDefault()
        void submit()
      } else if (k === 'N' && result && onNext) {
        onNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [choice, result, submit, onNext])

  const rating = ratingOf(meta, live)
  const stats = live[meta.id]
  const badgeInfo = (id: string) => badges.find((b) => b.id === id)

  return (
    <Card>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold">
            {meta.tests.map((r, i) => (
              <span key={r.t}>
                {i > 0 && <span className="mx-1 font-normal text-slate-400">/</span>}
                {refLabel(r)}
              </span>
            ))}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <BandChip rating={rating} />
            {meta.tp.map((t) => (
              <Chip key={t}>{tagLabel(t)}</Chip>
            ))}
            {stats && stats[1] > 0 && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {Math.round((100 * stats[2]) / stats[1])}% of {stats[1]} solvers got it
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => toggleBookmark(meta.id).catch((e) => setError(errorMessage(e)))}
            className="rounded-lg p-2 text-xl hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-pressed={bookmarked}
            aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this problem'}
            title={bookmarked ? 'Remove bookmark' : 'Bookmark'}
          >
            {bookmarked ? '★' : '☆'}
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setReportOpen((o) => !o)}
              className="rounded-lg p-2 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-expanded={reportOpen}
              title="Report a problem with this problem"
            >
              ⚑ <span className="sr-only sm:not-sr-only">Report</span>
            </button>
            {reportOpen && (
              <div className="absolute right-0 z-10 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-800">
                {(['tag', 'answer', 'display'] as const).map((k) => (
                  <a
                    key={k}
                    href={reportUrl(meta, k)}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700"
                    onClick={() => setReportOpen(false)}
                  >
                    {{ tag: 'Wrong topic tag', answer: 'Wrong answer', display: 'Displays incorrectly' }[k]}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {prior && !result && (
        <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          You {prior === 'solved' ? 'solved' : 'missed'} this one already, so this try is practice and won't change your rating.
        </p>
      )}

      <div className="mt-4 text-[1.05rem]">
        {stmt === undefined && !error && <Spinner label="Loading problem" />}
        {stmt === null && <ErrorNote>This problem's text is missing from the data files.</ErrorNote>}
        {stmt && <SegmentsView segments={stmt.s} />}
      </div>

      {stmt && (
        <fieldset className="mt-4" disabled={busy || !!result?.correct}>
          <legend className="sr-only">Answer choices</legend>
          <div className="grid gap-2 sm:grid-cols-5">
            {LETTERS.map((L, i) => {
              const selected = choice === L
              const graded = result && selected
              return (
                <button
                  key={L}
                  type="button"
                  onClick={() => {
                    setChoice(L)
                    if (result && !result.correct) setResult(null)
                  }}
                  aria-pressed={selected}
                  className={cx(
                    'flex min-h-12 items-center gap-2 rounded-xl border-2 px-3 py-2 text-left transition',
                    graded && result.correct && 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950',
                    graded && !result.correct && 'border-rose-500 bg-rose-50 dark:bg-rose-950',
                    !graded && selected && 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950',
                    !graded && !selected && 'border-slate-200 hover:border-indigo-300 dark:border-slate-700',
                  )}
                >
                  <span className="font-bold text-slate-500 dark:text-slate-400">({L})</span>
                  <span className="min-w-0 overflow-x-auto">{stmt.ch ? <Formula v={stmt.ch[i]} /> : null}</span>
                </button>
              )
            })}
          </div>
          {!stmt.ch && (
            <p className="mt-2 text-xs text-slate-500">The answer choices are shown in the problem text above.</p>
          )}
        </fieldset>
      )}

      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}

      {result && (
        <div
          role="status"
          className={cx(
            'mt-4 rounded-xl px-4 py-3',
            result.correct ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100' : 'bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-100',
          )}
        >
          <p className="text-lg font-bold">
            {result.correct ? '✅ Correct!' : '❌ Not quite.'}{' '}
            {result.rated ? (
              <span className="font-semibold">
                {result.rating_delta >= 0 ? '+' : ''}
                {result.rating_delta.toFixed(1)} → {Math.round(result.rating)}
              </span>
            ) : (
              <span className="text-sm font-normal">(practice, unrated)</span>
            )}
          </p>
          <p className="mt-1 text-sm">
            {result.daily_credit && <>☀️ Daily problem done. Daily streak: {result.daily_streak}. </>}
            🔥 Streak: {result.streak} day{result.streak === 1 ? '' : 's'}
          </p>
          {result.new_badges.length > 0 && (
            <p className="mt-1 text-sm font-semibold">
              New badge{result.new_badges.length > 1 ? 's' : ''}:{' '}
              {result.new_badges.map((b) => `${badgeInfo(b)?.icon ?? '🏅'} ${badgeInfo(b)?.name ?? b}`).join(', ')}
            </p>
          )}
          {!result.correct && <p className="mt-1 text-sm">Pick another choice to try again (unrated), or move on.</p>}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!result?.correct && (
          <Button onClick={submit} disabled={!choice || busy || !stmt}>
            {busy ? 'Checking…' : 'Submit'}
          </Button>
        )}
        {result && onNext && <Button onClick={onNext}>{nextLabel} →</Button>}
        {!result && onSkip && (
          <Button variant="ghost" onClick={onSkip}>
            Skip
          </Button>
        )}
        {result && !result.correct && onSkip && (
          <Button variant="ghost" onClick={onSkip}>
            Skip
          </Button>
        )}
        {result && (
          <a href={meta.url} target="_blank" rel="noreferrer" className="ml-auto text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
            Solutions on the AoPS Wiki ↗
          </a>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        Keys: A–E or 1–5 to pick, Enter to submit{onNext ? ', N for next' : ''}. Source:{' '}
        <a className="underline" href={meta.url} target="_blank" rel="noreferrer">
          AoPS Wiki
        </a>{' '}
        (CC BY-SA).
      </p>
    </Card>
  )
}
