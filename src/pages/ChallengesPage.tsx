import { useEffect, useMemo, useState } from 'react'
import { Button, ErrorNote, inputCls, linkCls, PageTitle, Section } from '../components/ui.tsx'
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
    <ul className="divide-y divide-line">
      {rows.map((c) => (
        <li key={c.id} className="flex items-baseline justify-between gap-4 py-2.5">
          <a href={href(`c/${c.id}`)} className="hover:underline">{c.title}</a>
          <span className="text-sm text-ink-3">{c.problem_ids.length} problems · {new Date(c.created_at).toLocaleDateString()}</span>
        </li>
      ))}
    </ul>
  )

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <PageTitle sub="Pick problems from your practice filters, share the link, compare results.">Challenges</PageTitle>
      <section>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-48 flex-1 text-sm">
            <span className="mb-1.5 block text-ink-3">Title</span>
            <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Friday geometry" className={inputCls} />
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block text-ink-3">Problems</span>
            <select value={n} onChange={(e) => setN(Number(e.target.value))} className={inputCls + ' w-24'}>
              {[3, 5, 10, 15, 25].map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <Button onClick={create} disabled={busy || pool.length < n}>{busy ? 'Creating' : 'Create challenge'}</Button>
        </div>
        <p className="mt-3 text-sm text-ink-3">
          {pool.length < n ? 'Not enough matching problems. ' : `Drawn from ${pool.length.toLocaleString()} problems matching your `}
          <a href={href('practice')} className={linkCls}>practice filters</a>.
        </p>
        {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
      </section>
      {mine.length > 0 && <Section title="Created by you">{list(mine)}</Section>}
      {played.length > 0 && <Section title="Played">{list(played)}</Section>}
    </div>
  )
}
