import { createClient } from '@supabase/supabase-js'
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../config.ts'

/**
 * Email links (sign-up confirmation, password reset, email change) come back to the site with the
 * session in the URL fragment: "#access_token=...&type=signup" or "#error=...". Hash routing also
 * uses the fragment, so remember what kind of link this was before the auth client consumes it;
 * the app then routes to the account page with a message.
 */
export const authRedirect: { type: string | null; error: string | null } | null = (() => {
  const h = window.location.hash.replace(/^#\/?/, '')
  if (!/(^|&)(access_token|error|error_description)=/.test(h)) return null
  const q = new URLSearchParams(h)
  return { type: q.get('type'), error: q.get('error_description') ?? q.get('error') }
})()

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
})

/** Public URL of an uploaded profile picture. */
export const avatarSrc = (path: string | null | undefined) =>
  path ? supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl : null

/** Remove every file in the signed-in user's avatar folder except `keep`. */
export async function clearAvatarFiles(userId: string, keep?: string) {
  const { data } = await supabase.storage.from('avatars').list(userId, { limit: 100 })
  const paths = (data ?? []).map((f) => `${userId}/${f.name}`).filter((p) => p !== keep)
  if (paths.length) await supabase.storage.from('avatars').remove(paths)
}

/** Where email links should return: this exact site (must be in Supabase's Redirect URLs list). */
export const siteUrl = () => window.location.origin + window.location.pathname

export interface Profile {
  id: string
  username: string
  avatar: string
  /** Storage path of an uploaded picture in the "avatars" bucket, or null. */
  avatar_url: string | null
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
    if (/email not confirmed/i.test(m)) return 'Confirm your email first. Check your inbox (and spam), or resend the link below.'
    if (/rate limit/i.test(m)) return 'Too many emails sent recently. Wait a bit before trying again.'
    if (/failed to fetch/i.test(m)) return 'Network error. Check your connection and try again.'
    return m
  }
  return String(err)
}
