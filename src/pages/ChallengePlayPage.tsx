import { useCallback, useEffect, useMemo, useState } from 'react'
import { ProblemCard } from '../components/ProblemCard.tsx'
import { Button, Card, cx, ErrorNote, Spinner } from '../components/ui.tsx'
import { href } from '../lib/router.ts'
import { useStore } from '../lib/store.tsx'
import { errorMessage, supabase } from '../lib/supabase.ts'
import { refLabel } from '../lib/types.ts'

interface Challenge {
  id: string
  title: string
  problem_ids: string[]
  creator_id: string
  created_at: string
  filters: { summary?: string }
}
interface Entry {
  user_id: string
  problem_id: string
  correct: boolean
  created_at: string
}
interface Person {
  id: string
  username: string
  avatar: string
}

export function ChallengePlayPage({ id }: { id: string }) {
  const { byId, session, problems } = useStore()
  const [ch, setCh] = useState<Challenge | null | undefined>(undefined)
  const [entries, setEntries] = useState<Entry[]>([])
  const [people, setPeople] = useState<Record<string, Person>>({})
  const [error, setError] = useState<string | null>(null)
  const [index, setIndex] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from('challenges').select('*').eq('id', id).maybeSingle()
    if (e) return setError(errorMessage(e))
    setCh((data as Challenge) ?? null)
    if (!data) return
    const { data: es } = await supabase.from('challenge_entries').select('user_id,problem_id,correct,created_at').eq('challenge_id', id).limit(5000)
    const list = (es as Entry[]) ?? []
    setEntries(list)
    const ids = [...new Set([...list.map((x) => x.user_id), (data as Challenge).creator_id])]
    const { data: ps } = await supabase.from('profiles').select('id,username,avatar').in('id', ids)
    setPeople(Object.fromEntries(((ps as Person[]) ?? []).map((p) => [p.id, p])))
  }, [id])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const me = session?.user.id
  const myDone = useMemo(() => new Set(entries.filter((e) => e.user_id === me).map((e) => e.problem_id)), [entries, me])
  const firstOpen = ch ? ch.problem_ids.findIndex((p) => !myDone.has(p)) : -1

  const board = useMemo(() => {
    if (!ch) return []
    const by = new Map<string, Map<string, boolean>>()
    for (const e of entries) {
      if (!by.has(e.user_id)) by.set(e.user_id, new Map())
      by.get(e.user_id)!.set(e.problem_id, e.correct)
    }
    return [...by.entries()]
      .map(([uid, m]) => ({ uid, m, score: [...m.values()].filter(Boolean).length, done: m.size }))
      .sort((a, b) => b.score - a.score || b.done - a.done)
  }, [entries, ch])

  if (error) return <ErrorNote>{error}</ErrorNote>
  if (ch === undefined || !problems.length) return <Spinner label="Loading challenge" />
  if (ch === null) return <Card>Challenge “{id}” not found.</Card>

  const playing = index
  const shareUrl = `${location.origin}${location.pathname}#/c/${ch.id}`
  const current = playing !== null ? byId.get(ch.problem_ids[playing]) : undefined

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">⚔️ {ch.title}</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {ch.problem_ids.length} problems{ch.filters?.summary ? ` · ${ch.filters.summary}` : ''} · by{' '}
            {people[ch.creator_id] ? <a className="underline" href={href(`u/${people[ch.creator_id].username}`)}>{people[ch.creator_id].username}</a> : '…'}
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            navigator.clipboard?.writeText(shareUrl).then(() => setCopied(true), () => setCopied(false))
            setTimeout(() => setCopied(false), 2000)
          }}
        >
          {copied ? 'Link copied ✓' : '🔗 Copy share link'}
        </Button>
      </div>

      {current && playing !== null ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Problem {playing + 1} of {ch.problem_ids.length}</p>
          <ProblemCard
            key={current.id}
            meta={current}
            challengeId={ch.id}
            onResult={() => void load()}
            onNext={() => {
              const nxt = ch.problem_ids.findIndex((p, i) => i > playing && !myDone.has(p) && p !== current.id)
              setIndex(nxt >= 0 ? nxt : null)
            }}
            nextLabel="Next in challenge"
          />
          <Button variant="ghost" onClick={() => setIndex(null)}>Back to results</Button>
        </div>
      ) : (
        <Card>
          {firstOpen >= 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p>{myDone.size === 0 ? 'Ready? Each problem counts on your first answer.' : `You've answered ${myDone.size} of ${ch.problem_ids.length}.`}</p>
              <Button onClick={() => setIndex(firstOpen)}>{myDone.size === 0 ? 'Start challenge' : 'Continue'}</Button>
            </div>
          ) : (
            <p>🎉 You've finished this challenge. Share the link and see how friends do.</p>
          )}
        </Card>
      )}

      <Card className="overflow-x-auto">
        <h2 className="mb-3 font-bold">Results</h2>
        {board.length === 0 ? (
          <p className="text-sm text-slate-500">No one has played yet.</p>
        ) : (
          <table className="text-sm">
            <thead>
              <tr>
                <th scope="col" className="pr-4 text-left">Player</th>
                {ch.problem_ids.map((pid, i) => (
                  <th key={pid} scope="col" className="px-1 text-center font-normal text-slate-500" title={byId.get(pid)?.tests.map(refLabel).join(' / ')}>
                    {i + 1}
                  </th>
                ))}
                <th scope="col" className="pl-3 text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {board.map((row) => (
                <tr key={row.uid} className={cx(row.uid === me && 'font-semibold')}>
                  <td className="whitespace-nowrap py-1 pr-4">
                    {people[row.uid] ? (
                      <a href={href(`u/${people[row.uid].username}`)} className="hover:underline">
                        {people[row.uid].avatar} {people[row.uid].username}
                      </a>
                    ) : '…'}
                  </td>
                  {ch.problem_ids.map((pid) => {
                    const v = row.m.get(pid)
                    return (
                      <td key={pid} className="px-1 text-center">
                        <span
                          className={cx(
                            'inline-flex h-6 w-6 items-center justify-center rounded',
                            v === true && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
                            v === false && 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
                            v === undefined && 'text-slate-400',
                          )}
                          aria-label={v === undefined ? 'not answered' : v ? 'correct' : 'wrong'}
                        >
                          {v === undefined ? '·' : v ? '✓' : '✗'}
                        </span>
                      </td>
                    )
                  })}
                  <td className="pl-3 text-right tabular-nums">{row.score}/{ch.problem_ids.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {(myDone.size === ch.problem_ids.length || !me) && (
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-xs text-slate-500">
            {ch.problem_ids.map((pid) => {
              const m = byId.get(pid)
              return <li key={pid}>{m ? <a className="underline" href={m.url} target="_blank" rel="noreferrer">{m.tests.map(refLabel).join(' / ')}</a> : pid}</li>
            })}
          </ol>
        )}
      </Card>
    </div>
  )
}
