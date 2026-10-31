import { useEffect, useState } from 'react'
import { Card, cx, ErrorNote, Spinner } from '../components/ui.tsx'
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
  week_start?: string
  refreshed_at: string
}

export function LeaderboardPage() {
  const { session } = useStore()
  const [tab, setTab] = useState<'global' | 'weekly'>('global')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows(null)
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
  const refreshed = rows?.[0]?.refreshed_at

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">🏆 Leaderboards</h1>
      <div role="tablist" className="flex gap-2">
        {(['global', 'weekly'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cx('rounded-lg px-4 py-2 text-sm font-semibold', tab === t ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800')}
          >
            {t === 'global' ? 'All-time rating' : 'This week'}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {tab === 'weekly' ? 'Rating gained since Monday (US Eastern). ' : ''}Refreshed every 15 minutes
        {refreshed ? `; last at ${new Date(refreshed).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}.
      </p>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Card className="!p-0 overflow-hidden">
        {!rows && !error && <Spinner />}
        {rows && rows.length === 0 && <p className="p-6 text-sm text-slate-500">No one here yet. Solve a problem and check back in 15 minutes.</p>}
        {rows && rows.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th scope="col" className="px-4 py-2 w-12">#</th>
                <th scope="col" className="px-4 py-2">Player</th>
                <th scope="col" className="px-4 py-2 text-right">{tab === 'global' ? 'Rating' : 'Gain'}</th>
                <th scope="col" className="px-4 py-2 text-right">Solved</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.rank} className={cx('border-t border-slate-100 dark:border-slate-800', r.user_id === me && 'bg-indigo-50 dark:bg-indigo-950')}>
                  <td className="px-4 py-2 tabular-nums text-slate-500">{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</td>
                  <td className="px-4 py-2">
                    <a href={href(`u/${r.username}`)} className="font-semibold hover:underline">
                      <span aria-hidden className="mr-2">{r.avatar}</span>
                      {r.username}
                    </a>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold">
                    {tab === 'global' ? Math.round(r.rating!) : `${r.gain! >= 0 ? '+' : ''}${r.gain!.toFixed(1)}`}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{tab === 'global' ? r.solved : r.solves}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
