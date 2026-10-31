import { useCallback, useEffect, useMemo, useState } from 'react'
import { ProblemCard } from '../components/ProblemCard.tsx'
import { Avatar, Button, cx, ErrorNote, PageTitle, Section, Spinner } from '../components/ui.tsx'
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
  if (ch === null) return <p className="text-ink-2">Challenge “{id}” not found.</p>

  const playing = index
  const shareUrl = `${location.origin}${location.pathname}#/c/${ch.id}`
  const current = playing !== null ? byId.get(ch.problem_ids[playing]) : undefined

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageTitle
          sub={
            <>
              {ch.problem_ids.length} problems{ch.filters?.summary ? ` · ${ch.filters.summary}` : ''} · by{' '}
              {people[ch.creator_id] ? <a className="hover:underline" href={href(`u/${people[ch.creator_id].username}`)}>{people[ch.creator_id].username}</a> : '…'}
            </>
          }
        >
          {ch.title}
        </PageTitle>
        <Button
          variant="secondary"
          onClick={() => {
            navigator.clipboard?.writeText(shareUrl).then(() => setCopied(true), () => setCopied(false))
            setTimeout(() => setCopied(false), 2000)
          }}
        >
          {copied ? 'Link copied' : 'Copy link'}
        </Button>
      </div>

      {current && playing !== null ? (
        <div>
          <p className="mb-6 text-sm text-ink-3">Problem {playing + 1} of {ch.problem_ids.length} · <button type="button" className="hover:text-ink" onClick={() => setIndex(null)}>Back to results</button></p>
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
        </div>
      ) : firstOpen >= 0 ? (
        <div className="flex flex-wrap items-center gap-4">
          <Button onClick={() => setIndex(firstOpen)}>{myDone.size === 0 ? 'Start' : 'Continue'}</Button>
          <span className="text-sm text-ink-2">
            {myDone.size === 0 ? 'Only your first answer to each problem counts.' : `${myDone.size} of ${ch.problem_ids.length} answered.`}
          </span>
        </div>
      ) : (
        <p className="text-ink-2">You've finished this challenge.</p>
      )}

      <Section title="Results">
        {board.length === 0 ? (
          <p className="text-sm text-ink-3">No one has played yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr className="text-ink-3">
                  <th scope="col" className="pb-2 pr-6 text-left font-normal">Player</th>
                  {ch.problem_ids.map((pid, i) => (
                    <th key={pid} scope="col" className="w-7 pb-2 text-center font-normal" title={byId.get(pid)?.tests.map(refLabel).join(' / ')}>
                      {i + 1}
                    </th>
                  ))}
                  <th scope="col" className="pb-2 pl-4 text-right font-normal">Score</th>
                </tr>
              </thead>
              <tbody>
                {board.map((row) => (
                  <tr key={row.uid} className={cx('border-t border-line', row.uid === me && 'font-semibold')}>
                    <td className="whitespace-nowrap py-2 pr-6">
                      {people[row.uid] ? (
                        <a href={href(`u/${people[row.uid].username}`)} className="inline-flex items-center gap-2 hover:underline">
                          <Avatar name={people[row.uid].username} color={people[row.uid].avatar} size={20} />
                          {people[row.uid].username}
                        </a>
                      ) : '…'}
                    </td>
                    {ch.problem_ids.map((pid) => {
                      const v = row.m.get(pid)
                      return (
                        <td key={pid} className="py-2 text-center">
                          <span
                            className={cx(
                              'inline-block h-4 w-4 rounded-[2px] align-middle',
                              v === true && 'bg-good',
                              v === false && 'bg-bad opacity-70',
                              v === undefined && 'border border-line-2',
                            )}
                            title={v === undefined ? 'Not answered' : v ? 'Correct' : 'Wrong'}
                          />
                          <span className="sr-only">{v === undefined ? 'not answered' : v ? 'correct' : 'wrong'}</span>
                        </td>
                      )
                    })}
                    <td className="py-2 pl-4 text-right tabular-nums">{row.score}/{ch.problem_ids.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(myDone.size === ch.problem_ids.length || !me) && (
          <ol className="mt-6 list-decimal space-y-1 pl-5 text-sm text-ink-3">
            {ch.problem_ids.map((pid) => {
              const m = byId.get(pid)
              return <li key={pid}>{m ? <a className="hover:underline" href={m.url} target="_blank" rel="noreferrer">{m.tests.map(refLabel).join(' / ')}</a> : pid}</li>
            })}
          </ol>
        )}
      </Section>
    </div>
  )
}
