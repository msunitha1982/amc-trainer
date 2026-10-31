import { useEffect, useState } from 'react'
import { Heatmap } from '../components/charts/Heatmap.tsx'
import { RatingChart } from '../components/charts/RatingChart.tsx'
import { Avatar, Button, cx, ErrorNote, linkCls, Section, Spinner, Stat } from '../components/ui.tsx'
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
  if (p === null) return <p className="text-ink-2">No player named “{username}”.</p>

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
    <div className="mx-auto max-w-3xl space-y-10">
      <header className="flex flex-wrap items-start gap-5">
        <Avatar name={p.username} color={p.avatar} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {p.username}
            {p.is_guest && <span className="ml-2 align-middle text-sm font-normal text-ink-3">guest</span>}
          </h1>
          {p.bio && <p className="mt-1 text-ink-2">{p.bio}</p>}
          <p className="mt-1 text-sm text-ink-3">
            <a className="hover:text-ink" href={href(`friends?u=${p.username}&tab=followers`)}>{follow.followers} followers</a> ·{' '}
            <a className="hover:text-ink" href={href(`friends?u=${p.username}&tab=following`)}>{follow.following} following</a> · joined{' '}
            {new Date(p.created_at).toLocaleDateString('en', { month: 'short', year: 'numeric' })}
          </p>
        </div>
        {isMe ? (
          <Button variant="secondary" onClick={() => navigate('account')}>Edit profile</Button>
        ) : (
          <Button variant={follow.iFollow ? 'secondary' : 'primary'} onClick={toggleFollow}>{follow.iFollow ? 'Following' : 'Follow'}</Button>
        )}
      </header>

      <div className="grid grid-cols-3 gap-6 sm:grid-cols-6">
        <Stat label="Rating" value={Math.round(p.rating)} hint={`Uncertainty ±${Math.round(p.rating_rd)}`} />
        <Stat label="Peak" value={Math.round(p.peak_rating)} />
        <Stat label="Solved" value={p.solved_count} hint={`${p.attempted_count} rated attempts`} />
        <Stat label="Accuracy" value={p.attempted_count ? `${Math.round((100 * p.solved_count) / p.attempted_count)}%` : '–'} />
        <Stat label="Streak" value={liveStreak(p.current_streak, p.last_active_day)} hint={`Longest ${p.longest_streak}`} />
        <Stat label="Daily streak" value={liveStreak(p.daily_streak, p.last_daily_day)} hint={`Longest ${p.daily_longest}`} />
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}

      <Section title="Activity" aside={<span className="text-sm text-ink-3">Longest streak {p.longest_streak} days</span>}>
        <Heatmap days={activity} />
      </Section>

      <Section title="Rating">
        {history === null ? <Spinner /> : <RatingChart points={history} />}
      </Section>

      <div className="grid gap-10 md:grid-cols-2">
        <Section
          title="Topics"
          aside={
            isMe && weakest ? (
              <a className={cx('text-sm', linkCls)} href={href(`practice?topic=${weakest}`)}>
                Practice {TOPICS[weakest].label.toLowerCase()}
              </a>
            ) : undefined
          }
        >
          <ul className="space-y-4">
            {MAJOR_TOPICS.map((m) => {
              const t = byTopic.get(m)
              const r = t?.attempts ? t.rating : null
              return (
                <li key={m}>
                  <div className="flex justify-between text-sm">
                    <span className={cx(m === weakest && rated.length > 1 && 'font-medium')}>
                      {TOPICS[m].label}
                      {m === weakest && rated.length > 1 && <span className="ml-2 font-normal text-ink-3">weakest</span>}
                    </span>
                    <span className="tabular-nums" title={t ? `${t.solves}/${t.attempts} solved` : undefined}>
                      {r === null ? <span className="text-ink-3">–</span> : Math.round(r)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 bg-line">
                    {r !== null && (
                      <div className="h-1 bg-[var(--series-1)]" style={{ width: `${Math.max(3, Math.min(100, ((r - 600) / (tMax - 600)) * 100))}%` }} />
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          {!rated.length && <p className="mt-4 text-sm text-ink-3">Topic ratings appear after rated answers.</p>}
        </Section>

        <Section title="Solved">
          <table className="w-full text-sm">
            <tbody>
              {[
                ...BANDS.map((b) => [b.label, stats?.bands?.[b.id]] as const),
                ...(['10', '12'] as const).map((c) => [`AMC ${c}`, stats?.contests?.[c]] as const),
              ].map(([label, v], i) => {
                const [s, a] = v ?? [0, 0]
                return (
                  <tr key={label} className={cx('border-line', i > 0 && 'border-t', i === 4 && 'border-t-line-2')}>
                    <th scope="row" className="py-2 text-left font-normal text-ink-2">{label}</th>
                    <td className="py-2 text-right tabular-nums">{s} / {a}</td>
                    <td className="w-14 py-2 text-right tabular-nums text-ink-3">{a ? `${Math.round((100 * s) / a)}%` : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Section>
      </div>

      <Section title="Badges" aside={<span className="text-sm text-ink-3">{Object.keys(earned).length} of {badges.length}</span>}>
        <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {badges.map((b) => {
            const at = earned[b.id]
            return (
              <li key={b.id} className={cx('flex gap-3', !at && 'opacity-45')} title={at ? `Earned ${new Date(at).toLocaleDateString()}` : 'Not earned yet'}>
                <span aria-hidden className={cx('mt-1.5 h-2.5 w-2.5 shrink-0 rotate-45', at ? 'bg-accent' : 'border border-line-2')} />
                <div>
                  <div className="text-sm font-medium">{b.name}</div>
                  <div className="text-sm text-ink-3">{b.description}{at ? '' : ' · locked'}</div>
                </div>
              </li>
            )
          })}
        </ul>
      </Section>
    </div>
  )
}
