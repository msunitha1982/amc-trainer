import { useCallback, useEffect, useState } from 'react'
import { loadStatement } from '../lib/data.ts'
import { ratingOf } from '../lib/filters.ts'
import { reportUrl } from '../lib/report.ts'
import { useStore } from '../lib/store.tsx'
import { errorMessage, supabase, type SubmitResult } from '../lib/supabase.ts'
import { tagLabel } from '../lib/taxonomy.ts'
import { LETTERS, testLabel, type Letter, type ProblemMeta, type Statement } from '../lib/types.ts'
import { Formula, SegmentsView } from './MathText.tsx'
import { Button, cx, Difficulty, ErrorNote, linkCls, Spinner } from './ui.tsx'

interface Props {
  meta: ProblemMeta
  challengeId?: string
  onNext?: () => void
  onSkip?: () => void
  nextLabel?: string
  /** Called after every graded submission. */
  onResult?: (r: SubmitResult) => void
}

const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`

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
      if (idx >= 0 && !result?.correct) {
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
  const badgeName = (id: string) => badges.find((b) => b.id === id)?.name ?? id
  const [first, ...also] = meta.tests

  return (
    <article>
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">
            {testLabel(first.t)} <span className="text-ink-3">·</span> Problem {first.n}
          </h2>
          <p className="mt-0.5 text-sm text-ink-3">
            {also.length > 0 && <>Also {also.map((r) => `${testLabel(r.t)} #${r.n}`).join(', ')} · </>}
            <Difficulty rating={rating} />
            {meta.tp.length > 0 && <> · {meta.tp.map(tagLabel).join(', ')}</>}
            {stats && stats[1] > 0 && <> · {Math.round((100 * stats[2]) / stats[1])}% of {stats[1]} solved it</>}
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <button
            type="button"
            onClick={() => toggleBookmark(meta.id).catch((e) => setError(errorMessage(e)))}
            aria-pressed={bookmarked}
            className={cx('hover:text-ink', bookmarked ? 'text-accent' : 'text-ink-3')}
          >
            {bookmarked ? 'Bookmarked' : 'Bookmark'}
          </button>
          <div className="relative">
            <button type="button" onClick={() => setReportOpen((o) => !o)} aria-expanded={reportOpen} className="text-ink-3 hover:text-ink">
              Report
            </button>
            {reportOpen && (
              <div className="absolute right-0 z-10 mt-2 w-48 rounded-[3px] border border-line-2 bg-raised py-1">
                {(['tag', 'answer', 'display'] as const).map((k) => (
                  <a
                    key={k}
                    href={reportUrl(meta, k)}
                    target="_blank"
                    rel="noreferrer"
                    className="block px-3 py-1.5 text-ink-2 hover:bg-accent-soft hover:text-ink"
                    onClick={() => setReportOpen(false)}
                  >
                    {{ tag: 'Wrong topic', answer: 'Wrong answer', display: 'Displays incorrectly' }[k]}
                  </a>
                ))}
              </div>
            )}
          </div>
          <a href={meta.url} target="_blank" rel="noreferrer" className="text-ink-3 hover:text-ink" title="This problem on the AoPS Wiki (CC BY-SA)">
            Source
          </a>
        </div>
      </header>

      {prior && !result && (
        <p className="mt-4 text-sm text-ink-3">
          You {prior === 'solved' ? 'solved' : 'missed'} this before. Answers now are practice and don't change your rating.
        </p>
      )}

      <div className="mt-6">
        {stmt === undefined && !error && <Spinner label="Loading problem" />}
        {stmt === null && <ErrorNote>This problem's text is missing from the data files.</ErrorNote>}
        {stmt && <SegmentsView segments={stmt.s} />}
      </div>

      {stmt && (
        <fieldset className="mt-6" disabled={busy || !!result?.correct}>
          <legend className="sr-only">Answer choices</legend>
          <div className="grid overflow-hidden rounded-[3px] border border-line-2 sm:grid-cols-5">
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
                    'flex min-h-14 items-center gap-3 border-line px-4 py-3 text-left transition-colors',
                    i > 0 && 'border-t sm:border-t-0 sm:border-l',
                    graded && result.correct && 'bg-good-soft text-good',
                    graded && !result.correct && 'bg-bad-soft text-bad',
                    !graded && selected && 'bg-accent text-accent-ink',
                    !graded && !selected && 'hover:bg-accent-soft',
                  )}
                >
                  <span className="text-sm font-semibold opacity-70">{L}</span>
                  <span className="problem-text min-w-0 overflow-x-auto text-base!">{stmt.ch ? <Formula v={`\\displaystyle ${stmt.ch[i]}`} /> : null}</span>
                </button>
              )
            })}
          </div>
        </fieldset>
      )}

      {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

      {result && (
        <div role="status" className="mt-5">
          <p className={cx('font-semibold', result.correct ? 'text-good' : 'text-bad')}>
            {result.correct ? 'Correct.' : 'Not quite.'}{' '}
            {result.rated ? (
              <span className="font-normal text-ink-2">
                Rating {signed(result.rating_delta)} to <span className="tabular-nums">{Math.round(result.rating)}</span>.
              </span>
            ) : (
              <span className="font-normal text-ink-2">Practice answer, rating unchanged.</span>
            )}
          </p>
          <p className="mt-1 text-sm text-ink-2">
            {result.daily_credit && <>Daily problem done, daily streak {result.daily_streak}. </>}
            {!result.correct && 'Choose another answer to try again. '}
            {result.new_badges.length > 0 && <>New badge: {result.new_badges.map(badgeName).join(', ')}.</>}
          </p>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        {!result?.correct && (
          <Button onClick={submit} disabled={!choice || busy || !stmt}>
            {busy ? 'Checking' : 'Submit'}
          </Button>
        )}
        {result && onNext && <Button onClick={onNext}>{nextLabel}</Button>}
        {onSkip && !result?.correct && (
          <button type="button" onClick={onSkip} className="text-sm text-ink-2 hover:text-ink">
            Skip
          </button>
        )}
        {result && (
          <a href={meta.url} target="_blank" rel="noreferrer" className={cx('text-sm', linkCls)}>
            Solutions on the AoPS Wiki
          </a>
        )}
      </div>
    </article>
  )
}
