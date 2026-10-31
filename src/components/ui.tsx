/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react'
import { band, bandLabel, type Band } from '../lib/rating.ts'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

const BAND_STYLE: Record<Band, string> = {
  warmup: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  medium: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  hard: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
  boss: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
}
const BAND_ICON: Record<Band, string> = { warmup: '🌱', medium: '⚡', hard: '🔥', boss: '🐉' }

export function BandChip({ rating, showRating = true }: { rating: number; showRating?: boolean }) {
  const b = band(rating)
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', BAND_STYLE[b])}>
      <span aria-hidden>{BAND_ICON[b]}</span>
      {bandLabel(b)}
      {showRating && <span className="font-normal opacity-80">· {Math.round(rating)}</span>}
    </span>
  )
}

export function Chip({ children, onClick, active }: { children: ReactNode; onClick?: () => void; active?: boolean }) {
  const cls = cx(
    'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs',
    active
      ? 'border-indigo-500 bg-indigo-50 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200'
      : 'border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-300',
    onClick && 'hover:border-indigo-400 cursor-pointer',
  )
  return onClick ? (
    <button type="button" className={cls} onClick={onClick} aria-pressed={active}>
      {children}
    </button>
  ) : (
    <span className={cls}>{children}</span>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900', className)}>
      {children}
    </section>
  )
}

export function Button({
  children, onClick, variant = 'primary', disabled, type = 'button', className, title,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
  title?: string
}) {
  const v = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-indigo-300 dark:disabled:bg-indigo-900',
    secondary: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
    ghost: 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
    danger: 'bg-rose-600 text-white hover:bg-rose-500',
  }[variant]
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cx('inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed', v, className)}
    >
      {children}
    </button>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 p-6 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" aria-hidden />
      {label}…
    </div>
  )
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950 dark:text-rose-200">{children}</p>
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800" title={hint}>
      <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  )
}
