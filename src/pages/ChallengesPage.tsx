import { useEffect, useMemo, useState } from 'react'
import { Button, Card, ErrorNote } from '../components/ui.tsx'
import { applyFilters } from '../lib/filters.ts'
import { href, navigate } from '../lib/router.ts'
import { useStore } from '../lib/store.tsx'
import { errorMessage, supabase } from '../lib/supabase.ts'
import { tagLabel } from '../lib/taxonomy.ts'

interface ChallengeRow {
  id: string
  title: string
  problem_ids: string[]
  created_at: string
  creator_id: string
}

function shuffle<T>(a: T[]): T[] {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}

export function ChallengesPage() {
  const { problems, filters, session, ensureUser } = useStore()
  const [title, setTitle] = useState('')
  const [n, setN] = useState(5)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mine, setMine] = useState<ChallengeRow[]>([])
  const [played, setPlayed] = useState<ChallengeRow[]>([])

  // Challenges are shared, so status filters (which depend on who is playing) don't apply.
  const pool = useMemo(
    () => applyFilters(problems, { ...filters, status: 'any' }, { status: {}, bookmarks: new Set() }),
    [problems, filters],
  )

  const uid = session?.user.id
  useEffect(() => {
    if (!uid) return
    supabase.from('challenges').select('id,title,problem_ids,created_at,creator_id').eq('creator_id', uid).order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => setMine((data as ChallengeRow[]) ?? []))
    supabase.from('challenge_entries').select('challenge_id').eq('user_id', uid).limit(1000)
      .then(async ({ data }) => {
        const ids = [...new Set((data ?? []).map((d: { challenge_id: string }) => d.challenge_id))]
        if (!ids.length) return setPlayed([])
        const { data: cs } = await supabase.from('challenges').select('id,title,problem_ids,created_at,creator_id').in('id', ids.slice(0, 100))
        setPlayed(((cs as ChallengeRow[]) ?? []).filter((c) => c.creator_id !== uid))
      })
  }, [uid])

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      await ensureUser()
      const ids = shuffle(pool).slice(0, n).map((p) => p.id)
      const summary = [
        filters.contest === 'both' ? 'AMC 10/12' : `AMC ${filters.contest}`,
        `${filters.yearMin}–${filters.yearMax}`,
        filters.topics.length ? filters.topics.map(tagLabel).join(', ') : null,
      ].filter(Boolean).join(' · ')
      const { data, error: e } = await supabase.rpc('create_challenge', {
        p_title: title.trim() || `${n}-problem challenge`,
        p_problem_ids: ids,
        p_filters: { ...filters, summary },
      })
      if (e) throw e
      navigate(`c/${data as string}`)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const list = (rows: ChallengeRow[]) => (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {rows.map((c) => (
        <li key={c.id} className="flex items-center justify-between py-2">
          <a href={href(`c/${c.id}`)} className="font-semibold hover:underline">{c.title}</a>
          <span className="text-xs text-slate-500">{c.problem_ids.length} problems · {new Date(c.created_at).toLocaleDateString()}</span>
        </li>
      ))}
    </ul>
  )

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">⚔️ Challenges</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Build a problem set from your current Practice filters, share the link, and compare results side by side.
        </p>
      </div>
      <Card>
        <h2 className="font-bold">New challenge</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Drawing from <strong>{pool.length.toLocaleString()}</strong> problems that match your{' '}
          <a href={href('practice')} className="text-indigo-600 underline dark:text-indigo-400">Practice filters</a>.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-48 text-sm">
            <span className="mb-1 block font-semibold">Title</span>
            <input
              value={title}
              maxLength={80}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Friday geometry duel"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Problems</span>
            <select value={n} onChange={(e) => setN(Number(e.target.value))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800">
              {[3, 5, 10, 15, 25].map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <Button onClick={create} disabled={busy || pool.length < n}>{busy ? 'Creating…' : 'Create & get link'}</Button>
        </div>
        {pool.length < n && <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">Not enough matching problems. Widen your filters.</p>}
        {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
      </Card>
      {mine.length > 0 && <Card><h2 className="font-bold">Created by you</h2>{list(mine)}</Card>}
      {played.length > 0 && <Card><h2 className="font-bold">Played</h2>{list(played)}</Card>}
    </div>
  )
}
