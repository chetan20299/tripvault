import { useState, type FormEvent } from 'react';
import { ArrowLeft, FlaskConical, Lock, Mail, User, WifiOff, Building2, CloudOff, FileDown } from 'lucide-react';
import { useSession } from '../auth/session';
import { Button, Field, Logo, useUi } from '../components/ui';
import { FIREBASE_ENABLED } from '../config';

type Mode = 'login' | 'register' | 'forgot';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthPage() {
  const { loginDemo, loginFirebase, registerFirebase, notice } = useSession();
  const { toast } = useUi();
  const [mode, setMode] = useState<Mode>('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'' | 'submit' | 'demo'>('');
  const [error, setError] = useState(notice ?? '');
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  function validate() {
    const e: Record<string, string> = {};
    if (mode === 'register' && !form.name.trim()) e.name = 'Please enter your name';
    if (!EMAIL_RE.test(form.email.trim())) e.email = 'Enter a valid email address';
    if (mode !== 'forgot' && form.password.length < 6) e.password = 'At least 6 characters';
    if (mode === 'register' && form.confirm !== form.password) e.confirm = 'Passwords do not match';
    setErrors(e);
    return !Object.keys(e).length;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setError('');
    if (!validate()) return;
    if (!FIREBASE_ENABLED) return setError('Production sign-in is not configured yet (no Firebase settings). Use "Explore Demo" to try TripVault.');
    if (!navigator.onLine) return setError('You are offline. Signing in or creating an account needs an internet connection the first time.');
    setBusy('submit');
    try {
      if (mode === 'login') await loginFirebase(form.email, form.password);
      else if (mode === 'register') await registerFirebase(form.name.trim(), form.email, form.password);
      else {
        const { fbResetPassword } = await import('../sync/firebase');
        await fbResetPassword(form.email);
        toast('Password reset email sent. Check your inbox.');
        setMode('login');
      }
    } catch (e) {
      const { authError } = await import('../sync/firebase');
      setError(authError(e));
    } finally { setBusy(''); }
  }

  async function demo() {
    setBusy('demo');
    try { await loginDemo(); } catch (e: any) { setError(e.message); setBusy(''); }
  }

  const title = { login: 'Welcome back', register: 'Create your account', forgot: 'Reset your password' }[mode];
  const sub = { login: 'Sign in to access your travel knowledge.', register: 'Start building your personal city vault.', forgot: "We'll email you a link to set a new password." }[mode];

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -left-16 h-[28rem] w-[28rem] rounded-full bg-accent-400/10" />
        <Logo size={44} className="relative [&_div]:text-white [&_.text-muted]:text-white/70 [&_.text-brand-500]:text-accent-400" />
        <div className="relative mt-auto max-w-md">
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight">Every city you visit,<br />remembered.</h2>
          <p className="mt-4 text-white/75">Leads, contacts, restaurants and insights from every business trip, ready the moment you land again, even without internet.</p>
          <ul className="mt-8 space-y-3 text-sm text-white/85">
            {[[Building2, 'Organise knowledge city by city'], [CloudOff, 'Works fully offline, syncs automatically'], [FileDown, 'Share polished PDF city guides']].map(([I, t]: any) => (
              <li key={t} className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10"><I className="h-4 w-4" /></span>{t}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-10 safe-top">
        <div className="w-full max-w-sm animate-in">
          <Logo size={44} className="mb-10 lg:hidden" />
          {mode !== 'login' && <button onClick={() => { setMode('login'); setError(''); }} className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Back to sign in</button>}
          <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted">{sub}</p>

          {error && <div role="alert" className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-700 dark:text-red-300">{error}</div>}
          {!navigator.onLine && <div className="mt-4 flex items-center gap-2 text-xs text-muted"><WifiOff className="h-4 w-4" />Offline: Demo Mode still works.</div>}

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            {mode === 'register' && <Field label="Full name" error={errors.name}><IconInput icon={User} value={form.name} onChange={set('name')} autoComplete="name" placeholder="Alex Morgan" /></Field>}
            <Field label="Email" error={errors.email}><IconInput icon={Mail} type="email" value={form.email} onChange={set('email')} autoComplete="email" placeholder="you@company.com" /></Field>
            {mode !== 'forgot' && <Field label="Password" error={errors.password}><IconInput icon={Lock} type="password" value={form.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="••••••••" /></Field>}
            {mode === 'register' && <Field label="Confirm password" error={errors.confirm}><IconInput icon={Lock} type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" placeholder="••••••••" /></Field>}
            {mode === 'login' && <div className="text-right"><button type="button" onClick={() => { setMode('forgot'); setError(''); }} className="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-200">Forgot password?</button></div>}
            <Button type="submit" className="w-full" loading={busy === 'submit'}>{mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset link'}</Button>
          </form>

          {mode === 'login' && <p className="mt-5 text-center text-sm text-muted">New to TripVault? <button onClick={() => { setMode('register'); setError(''); }} className="font-semibold text-brand-600 hover:underline dark:text-brand-200">Create an account</button></p>}

          <div className="my-7 flex items-center gap-3 text-xs font-medium text-muted"><div className="h-px flex-1 bg-line" />or<div className="h-px flex-1 bg-line" /></div>
          <Button variant="secondary" className="w-full" icon={<FlaskConical className="h-4 w-4 text-accent-500" />} loading={busy === 'demo'} onClick={demo}>Explore Demo</Button>
          <p className="mt-2 text-center text-xs text-muted">No account needed. Demo data stays on this device and never touches real data.</p>
        </div>
      </section>
    </div>
  );
}

function IconInput({ icon: I, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { icon: any }) {
  return (
    <div className="relative">
      <I className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input {...props} className="input pl-10" />
    </div>
  );
}
