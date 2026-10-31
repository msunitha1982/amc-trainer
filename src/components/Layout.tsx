import { useState, type ReactNode } from 'react'
import { APP_NAME } from '../config.ts'
import { href } from '../lib/router.ts'
import { useStore } from '../lib/store.tsx'
import { avatarSrc } from '../lib/supabase.ts'
import { Avatar, cx } from './ui.tsx'

const NAV = [
  ['practice', 'Practice'],
  ['daily', 'Daily'],
  ['challenges', 'Challenges'],
  ['leaderboard', 'Leaderboard'],
  ['friends', 'Friends'],
  ['about', 'About'],
] as const

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  return (
    <button
      type="button"
      className="text-sm text-ink-3 hover:text-ink"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => {
        const next = !dark
        setDark(next)
        document.documentElement.classList.toggle('dark', next)
        try {
          localStorage.setItem('theme', next ? 'dark' : 'light')
        } catch {
          /* ignore */
        }
      }}
    >
      {dark ? 'Light' : 'Dark'}
    </button>
  )
}

export function Layout({ active, children }: { active: string; children: ReactNode }) {
  const { profile, session } = useStore()
  const [menu, setMenu] = useState(false)
  const navLink = (k: string, label: string, extra?: string) => (
    <a
      key={k}
      href={href(k)}
      onClick={() => setMenu(false)}
      aria-current={active === k ? 'page' : undefined}
      className={cx(
        'text-sm underline-offset-[6px]',
        active === k ? 'text-ink underline decoration-accent decoration-2' : 'text-ink-2 hover:text-ink',
        extra,
      )}
    >
      {label}
    </a>
  )
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-raised focus:p-2">
        Skip to content
      </a>
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-8 px-4">
          <a href={href('practice')} className="font-semibold tracking-tight">
            {APP_NAME}
          </a>
          <nav aria-label="Main" className="hidden gap-6 md:flex">
            {NAV.map(([k, label]) => navLink(k, label))}
          </nav>
          <div className="ml-auto flex items-center gap-5">
            {profile && (
              <a href={href(`u/${profile.username}`)} className="flex items-center gap-2 text-sm text-ink-2 hover:text-ink" title="Your profile">
                <span className="hidden tabular-nums sm:inline">{Math.round(profile.rating)}</span>
                <Avatar name={profile.username} color={profile.avatar} url={avatarSrc(profile.avatar_url)} size={26} />
                <span className="sr-only">{profile.username}</span>
              </a>
            )}
            <a href={href('account')} className="text-sm text-ink-2 hover:text-ink">
              {!session ? 'Sign in' : session.user.is_anonymous ? 'Save progress' : 'Account'}
            </a>
            <ThemeToggle />
            <button type="button" className="text-sm text-ink-2 md:hidden" aria-expanded={menu} aria-controls="mobile-nav" onClick={() => setMenu((m) => !m)}>
              Menu
            </button>
          </div>
        </div>
        {menu && (
          <nav id="mobile-nav" aria-label="Main" className="flex flex-col gap-3 border-t border-line px-4 py-4 md:hidden">
            {NAV.map(([k, label]) => navLink(k, label))}
          </nav>
        )}
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        {children}
      </main>
    </div>
  )
}
