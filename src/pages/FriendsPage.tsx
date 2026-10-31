import { useEffect, useState } from 'react'
import { Button, Card, cx, Spinner } from '../components/ui.tsx'
import { href, type Route } from '../lib/router.ts'
import { useStore } from '../lib/store.tsx'
import { supabase } from '../lib/supabase.ts'
import { liveStreak } from '../lib/time.ts'

interface Mini {
  id: string
  username: string
  avatar: string
  rating: number
  solved_count: number
  current_streak: number
  last_active_day: string | null
}
const COLS = 'id,username,avatar,rating,solved_count,current_streak,last_active_day'

function PeopleList({ people, empty }: { people: Mini[] | null; empty: string }) {
  if (!people) return <Spinner />
  if (!people.length) return <p className="py-3 text-sm text-slate-500">{empty}</p>
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {people.map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-3 py-2">
          <a href={href(`u/${p.username}`)} className="flex items-center gap-2 font-semibold hover:underline">
            <span aria-hidden className="text-xl">{p.avatar}</span>
            {p.username}
          </a>
          <span className="text-sm tabular-nums text-slate-600 dark:text-slate-400">
            {Math.round(p.rating)} · {p.solved_count} solved · 🔥{liveStreak(p.current_streak, p.last_active_day)}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function FriendsPage({ route }: { route: Route }) {
  const { session, profile } = useStore()
  const target = route.query.get('u') ?? profile?.username ?? null
  const [tab, setTab] = useState<'following' | 'followers'>((route.query.get('tab') as 'followers') ?? 'following')
  const [list, setList] = useState<Mini[] | null>(null)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Mini[] | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!target) return alive && setList([])
      setList(null)
      const { data: who } = await supabase.from('profiles').select('id').eq('username', target).maybeSingle()
      if (!who) return alive && setList([])
      const [col, other] = tab === 'following' ? ['follower_id', 'followee_id'] : ['followee_id', 'follower_id']
      const { data: rows } = await supabase.from('follows').select(other).eq(col, who.id).limit(500)
      const ids = ((rows ?? []) as unknown as Record<string, string>[]).map((r) => r[other])
      if (!ids.length) return alive && setList([])
      const { data: ps } = await supabase.from('profiles').select(COLS).in('id', ids).order('rating', { ascending: false })
      if (alive) setList((ps as Mini[]) ?? [])
    })()
    return () => {
      alive = false
    }
  }, [target, tab])

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) return
    const t = setTimeout(async () => {
      const safe = term.replace(/[%_\\]/g, '')
      const { data } = await supabase.from('profiles').select(COLS).ilike('username', `${safe}%`).order('rating', { ascending: false }).limit(20)
      setResults((data as Mini[]) ?? [])
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  const mine = !route.query.get('u') || route.query.get('u') === profile?.username

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">👥 Friends</h1>
      <Card>
        <label className="block text-sm font-semibold" htmlFor="user-search">Find players</label>
        <input
          id="user-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by username"
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
        />
        {results && q.trim().length >= 2 && <div className="mt-2"><PeopleList people={results} empty="No players found." /></div>}
      </Card>
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold">{mine ? 'You' : target}</h2>
          <div role="tablist" className="flex gap-1">
            {(['following', 'followers'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={cx('rounded-md px-3 py-1 text-sm font-semibold', tab === t ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800')}>
                {t === 'following' ? 'Following' : 'Followers'}
              </button>
            ))}
          </div>
        </div>
        {!session && mine ? (
          <p className="py-3 text-sm text-slate-500">Answer a problem or <a className="underline" href={href('account')}>sign in</a> to follow friends.</p>
        ) : (
          <PeopleList people={list} empty={tab === 'following' ? 'Not following anyone yet. Search above, then hit Follow on their profile.' : 'No followers yet. Share a challenge!'} />
        )}
        {mine && session && <div className="mt-3"><Button variant="secondary" onClick={() => (location.hash = href('challenges'))}>Challenge your friends →</Button></div>}
      </Card>
    </div>
  )
}
