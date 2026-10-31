import { useEffect, useState } from 'react'
import { ProblemCard } from '../components/ProblemCard.tsx'
import { ErrorNote, PageTitle, Spinner } from '../components/ui.tsx'
import { navigate } from '../lib/router.ts'
import { useStore } from '../lib/store.tsx'
import { errorMessage, supabase } from '../lib/supabase.ts'
import { appDay, liveStreak } from '../lib/time.ts'

export function DailyPage() {
  const { byId, profile, problems } = useStore()
  const [daily, setDaily] = useState<{ day: string; problem_id: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('get_daily_problem').then(({ data, error: e }) => {
      if (e) setError(errorMessage(e))
      else setDaily(data as { day: string; problem_id: string | null })
    })
  }, [])

  const meta = daily?.problem_id ? byId.get(daily.problem_id) : undefined
  const doneToday = profile?.last_daily_day === appDay()
  const streak = liveStreak(profile?.daily_streak ?? 0, profile?.last_daily_day ?? null)

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle
        sub={
          <>
            {daily && new Date(daily.day + 'T12:00:00Z').toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })}
            {' · '}Daily streak <span className="tabular-nums text-ink">{streak}</span>
            {' · '}Best <span className="tabular-nums text-ink">{profile?.daily_longest ?? 0}</span>
            {doneToday && ' · Done today'}
          </>
        }
      >
        Daily problem
      </PageTitle>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!daily && !error && <Spinner />}
      {daily && !daily.problem_id && <p className="text-ink-2">No daily problem is available yet.</p>}
      {daily?.problem_id && !meta && problems.length > 0 && <p className="text-ink-2">Today's problem isn't in this version of the site. Try refreshing.</p>}
      {meta && <ProblemCard key={meta.id} meta={meta} onNext={() => navigate('practice')} nextLabel="Keep practicing" />}
    </div>
  )
}
