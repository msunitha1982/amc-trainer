import { useEffect, useState } from 'react'
import { Avatar, cx, ErrorNote, PageTitle, Spinner } from '../components/ui.tsx'
import { href } from '../lib/router.ts'
import { useStore } from '../lib/store.tsx'
import { errorMessage, supabase } from '../lib/supabase.ts'

interface Row {
  rank: number
  user_id: string
  username: string
  avatar: string
  rating?: number
  solved?: number
  gain?: number
  solves?: number
}

export function LeaderboardPage() {
  const { session } = useStore()
  const [tab, setTab] = useState<'global' | 'weekly'>('global')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    supabase
      .from(tab === 'global' ? 'leaderboard_global' : 'leaderboard_weekly')
      .select('*')
      .order('rank')
      .limit(100)
      .then(({ data, error: e }) => {
        if (!alive) return
        if (e) setError(errorMessage(e))
        else setRows(data as Row[])
      })
    return () => {
      alive = false
    }
  }, [tab])

  const me = session?.user.id

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle>Leaderboard</PageTitle>
      <div role="tablist" className="mb-6 flex gap-6 border-b border-line">
        {(['global', 'weekly'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => {
              setRows(null)
              setTab(t)
            }}
            className={cx('-mb-px border-b-2 pb-2 text-sm', tab === t ? 'border-accent text-ink' : 'border-transparent text-ink-3 hover:text-ink')}
          >
            {t === 'global' ? 'All time' : 'This week'}
          </button>
        ))}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!rows && !error && <Spinner />}
      {rows && rows.length === 0 && <p className="text-sm text-ink-2">No one here yet.</p>}
      {rows && rows.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-left text-ink-3">
            <tr>
              <th scope="col" className="w-12 pb-2 font-normal">#</th>
              <th scope="col" className="pb-2 font-normal">Player</th>
              <th scope="col" className="pb-2 text-right font-normal">{tab === 'global' ? 'Rating' : 'Gain'}</th>
              <th scope="col" className="w-20 pb-2 text-right font-normal">Solved</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.rank} className={cx('border-t border-line', r.user_id === me && 'bg-accent-soft')}>
                <td className="py-2.5 tabular-nums text-ink-3">{r.rank}</td>
                <td className="py-2.5">
                  <a href={href(`u/${r.username}`)} className="inline-flex items-center gap-2.5 hover:underline">
                    <Avatar name={r.username} color={r.avatar} size={22} />
                    {r.username}
                  </a>
                </td>
                <td className="py-2.5 text-right font-medium tabular-nums">
                  {tab === 'global' ? Math.round(r.rating!) : `${r.gain! >= 0 ? '+' : '−'}${Math.abs(r.gain!).toFixed(1)}`}
                </td>
                <td className="py-2.5 text-right tabular-nums text-ink-2">{tab === 'global' ? r.solved : r.solves}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
