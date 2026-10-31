import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { AVATAR_COLORS, Avatar, Button, cx, ErrorNote, inputCls, linkCls, Note, PageTitle, Section } from '../components/ui.tsx'
import { href, navigate, type Route } from '../lib/router.ts'
import { useStore } from '../lib/store.tsx'
import { errorMessage, siteUrl, supabase } from '../lib/supabase.ts'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-ink-3">{label}</span>
      {children}
    </label>
  )
}

function useForm() {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const run = async (e: FormEvent | null, fn: () => Promise<string | void>) => {
    e?.preventDefault()
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const m = await fn()
      if (m) setMsg(m)
    } catch (x) {
      setErr(errorMessage(x))
    } finally {
      setBusy(false)
    }
  }
  const status = (
    <>
      {err && <ErrorNote>{err}</ErrorNote>}
      {msg && <p role="status" className="text-sm text-good">{msg}</p>}
    </>
  )
  return { busy, err, run, status }
}

function ProfileForm() {
  const { profile, refreshProfile } = useStore()
  const [username, setUsername] = useState(profile?.username ?? '')
  const [avatar, setAvatar] = useState(profile?.avatar ?? 'glacier')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const f = useForm()
  useEffect(() => {
    if (!profile) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUsername(profile.username)
    setAvatar(profile.avatar)
    setBio(profile.bio)
  }, [profile])

  return (
    <form
      onSubmit={(e) =>
        f.run(e, async () => {
          const { error } = await supabase.rpc('update_profile', { p_username: username.trim(), p_avatar: avatar, p_bio: bio.trim() })
          if (error) throw error
          await refreshProfile()
          return 'Saved.'
        })
      }
      className="space-y-5"
    >
      <Field label="Username">
        <input className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} pattern="[A-Za-z0-9_]{3,20}" required title="3–20 letters, digits or underscores" />
      </Field>
      <fieldset>
        <legend className="mb-1.5 text-sm text-ink-3">Color</legend>
        <div className="flex flex-wrap items-center gap-2">
          {Object.keys(AVATAR_COLORS).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setAvatar(c)}
              aria-pressed={avatar === c}
              aria-label={c}
              className={cx('rounded-[3px] p-0.5', avatar === c ? 'ring-2 ring-accent' : 'ring-1 ring-transparent hover:ring-line-2')}
            >
              <Avatar name={username || '?'} color={c} size={30} />
            </button>
          ))}
        </div>
      </fieldset>
      <Field label="Bio">
        <textarea className={cx(inputCls, 'h-auto py-2')} rows={2} maxLength={280} value={bio} onChange={(e) => setBio(e.target.value)} />
      </Field>
      {f.status}
      <Button type="submit" disabled={f.busy}>Save profile</Button>
    </form>
  )
}

/** Not signed in (or a guest choosing to switch): sign in, create an account, or reset a password. */
function SignInForms({ guest }: { guest: boolean }) {
  const [tab, setTab] = useState<'signin' | 'signup' | 'forgot'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [needsConfirm, setNeedsConfirm] = useState(false)
  const f = useForm()

  const resend = () =>
    f.run(null, async () => {
      const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: siteUrl() } })
      if (error) throw error
      return 'Sent a new confirmation link. It can take a few minutes; check spam too.'
    })

  const submit = (e: FormEvent) =>
    f.run(e, async () => {
      if (tab === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: siteUrl() })
        if (error) throw error
        return 'If that email has an account, a reset link is on its way.'
      }
      if (tab === 'signin') {
        if (guest) await supabase.auth.signOut()
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
          if (/not confirmed/i.test(error.message)) setNeedsConfirm(true)
          throw error
        }
        navigate('practice')
        return
      }
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: siteUrl() } })
      if (error) throw error
      // Supabase answers an existing address with a user that has no identities (and sends nothing).
      if (data.user && data.user.identities?.length === 0) {
        setTab('signin')
        return 'That email already has an account. Sign in, or use “Forgot password”.'
      }
      if (data.session) {
        navigate('practice')
        return
      }
      setNeedsConfirm(true)
      return 'Check your email for a confirmation link, then come back here.'
    })

  return (
    <div>
      <div role="tablist" className="mb-6 flex gap-6 border-b border-line">
        {([['signin', 'Sign in'], ['signup', 'Create account'], ['forgot', 'Forgot password']] as const).map(([t, l]) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cx('-mb-px border-b-2 pb-2 text-sm', tab === t ? 'border-accent text-ink' : 'border-transparent text-ink-3 hover:text-ink')}
          >
            {l}
          </button>
        ))}
      </div>
      {guest && tab === 'signin' && <div className="mb-4"><Note>Signing in to another account leaves this guest's progress behind.</Note></div>}
      {guest && tab === 'signup' ? (
        <p className="text-sm text-ink-2">As a guest, use “Save your progress” above. It turns this guest into a full account.</p>
      ) : (
        <form onSubmit={submit} className="max-w-sm space-y-4">
          <Field label="Email">
            <input className={inputCls} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {tab !== 'forgot' && (
            <Field label="Password">
              <input className={inputCls} type="password" autoComplete={tab === 'signin' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          )}
          {f.status}
          <div className="flex flex-wrap items-center gap-5">
            <Button type="submit" disabled={f.busy}>{{ signin: 'Sign in', signup: 'Create account', forgot: 'Send reset link' }[tab]}</Button>
            {needsConfirm && email && (
              <button type="button" className="text-sm text-ink-2 hover:text-ink" onClick={resend} disabled={f.busy}>
                Resend confirmation email
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  )
}

/** A guest attaches an email (confirmed by link), then sets a password. Progress carries over. */
function SaveProgressForm() {
  const [email, setEmail] = useState('')
  const f = useForm()
  return (
    <form
      onSubmit={(e) =>
        f.run(e, async () => {
          const { data, error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: siteUrl() })
          if (error) throw error
          if (data.user?.email === email) return 'Email saved. Now set a password below.'
          return 'Check your email and click the link. You’ll come back here to set a password.'
        })
      }
      className="max-w-sm space-y-4"
    >
      <Field label="Email">
        <input className={inputCls} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      {f.status}
      <Button type="submit" disabled={f.busy}>Save my progress</Button>
    </form>
  )
}

function PasswordForm({ label = 'New password', done }: { label?: string; done?: () => void }) {
  const [password, setPassword] = useState('')
  const f = useForm()
  return (
    <form
      onSubmit={(e) =>
        f.run(e, async () => {
          const { error } = await supabase.auth.updateUser({ password })
          if (error) throw error
          setPassword('')
          done?.()
          return 'Password updated.'
        })
      }
      className="max-w-sm space-y-4"
    >
      <Field label={label}>
        <input className={inputCls} type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {f.status}
      <Button type="submit" disabled={f.busy}>Set password</Button>
    </form>
  )
}

function EmailChangeForm({ current }: { current: string }) {
  const [email, setEmail] = useState('')
  const f = useForm()
  return (
    <form
      onSubmit={(e) =>
        f.run(e, async () => {
          const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: siteUrl() })
          if (error) throw error
          return `Confirmation links were sent. Your email stays ${current} until the change is confirmed.`
        })
      }
      className="max-w-sm space-y-4"
    >
      <Field label="New email">
        <input className={inputCls} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      {f.status}
      <Button type="submit" variant="secondary" disabled={f.busy}>Change email</Button>
    </form>
  )
}

const CALLBACK_MESSAGES: Record<string, string> = {
  signup: 'Email confirmed. You’re signed in.',
  email_change: 'Email confirmed.',
  invite: 'Invitation accepted.',
  magiclink: 'You’re signed in.',
  signin: 'You’re signed in.',
}

export function AccountPage({ route }: { route: Route }) {
  const { session, profile, authReady, ensureUser, refreshProfile } = useStore()
  const [err, setErr] = useState<string | null>(null)
  const guest = !!session?.user.is_anonymous
  const auth = route.query.get('auth')
  const pendingEmail = session?.user.new_email

  if (!authReady) return null

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <PageTitle>Account</PageTitle>

      {auth === 'error' && <ErrorNote>{route.query.get('msg') ?? 'That link didn’t work.'} Links expire after an hour and work once.</ErrorNote>}
      {auth && CALLBACK_MESSAGES[auth] && <p role="status" className="text-good">{CALLBACK_MESSAGES[auth]}</p>}

      {auth === 'recovery' && session && (
        <Section title="Choose a new password">
          <PasswordForm done={() => navigate('account')} />
        </Section>
      )}

      {session && profile && (
        <Section title="Profile" aside={<a className={cx('text-sm', linkCls)} href={href(`u/${profile.username}`)}>Public profile</a>}>
          <ProfileForm />
        </Section>
      )}

      {guest && (
        <Section title="Save your progress">
          <p className="mb-5 text-sm text-ink-2">Right now your progress lives in this browser. Add an email to keep it and sign in anywhere.</p>
          {pendingEmail && <div className="mb-4"><Note>Waiting for you to confirm {pendingEmail}. Check your inbox and spam.</Note></div>}
          <SaveProgressForm />
        </Section>
      )}

      {session && !guest && (
        <Section title="Sign-in details">
          <p className="mb-5 text-sm text-ink-2">
            Signed in as <span className="text-ink">{session.user.email}</span>
            {pendingEmail && <> · change to {pendingEmail} waiting for confirmation</>}
          </p>
          <div className="space-y-8">
            {auth === 'email_change' || auth === 'signup' ? <PasswordForm label="Set a password" /> : <PasswordForm label="Change password" />}
            <EmailChangeForm current={session.user.email ?? ''} />
            <Button variant="secondary" onClick={() => supabase.auth.signOut().then(() => navigate('practice'))}>Sign out</Button>
          </div>
        </Section>
      )}

      {(!session || guest) && (
        <Section title={guest ? 'Use an existing account' : undefined} className={!session ? 'border-t-0 pt-0' : undefined}>
          <SignInForms guest={guest} />
          {!session && (
            <div className="mt-8 border-t border-line pt-6">
              <Button variant="secondary" onClick={() => ensureUser().then(refreshProfile).then(() => navigate('practice')).catch((e) => setErr(errorMessage(e)))}>
                Play as a guest
              </Button>
              {err && <div className="mt-3"><ErrorNote>{err}</ErrorNote></div>}
            </div>
          )}
        </Section>
      )}

      {session && (
        <Section title="Delete account">
          <p className="mb-4 text-sm text-ink-2">Permanently deletes your profile, answers, badges and challenges.</p>
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
          {err && <div className="mt-3"><ErrorNote>{err}</ErrorNote></div>}
        </Section>
      )}
    </div>
  )
}
