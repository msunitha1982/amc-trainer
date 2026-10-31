import { useEffect, useState } from 'react'
import { Button, Card, ErrorNote } from '../components/ui.tsx'
import { href, navigate } from '../lib/router.ts'
import { useStore } from '../lib/store.tsx'
import { errorMessage, supabase } from '../lib/supabase.ts'

const AVATARS = ['🦊', '🐼', '🦉', '🐙', '🦄', '🐢', '🐧', '🦁', '🐸', '🐝', '🦖', '🐬', '🚀', '🧠', '📐', '🎲', '♾️', '🔺', '⭐', '🌀']
const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800'

function ProfileForm() {
  const { profile, refreshProfile } = useStore()
  const [username, setUsername] = useState(profile?.username ?? '')
  const [avatar, setAvatar] = useState(profile?.avatar ?? '🦊')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!profile) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUsername(profile.username)
    setAvatar(profile.avatar)
    setBio(profile.bio)
  }, [profile])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)
    setErr(null)
    const { error } = await supabase.rpc('update_profile', { p_username: username.trim(), p_avatar: avatar, p_bio: bio.trim() })
    if (error) return setErr(errorMessage(error))
    await refreshProfile()
    setMsg('Saved.')
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block font-semibold">Username</span>
        <input className={input} value={username} onChange={(e) => setUsername(e.target.value)} pattern="[A-Za-z0-9_]{3,20}" required
          title="3-20 letters, digits or underscores" />
      </label>
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">Avatar</legend>
        <div className="flex flex-wrap gap-1">
          {AVATARS.map((a) => (
            <button key={a} type="button" onClick={() => setAvatar(a)} aria-pressed={avatar === a} aria-label={`Avatar ${a}`}
              className={`rounded-lg p-1.5 text-2xl ${avatar === a ? 'bg-indigo-100 ring-2 ring-indigo-500 dark:bg-indigo-950' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
              {a}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold">Bio</span>
        <textarea className={input} rows={2} maxLength={280} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Aiming for AIME!" />
      </label>
      {err && <ErrorNote>{err}</ErrorNote>}
      {msg && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{msg}</p>}
      <Button type="submit">Save profile</Button>
    </form>
  )
}

function CredentialsForm({ mode }: { mode: 'upgrade' | 'signin' | 'signup' }) {
  const { refreshProfile } = useStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      if (mode === 'upgrade') {
        // Links an email + password to the current guest user; progress carries over.
        const { error } = await supabase.auth.updateUser({ email, password })
        if (error) throw error
        await supabase.auth.refreshSession()
        setMsg('Account saved! You can now sign in with this email on any device.')
      } else if (mode === 'signin') {
        await supabase.auth.signOut()
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        navigate('practice')
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMsg(data.session ? 'Welcome!' : 'Check your email to confirm your account.')
      }
      await refreshProfile()
    } catch (e2) {
      setErr(errorMessage(e2))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm">
        <span className="mb-1 block font-semibold">Email</span>
        <input className={input} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold">Password</span>
        <input className={input} type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={8} required
          value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {err && <ErrorNote>{err}</ErrorNote>}
      {msg && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{msg}</p>}
      <Button type="submit" disabled={busy}>
        {busy ? 'Working…' : mode === 'upgrade' ? 'Save my progress' : mode === 'signin' ? 'Sign in' : 'Create account'}
      </Button>
    </form>
  )
}

export function AccountPage() {
  const { session, profile, authReady, ensureUser, refreshProfile } = useStore()
  const [tab, setTab] = useState<'signin' | 'signup'>('signin')
  const [err, setErr] = useState<string | null>(null)
  const guest = !!session?.user.is_anonymous

  if (!authReady) return null

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">Account</h1>
      {session && profile && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold">Profile</h2>
            <a className="text-sm text-indigo-600 hover:underline dark:text-indigo-400" href={href(`u/${profile.username}`)}>View public profile →</a>
          </div>
          <ProfileForm />
        </Card>
      )}

      {guest && (
        <Card>
          <h2 className="font-bold">💾 Save your progress</h2>
          <p className="mt-1 mb-4 text-sm text-slate-600 dark:text-slate-400">
            You're playing as a guest. Your progress lives in this browser only. Add an email and password to keep it and sign in anywhere.
          </p>
          <CredentialsForm mode="upgrade" />
        </Card>
      )}

      {(!session || guest) && (
        <Card>
          <div role="tablist" className="mb-4 flex gap-2">
            {(['signin', 'signup'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1 text-sm font-semibold ${tab === t ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                {t === 'signin' ? 'Sign in' : 'New account'}
              </button>
            ))}
          </div>
          {guest && tab === 'signin' && (
            <p className="mb-3 text-sm text-amber-700 dark:text-amber-400">Signing in to another account leaves this guest's progress behind.</p>
          )}
          {guest && tab === 'signup' ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">As a guest, use “Save your progress” above instead. It turns this guest into a full account.</p>
          ) : (
            <CredentialsForm key={tab} mode={tab} />
          )}
          {!session && (
            <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
              <Button variant="secondary" onClick={() => ensureUser().then(refreshProfile).then(() => navigate('practice')).catch((e) => setErr(errorMessage(e)))}>
                Just play as a guest
              </Button>
              {err && <div className="mt-2"><ErrorNote>{err}</ErrorNote></div>}
            </div>
          )}
        </Card>
      )}

      {session && !guest && (
        <Card>
          <h2 className="font-bold">Signed in</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{session.user.email}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => supabase.auth.signOut().then(() => navigate('practice'))}>Sign out</Button>
          </div>
        </Card>
      )}

      {session && (
        <Card>
          <h2 className="font-bold text-rose-700 dark:text-rose-400">Delete account</h2>
          <p className="mt-1 mb-3 text-sm text-slate-600 dark:text-slate-400">Permanently deletes your profile, answers, badges and challenges.</p>
          <Button
            variant="danger"
            onClick={async () => {
              if (!window.confirm('Delete your account and all progress? This cannot be undone.')) return
              const { error } = await supabase.rpc('delete_account')
              if (error) return setErr(errorMessage(error))
              await supabase.auth.signOut()
              navigate('practice')
            }}
          >
            Delete my account
          </Button>
          {err && <div className="mt-2"><ErrorNote>{err}</ErrorNote></div>}
        </Card>
      )}
    </div>
  )
}
