import { APP_TIMEZONE } from '../config.ts'

/** YYYY-MM-DD for a moment in the app's timezone (matches private.app_today()). */
export function appDay(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

export function addDays(day: string, n: number): string {
  const d = new Date(day + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** A streak only counts as current if the last active day is today or yesterday. */
export function liveStreak(streak: number, lastDay: string | null, today = appDay()): number {
  if (!lastDay) return 0
  return lastDay === today || lastDay === addDays(today, -1) ? streak : 0
}

/** Milliseconds until the next midnight in the app timezone. */
export function msUntilNextAppDay(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE, hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23',
  }).formatToParts(now)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  const elapsed = (get('hour') * 3600 + get('minute') * 60 + get('second')) * 1000
  return 24 * 3600 * 1000 - elapsed
}
