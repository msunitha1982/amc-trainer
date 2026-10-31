import { useEffect, useState } from 'react'
import { Avatar, cx, inputCls, linkCls, PageTitle, Section, Spinner } from '../components/ui.tsx'
import { href, type Route } from '../lib/router.ts'
import { useStore } from '../lib/store.tsx'
import { avatarSrc, supabase } from '../lib/supabase.ts'
import { liveStreak } from '../lib/time.ts'

interface Mini {
  id: string
  username: string
  avatar: string
  avatar_url: string | null
  rating: number
  solved_count: number
  current_streak: number
  last_active_day: string | null
}
const COLS = 'id,username,avatar,avatar_url,rating,solved_count,current_streak,last_active_day'

function PeopleList({ people, empty }: { people: Mini[] | null; empty: string }) {
  if (!people) return <Spinner />
  if (!people.length) return <p className="py-3 text-sm text-ink-3">{empty}</p>
  return (
    <ul className="divide-y divide-line">
      {people.map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
          <a href={href(`u/${p.username}`)} className="flex items-center gap-2.5 hover:underline">
            <Avatar name={p.username} color={p.avatar} url={avatarSrc(p.avatar_url)} size={24} />
            {p.username}
          </a>
          <span className="text-sm tabular-nums text-ink-3">
            {Math.round(p.rating)} · {p.solved_count} solved · streak {liveStreak(p.current_streak, p.last_active_day)}
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
    <div className="mx-auto max-w-3xl space-y-10">
      <PageTitle>Friends</PageTitle>
      <section>
        <label className="block text-sm text-ink-3" htmlFor="user-search">Find players</label>
        <input id="user-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Username" className={cx(inputCls, 'mt-1.5 max-w-sm')} />
        {results && q.trim().length >= 2 && <div className="mt-3"><PeopleList people={results} empty="No players found." /></div>}
      </section>
      <Section title={mine ? undefined : target}>
        <div role="tablist" className="mb-4 flex gap-6 border-b border-line">
          {(['following', 'followers'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={cx('-mb-px border-b-2 pb-2 text-sm', tab === t ? 'border-accent text-ink' : 'border-transparent text-ink-3 hover:text-ink')}>
              {t === 'following' ? 'Following' : 'Followers'}
            </button>
          ))}
        </div>
        {!session && mine ? (
          <p className="py-3 text-sm text-ink-3">Answer a problem or <a className={linkCls} href={href('account')}>sign in</a> to follow players.</p>
        ) : (
          <PeopleList people={list} empty={tab === 'following' ? 'Not following anyone yet. Find a player above and follow them from their profile.' : 'No followers yet.'} />
        )}
        {mine && session && <p className="mt-4 text-sm"><a className={linkCls} href={href('challenges')}>Challenge your friends</a></p>}
      </Section>
    </div>
  )
}
