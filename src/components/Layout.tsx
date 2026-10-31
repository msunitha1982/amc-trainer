import { useState, type ReactNode } from 'react'
import { APP_NAME, REPO_URL } from '../config.ts'
import { href } from '../lib/router.ts'
import { useStore } from '../lib/store.tsx'
import { liveStreak } from '../lib/time.ts'
import { cx } from './ui.tsx'

const NAV = [
  ['practice', 'Practice'],
  ['daily', 'Daily'],
  ['challenges', 'Challenges'],
  ['leaderboard', 'Leaderboard'],
  ['friends', 'Friends'],
] as const

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  return (
    <button
      type="button"
      className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      onClick={() => {
        const next = !dark
        setDark(next)
        document.documentElement.classList.toggle('dark', next)
        document.documentElement.dataset.theme = next ? 'dark' : 'light'
        try {
          localStorage.setItem('theme', next ? 'dark' : 'light')
        } catch {
          /* ignore */
        }
      }}
    >
      {dark ? '☀️' : '🌙'}
    </button>
  )
}

export function Layout({ active, children }: { active: string; children: ReactNode }) {
  const { profile, session } = useStore()
  const [menu, setMenu] = useState(false)
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
          <a href={href('practice')} className="flex items-center gap-2 font-extrabold tracking-tight">
            <img src="./favicon.svg" alt="" className="h-7 w-7" />
            <span>{APP_NAME}</span>
          </a>
          <nav aria-label="Main" className="ml-4 hidden gap-1 md:flex">
            {NAV.map(([k, label]) => (
              <a key={k} href={href(k)} aria-current={active === k ? 'page' : undefined}
                className={cx('rounded-lg px-3 py-1.5 text-sm font-semibold', active === k ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800')}>
                {label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            {profile && (
              <a href={href(`u/${profile.username}`)} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800" title="Your profile">
                <span className="hidden font-semibold tabular-nums sm:inline">{Math.round(profile.rating)}</span>
                <span className="hidden text-orange-600 sm:inline" title="Current streak">🔥{liveStreak(profile.current_streak, profile.last_active_day)}</span>
                <span className="text-xl" aria-hidden>{profile.avatar}</span>
                <span className="sr-only">{profile.username}</span>
              </a>
            )}
            {(!session || session.user.is_anonymous) && (
              <a href={href('account')} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950">
                {session ? 'Save progress' : 'Sign in'}
              </a>
            )}
            {session && !session.user.is_anonymous && (
              <a href={href('account')} className="hidden rounded-lg p-2 text-sm hover:bg-slate-100 sm:inline dark:hover:bg-slate-800" title="Account settings" aria-label="Account settings">⚙️</a>
            )}
            <ThemeToggle />
            <button type="button" className="rounded-lg p-2 md:hidden" aria-expanded={menu} aria-controls="mobile-nav" aria-label="Menu" onClick={() => setMenu((m) => !m)}>
              ☰
            </button>
          </div>
        </div>
        {menu && (
          <nav id="mobile-nav" aria-label="Main" className="border-t border-slate-200 px-4 py-2 md:hidden dark:border-slate-800">
            {[...NAV, ['account', 'Account'] as const, ['about', 'About'] as const].map(([k, label]) => (
              <a key={k} href={href(k)} onClick={() => setMenu(false)} aria-current={active === k ? 'page' : undefined}
                className={cx('block rounded-lg px-3 py-2 font-semibold', active === k && 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300')}>
                {label}
              </a>
            ))}
          </nav>
        )}
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-slate-200 py-6 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <div className="mx-auto max-w-6xl space-y-1 px-4">
          <p>
            Problems are from the MAA's AMC 10 and AMC 12 contests, via the{' '}
            <a className="underline" href="https://artofproblemsolving.com/wiki/" target="_blank" rel="noreferrer">AoPS Wiki</a> (
            <a className="underline" href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA</a>
            ). Each problem links to its wiki page. {APP_NAME} is not affiliated with the MAA or Art of Problem Solving.
          </p>
          <p>
            <a className="underline" href={href('about')}>About & ratings</a> · <a className="underline" href={REPO_URL} target="_blank" rel="noreferrer">Source on GitHub</a>
          </p>
        </div>
      </footer>
    </div>
  )
}
