import { useEffect, useState } from 'react'
import { ProblemCard } from '../components/ProblemCard.tsx'
import { Card, ErrorNote, Spinner, Stat } from '../components/ui.tsx'
import { navigate } from '../lib/router.ts'
import { useStore } from '../lib/store.tsx'
import { errorMessage, supabase } from '../lib/supabase.ts'
import { appDay, liveStreak, msUntilNextAppDay } from '../lib/time.ts'

function useCountdown() {
  const [ms, setMs] = useState(msUntilNextAppDay)
  useEffect(() => {
    const t = setInterval(() => setMs(msUntilNextAppDay()), 1000)
    return () => clearInterval(t)
  }, [])
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m ${String(s % 60).padStart(2, '0')}s`
}

export function DailyPage() {
  const { byId, profile, problems } = useStore()
  const [daily, setDaily] = useState<{ day: string; problem_id: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const countdown = useCountdown()

  useEffect(() => {
    supabase.rpc('get_daily_problem').then(({ data, error: e }) => {
      if (e) setError(errorMessage(e))
      else setDaily(data as { day: string; problem_id: string | null })
    })
  }, [])

  const meta = daily?.problem_id ? byId.get(daily.problem_id) : undefined
  const doneToday = profile?.last_daily_day === appDay()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">☀️ Daily problem</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Same problem for everyone, every day. A new one arrives at midnight US Eastern, in {countdown}.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Daily streak" value={liveStreak(profile?.daily_streak ?? 0, profile?.last_daily_day ?? null)} />
        <Stat label="Best" value={profile?.daily_longest ?? 0} />
        <Stat label="Today" value={doneToday ? '✅' : '—'} />
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!daily && !error && <Spinner label="Finding today's problem" />}
      {daily && !daily.problem_id && <Card>No daily problem is available yet.</Card>}
      {daily?.problem_id && !meta && problems.length > 0 && <Card>Today's problem ({daily.problem_id}) isn't in this version of the site. Try refreshing.</Card>}
      {meta && <ProblemCard key={meta.id} meta={meta} onNext={() => navigate('practice')} nextLabel="Keep practicing" />}
    </div>
  )
}
