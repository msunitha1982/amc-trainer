import { createClient } from '@supabase/supabase-js'
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../config.ts'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  // Hash routing owns the URL fragment, so don't let auth try to parse it.
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})

export interface Profile {
  id: string
  username: string
  avatar: string
  bio: string
  is_guest: boolean
  rating: number
  rating_rd: number
  peak_rating: number
  solved_count: number
  attempted_count: number
  current_streak: number
  longest_streak: number
  last_active_day: string | null
  daily_streak: number
  daily_longest: number
  last_daily_day: string | null
  created_at: string
}

export interface SubmitResult {
  correct: boolean
  rated: boolean
  rating: number
  rating_delta: number
  problem_rating: number
  streak: number
  daily_credit: boolean
  daily_streak: number
  new_badges: string[]
}

export interface Badge {
  id: string
  name: string
  description: string
  icon: string
  sort: number
}

/** Turn a PostgREST/Postgres error into a sentence for the UI. */
export function errorMessage(err: unknown): string {
  if (!err) return 'Something went wrong'
  if (typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    const m = (err as { message: string }).message
    if (/anonymous sign-ins are disabled/i.test(m)) return 'Guest play is not enabled on the server yet.'
    if (/failed to fetch/i.test(m)) return 'Network error. Check your connection and try again.'
    return m
  }
  return String(err)
}
