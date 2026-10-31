import { useEffect, useState } from 'react'
import { Heatmap } from '../components/charts/Heatmap.tsx'
import { RatingChart } from '../components/charts/RatingChart.tsx'
import { Button, Card, cx, ErrorNote, Spinner, Stat } from '../components/ui.tsx'
import { BANDS } from '../lib/rating.ts'
import { href, navigate } from '../lib/router.ts'
import { useStore } from '../lib/store.tsx'
import { errorMessage, supabase, type Profile } from '../lib/supabase.ts'
import { MAJOR_TOPICS, TOPICS, type MajorTopic } from '../lib/taxonomy.ts'
import { liveStreak } from '../lib/time.ts'

interface TopicRating {
  topic: MajorTopic
  rating: number
  rating_rd: number
  attempts: number
  solves: number
}
interface Stats {
  bands: Record<string, [number, number]>
  contests: Record<string, [number, number]>
}

export function ProfilePage({ username }: { username: string }) {
  const { session, badges, ensureUser } = useStore()
  const [p, setP] = useState<Profile | null | undefined>(undefined)
  const [activity, setActivity] = useState<Record<string, number>>({})
  const [history, setHistory] = useState<[number, number][] | null>(null)
  const [topics, setTopics] = useState<TopicRating[]>([])
  const [earned, setEarned] = useState<Record<string, string>>({})
  const [stats, setStats] = useState<Stats | null>(null)
  const [follow, setFollow] = useState({ followers: 0, following: 0, iFollow: false })
  const [error, setError] = useState<string | null>(null)
  const me = session?.user.id

  useEffect(() => {
    let alive = true
    ;(async () => {
      setP(undefined)
      const { data, error: e } = await supabase.from('profiles').select('*').eq('username', username).maybeSingle()
      if (!alive) return
      if (e) return setError(errorMessage(e))
      const prof = data as Profile | null
      setP(prof)
      if (!prof) return
      const id = prof.id
      const since = new Date(Date.now() - 371 * 864e5).toISOString().slice(0, 10)
      const [act, hist, tr, ub, st, fol, fing] = await Promise.all([
        supabase.from('daily_activity').select('day,attempts').eq('user_id', id).gte('day', since).limit(400),
        supabase.rpc('get_rating_history', { p_user: id }),
        supabase.from('topic_ratings').select('*').eq('user_id', id),
        supabase.from('user_badges').select('badge_id,awarded_at').eq('user_id', id),
        supabase.rpc('get_profile_stats', { p_user: id }),
        supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('followee_id', id),
        supabase.from('follows').select('followee_id', { count: 'exact', head: true }).eq('follower_id', id),
      ])
      if (!alive) return
      setActivity(Object.fromEntries(((act.data ?? []) as { day: string; attempts: number }[]).map((r) => [r.day, r.attempts])))
      setHistory((hist.data as [number, number][]) ?? [])
      setTopics((tr.data as TopicRating[]) ?? [])
      setEarned(Object.fromEntries(((ub.data ?? []) as { badge_id: string; awarded_at: string }[]).map((b) => [b.badge_id, b.awarded_at])))
      setStats((st.data as Stats) ?? null)
      let iFollow = false
      if (me && me !== id) {
        const { count } = await supabase.from('follows').select('followee_id', { count: 'exact', head: true }).eq('follower_id', me).eq('followee_id', id)
        iFollow = (count ?? 0) > 0
      }
      if (alive) setFollow({ followers: fol.count ?? 0, following: fing.count ?? 0, iFollow })
    })()
    return () => {
      alive = false
    }
  }, [username, me])

  if (error) return <ErrorNote>{error}</ErrorNote>
  if (p === undefined) return <Spinner label="Loading profile" />
  if (p === null) return <Card>No player named “{username}”.</Card>

  const isMe = me === p.id
  const byTopic = new Map(topics.map((t) => [t.topic, t]))
  const rated = MAJOR_TOPICS.map((m) => ({ m, t: byTopic.get(m) })).filter((x) => x.t && x.t.attempts > 0)
  const weakest = rated.length ? rated.reduce((a, b) => (a.t!.rating <= b.t!.rating ? a : b)).m : null
  const toggleFollow = async () => {
    try {
      await ensureUser()
      const { error: e } = await supabase.rpc('set_follow', { p_user: p.id, p_follow: !follow.iFollow })
      if (e) throw e
      setFollow((f) => ({ ...f, iFollow: !f.iFollow, followers: f.followers + (f.iFollow ? -1 : 1) }))
    } catch (e) {
      setError(errorMessage(e))
    }
  }
  const tMax = Math.max(1800, ...topics.map((t) => t.rating))

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 text-4xl dark:bg-indigo-950" aria-hidden>
            {p.avatar}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
              {p.username}
              {p.is_guest && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600 dark:bg-slate-800 dark:text-slate-300">guest</span>}
            </h1>
            {p.bio && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{p.bio}</p>}
            <p className="mt-1 text-xs text-slate-500">
              <a className="hover:underline" href={href(`friends?u=${p.username}&tab=followers`)}>{follow.followers} followers</a> ·{' '}
              <a className="hover:underline" href={href(`friends?u=${p.username}&tab=following`)}>{follow.following} following</a> · joined{' '}
              {new Date(p.created_at).toLocaleDateString('en', { month: 'short', year: 'numeric' })}
            </p>
          </div>
          {isMe ? (
            <Button variant="secondary" onClick={() => navigate('account')}>Edit profile</Button>
          ) : (
            <Button variant={follow.iFollow ? 'secondary' : 'primary'} onClick={toggleFollow}>{follow.iFollow ? 'Following ✓' : 'Follow'}</Button>
          )}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Rating" value={Math.round(p.rating)} hint={`Peak ${Math.round(p.peak_rating)}; uncertainty ±${Math.round(p.rating_rd)}`} />
          <Stat label="Solved" value={p.solved_count} hint={`${p.attempted_count} rated attempts`} />
          <Stat label="Accuracy" value={p.attempted_count ? `${Math.round((100 * p.solved_count) / p.attempted_count)}%` : '—'} />
          <Stat label="Streak 🔥" value={liveStreak(p.current_streak, p.last_active_day)} hint={`Longest ${p.longest_streak}`} />
          <Stat label="Daily ☀️" value={liveStreak(p.daily_streak, p.last_daily_day)} hint={`Longest ${p.daily_longest}`} />
        </div>
        <p className="mt-2 text-xs text-slate-500">Longest streak {p.longest_streak} days · longest daily streak {p.daily_longest} · peak rating {Math.round(p.peak_rating)}</p>
      </Card>

      <Card>
        <h2 className="mb-3 font-bold">Activity</h2>
        <Heatmap days={activity} />
      </Card>

      <Card>
        <h2 className="mb-3 font-bold">Rating over time</h2>
        {history === null ? <Spinner /> : <RatingChart points={history} />}
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-bold">Topic ratings</h2>
            {isMe && weakest && (
              <Button variant="secondary" className="!px-3 !py-1 text-xs" onClick={() => navigate(`practice?topic=${weakest}`)}>
                Practice weakest: {TOPICS[weakest].label} →
              </Button>
            )}
          </div>
          <ul className="space-y-3">
            {MAJOR_TOPICS.map((m) => {
              const t = byTopic.get(m)
              const r = t?.attempts ? t.rating : null
              return (
                <li key={m}>
                  <div className="flex justify-between text-sm">
                    <span>{TOPICS[m].label}</span>
                    <span className="tabular-nums font-semibold" title={t ? `${t.solves}/${t.attempts} solved` : undefined}>
                      {r === null ? '—' : Math.round(r)}
                      {t?.attempts ? <span className="ml-1 font-normal text-slate-500">({t.solves}/{t.attempts})</span> : null}
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                    {r !== null && (
                      <div
                        className={cx('h-2 rounded-full', m === weakest && rated.length > 1 ? 'bg-amber-500' : 'bg-[var(--series-1)]')}
                        style={{ width: `${Math.max(4, Math.min(100, ((r - 600) / (tMax - 600)) * 100))}%` }}
                      />
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          {!rated.length && <p className="mt-3 text-xs text-slate-500">Topic ratings appear after rated answers.</p>}
        </Card>

        <Card>
          <h2 className="mb-3 font-bold">Solved by difficulty</h2>
          <table className="w-full text-sm">
            <tbody>
              {BANDS.map((b) => {
                const [s, a] = stats?.bands?.[b.id] ?? [0, 0]
                return (
                  <tr key={b.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <th scope="row" className="py-1.5 text-left font-normal">{b.label}</th>
                    <td className="py-1.5 text-right tabular-nums">{s} / {a}</td>
                    <td className="w-14 py-1.5 text-right tabular-nums text-slate-500">{a ? `${Math.round((100 * s) / a)}%` : ''}</td>
                  </tr>
                )
              })}
              {(['10', '12'] as const).map((c) => {
                const [s, a] = stats?.contests?.[c] ?? [0, 0]
                return (
                  <tr key={c} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <th scope="row" className="py-1.5 text-left font-normal">AMC {c} problems</th>
                    <td className="py-1.5 text-right tabular-nums">{s} / {a}</td>
                    <td className="w-14 py-1.5 text-right tabular-nums text-slate-500">{a ? `${Math.round((100 * s) / a)}%` : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 font-bold">Badges <span className="font-normal text-slate-500">({Object.keys(earned).length}/{badges.length})</span></h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {badges.map((b) => {
            const at = earned[b.id]
            return (
              <li
                key={b.id}
                className={cx('rounded-xl border p-3 text-center', at ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950' : 'border-slate-200 opacity-50 grayscale dark:border-slate-800')}
                title={at ? `Earned ${new Date(at).toLocaleDateString()}` : 'Not earned yet'}
              >
                <div className="text-3xl" aria-hidden>{b.icon}</div>
                <div className="mt-1 text-sm font-semibold">{b.name}</div>
                <div className="text-xs text-slate-600 dark:text-slate-400">{b.description}</div>
                <span className="sr-only">{at ? 'earned' : 'locked'}</span>
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}
