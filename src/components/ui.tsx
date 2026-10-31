/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react'
import { band, bandLabel } from '../lib/rating.ts'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

/** "Hard 1523" in plain type; difficulty is information, not decoration. */
export function Difficulty({ rating }: { rating: number }) {
  return (
    <span className="text-ink-2">
      {bandLabel(band(rating))} <span className="tabular-nums text-ink-3">{Math.round(rating)}</span>
    </span>
  )
}

export function Button({
  children, onClick, variant = 'primary', disabled, type = 'button', className, title,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger'
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
  title?: string
}) {
  const v = {
    primary: 'bg-accent text-accent-ink hover:opacity-90',
    secondary: 'border border-line-2 text-ink hover:bg-accent-soft',
    quiet: 'text-ink-2 hover:text-ink underline-offset-4 hover:underline px-0',
    danger: 'border border-bad text-bad hover:bg-bad-soft',
  }[variant]
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cx(
        'inline-flex h-9 items-center justify-center gap-2 rounded-[3px] px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        v,
        className,
      )}
    >
      {children}
    </button>
  )
}

/** One-of-many choice drawn as a row of words; the selected one is filled. */
export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T
  options: [T, string][]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cx(
            'h-8 rounded-[3px] px-2.5 text-sm',
            value === v ? 'bg-accent text-accent-ink' : 'text-ink-2 hover:bg-accent-soft hover:text-ink',
          )}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

/** Multi-select option. */
export function Toggle({ children, active, onClick }: { children: ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'h-8 rounded-[3px] border px-2.5 text-sm',
        active ? 'border-accent bg-accent-soft text-ink' : 'border-line text-ink-2 hover:border-line-2 hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

/** A titled region separated by a hairline, used instead of boxed cards. */
export function Section({ title, aside, children, className }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('border-t border-line pt-6', className)}>
      {(title || aside) && (
        <div className="mb-4 flex items-baseline justify-between gap-4">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  )
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="mb-8">
      <h1 className="text-2xl font-semibold tracking-tight">{children}</h1>
      {sub && <p className="mt-1 text-sm text-ink-2">{sub}</p>}
    </header>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <p role="status" className="py-6 text-sm text-ink-3">
      {label}…
    </p>
  )
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-[3px] bg-bad-soft px-3 py-2 text-sm text-bad">{children}</p>
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="rounded-[3px] bg-accent-soft px-3 py-2 text-sm text-ink-2">{children}</p>
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div title={hint}>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-ink-3">{label}</div>
    </div>
  )
}

export const inputCls =
  'h-9 w-full rounded-[3px] border border-line-2 bg-raised px-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none'

export const linkCls = 'text-accent underline-offset-4 hover:underline'

/** Avatar colors. The database stores the key; unknown values fall back to the first color. */
export const AVATAR_COLORS: Record<string, string> = {
  glacier: '#2c6a8d',
  fjord: '#3f5f8a',
  meltwater: '#3d8a8a',
  moss: '#557a4f',
  slate: '#5b6670',
  dusk: '#6d5a7a',
  ember: '#a35d3f',
  sand: '#a08453',
}

export function Avatar({ name, color, size = 32 }: { name: string; color: string; size?: number }) {
  const bg = AVATAR_COLORS[color] ?? AVATAR_COLORS.glacier
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-[3px] font-semibold text-white uppercase"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.45 }}
    >
      {name.slice(0, 1) || '?'}
    </span>
  )
}
