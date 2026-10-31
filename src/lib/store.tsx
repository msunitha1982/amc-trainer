/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { loadIndex } from './data.ts'
import { DEFAULT_FILTERS, sanitizeFilters, type Filters, type LiveRatings, type Progress } from './filters.ts'
import { authRedirect, supabase, type Badge, type Profile, type SubmitResult } from './supabase.ts'
import type { ProblemMeta } from './types.ts'

interface Store {
  problems: ProblemMeta[]
  byId: Map<string, ProblemMeta>
  dataError: string | null
  session: Session | null
  authReady: boolean
  profile: Profile | null
  progress: Progress
  live: LiveRatings
  badges: Badge[]
  filters: Filters
  setFilters: (f: Filters) => void
  /** Returns the user id, signing in as a guest first if needed. */
  ensureUser: () => Promise<string>
  refreshProfile: () => Promise<void>
  refreshProgress: () => Promise<void>
  recordResult: (problemId: string, r: SubmitResult) => void
  toggleBookmark: (problemId: string) => Promise<void>
}

const Ctx = createContext<Store | null>(null)
const EMPTY_PROGRESS: Progress = { status: {}, bookmarks: new Set() }

function readStoredFilters(): Filters {
  try {
    return sanitizeFilters(JSON.parse(localStorage.getItem('filters') ?? 'null'))
  } catch {
    return DEFAULT_FILTERS
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [problems, setProblems] = useState<ProblemMeta[]>([])
  const [dataError, setDataError] = useState<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS)
  const [live, setLive] = useState<LiveRatings>({})
  const [badges, setBadges] = useState<Badge[]>([])
  const [filters, setFiltersState] = useState<Filters>(readStoredFilters)

  const setFilters = useCallback((f: Filters) => {
    setFiltersState(f)
    try {
      localStorage.setItem('filters', JSON.stringify(f))
    } catch {
      /* storage unavailable: filters just won't persist */
    }
  }, [])

  useEffect(() => {
    loadIndex()
      .then((d) => setProblems(d.problems))
      .catch((e: Error) => setDataError(e.message))
    supabase.rpc('get_problem_stats').then(({ data }) => data && setLive(data as LiveRatings))
    supabase
      .from('badges')
      .select('*')
      .order('sort')
      .then(({ data }) => data && setBadges(data as Badge[]))
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
      // Returning from an email link: the auth client has read the tokens; show the outcome.
      if (authRedirect) {
        const q = new URLSearchParams(authRedirect.error ? { auth: 'error', msg: authRedirect.error } : { auth: authRedirect.type ?? 'signin' })
        window.history.replaceState(null, '', `${window.location.pathname}#/account?${q}`)
        window.dispatchEvent(new HashChangeEvent('hashchange'))
      }
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') {
        window.history.replaceState(null, '', `${window.location.pathname}#/account?auth=recovery`)
        window.dispatchEvent(new HashChangeEvent('hashchange'))
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id ?? null

  const refreshProfile = useCallback(async () => {
    if (!userId) return setProfile(null)
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    setProfile((data as Profile) ?? null)
  }, [userId])

  const refreshProgress = useCallback(async () => {
    if (!userId) return setProgress(EMPTY_PROGRESS)
    const { data } = await supabase.rpc('get_my_progress')
    const d = (data ?? { status: {}, bookmarks: [] }) as { status: Progress['status']; bookmarks: string[] }
    setProgress({ status: d.status ?? {}, bookmarks: new Set(d.bookmarks ?? []) })
  }, [userId])

  useEffect(() => {
    // Fetch the signed-in user's data whenever the user changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshProfile()
    void refreshProgress()
  }, [refreshProfile, refreshProgress])

  const ensureUser = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    if (data.session) return data.session.user.id
    const { data: anon, error } = await supabase.auth.signInAnonymously()
    if (error || !anon.user) throw error ?? new Error('Could not start a guest session')
    return anon.user.id
  }, [])

  const recordResult = useCallback((problemId: string, r: SubmitResult) => {
    if (r.rated) {
      setProgress((p) => ({ ...p, status: { ...p.status, [problemId]: r.correct ? 'solved' : 'missed' } }))
      setLive((l) => {
        const cur = l[problemId] ?? [r.problem_rating, 0, 0]
        return { ...l, [problemId]: [Math.round(r.problem_rating), cur[1] + 1, cur[2] + (r.correct ? 1 : 0)] }
      })
    }
    void refreshProfile()
  }, [refreshProfile])

  const toggleBookmark = useCallback(async (problemId: string) => {
    await ensureUser()
    const { data, error } = await supabase.rpc('toggle_bookmark', { p_problem_id: problemId })
    if (error) throw error
    setProgress((p) => {
      const b = new Set(p.bookmarks)
      if (data) b.add(problemId)
      else b.delete(problemId)
      return { ...p, bookmarks: b }
    })
  }, [ensureUser])

  const byId = useMemo(() => new Map(problems.map((p) => [p.id, p])), [problems])

  const value: Store = {
    problems, byId, dataError, session, authReady, profile, progress, live, badges, filters, setFilters,
    ensureUser, refreshProfile, refreshProgress, recordResult, toggleBookmark,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}
