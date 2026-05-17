import { useMemo, useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, AtSign, KeyRound, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Badge, Button, Input, cn } from '../ui';
import { getHostMode, hostLabel } from '../lib/hostMode';

export function SignInRoute() {
  const { user, isAuthReady, loginWithGoogle, loginWithEmail, sendResetEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const hostMode = useMemo(() => getHostMode(), []);
  const wrongHost = searchParams.get('wrongHost') === '1';

  if (isAuthReady && user) {
    return <Navigate to="/" replace />;
  }

  const showGoogle = hostMode !== 'staff';
  const showEmail = hostMode !== 'admin';
  const headline =
    hostMode === 'admin'
      ? 'Admin sign-in'
      : hostMode === 'staff'
        ? 'Phlebotomist sign-in'
        : 'Sign in to your dashboard';
  const subheadline =
    hostMode === 'admin'
      ? 'Use your CareMol Google account.'
      : hostMode === 'staff'
        ? 'Enter the credentials your admin shared with you.'
        : 'Manage bookings, schedule phlebotomists, and supervise the home-collection workflow.';
  const wrongHostMessage =
    hostMode === 'admin'
      ? 'Your account is registered as phlebotomist. Please sign in at staff.caremol.in instead.'
      : hostMode === 'staff'
        ? 'Your account is registered as admin. Please sign in at admin.caremol.in instead.'
        : 'Your account does not have access here. Please use the correct sign-in URL.';

  const onEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setInfo(null);
    setError(null);
    setBusy(true);
    const res = await loginWithEmail(email, password);
    if (!res.ok) setError(res.error);
    setBusy(false);
  };

  const onGoogle = async () => {
    setInfo(null);
    setError(null);
    setGoogleBusy(true);
    const res = await loginWithGoogle();
    if (!res.ok) setError(res.error);
    setGoogleBusy(false);
  };

  const onReset = async () => {
    setInfo(null);
    setError(null);
    const res = await sendResetEmail(email);
    if (res.ok) setInfo('Password reset email sent. Check your inbox.');
    else setError(res.error);
  };

  return (
    <div
      data-themed
      className="min-h-screen w-screen bg-[var(--color-canvas)] text-[var(--color-text-primary)] grid lg:grid-cols-[1.05fr_1fr] overflow-hidden"
    >
      {/* Form panel */}
      <section className="flex items-center justify-center px-6 py-10 sm:px-10 lg:px-14">
        <div className="w-full max-w-[420px] flex flex-col gap-7">
          <header className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent)] text-white font-semibold tracking-tight">
              C
            </div>
            <div>
              <div className="text-[15px] font-semibold tracking-tight">CareMol</div>
              <div className="text-[11.5px] text-[var(--color-text-tertiary)] -mt-0.5">
                Lab Operations · Melattur
              </div>
            </div>
          </header>

          <div>
            <h1 className="text-[26px] sm:text-[28px] font-semibold tracking-tight leading-[1.15] text-[var(--color-text-primary)]">
              {headline}
            </h1>
            <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-text-secondary)]">
              {subheadline}
            </p>
            {hostMode !== 'open' && (
              <p className="mt-1 text-[12px] text-[var(--color-text-tertiary)] tabular-nums">
                {hostLabel(hostMode)}
              </p>
            )}
          </div>

          {wrongHost && (
            <div className="text-[12.5px] leading-relaxed text-[var(--color-status-danger)] bg-[var(--color-status-danger-bg)] border border-[var(--color-status-danger-ring)] rounded-[var(--radius-md)] px-3 py-2">
              {wrongHostMessage}
            </div>
          )}

          {showGoogle && (
            <Button
              onClick={onGoogle}
              loading={googleBusy}
              iconLeft={
                !googleBusy && (
                  <img
                    src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                    alt=""
                    className="size-4"
                  />
                )
              }
              variant="outline"
              size="lg"
              fullWidth
              className="font-medium"
            >
              Continue with Google
            </Button>
          )}

          {showGoogle && showEmail && (
            <div className="flex items-center gap-3 text-[11.5px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
              <span className="h-px flex-1 bg-[var(--color-border-subtle)]" />
              or with email
              <span className="h-px flex-1 bg-[var(--color-border-subtle)]" />
            </div>
          )}

          {showEmail && (
          <form className="flex flex-col gap-4" onSubmit={onEmailSubmit}>
            <Input
              label="Work email"
              type="email"
              autoComplete="username"
              placeholder="you@caremol.health"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              iconLeft={<AtSign className="size-4" />}
              required
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              placeholder="•••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              iconLeft={<KeyRound className="size-4" />}
              required
            />

            <div className="flex items-center justify-between -mt-1">
              <button
                type="button"
                onClick={onReset}
                className="text-[12.5px] font-medium text-[var(--color-accent-hover)] hover:underline"
              >
                Forgot password?
              </button>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={busy}
              iconRight={!busy && <ArrowRight className="size-4" />}
            >
              Sign in
            </Button>
          </form>
          )}

          {info && (
            <Badge tone="completed" dot className="self-start">
              {info}
            </Badge>
          )}
          {error && (
            <div className="text-[12.5px] leading-relaxed text-[var(--color-status-danger)] bg-[var(--color-status-danger-bg)] border border-[var(--color-status-danger-ring)] rounded-[var(--radius-md)] px-3 py-2 break-words">
              {error}
            </div>
          )}

          <p className="text-[11.5px] text-[var(--color-text-tertiary)] leading-relaxed">
            Customers booking lab tests should use the WhatsApp bot — this portal is for CareMol staff.
          </p>

          {!isAuthReady && (
            <div className="flex items-center gap-2 text-[12px] text-[var(--color-text-tertiary)]">
              <Loader2 className="size-3.5 animate-spin" /> Connecting…
            </div>
          )}
        </div>
      </section>

      {/* Brand panel — hidden on small screens */}
      <aside
        className={cn(
          'relative hidden lg:flex items-center justify-center overflow-hidden',
          'border-l border-[var(--color-border-subtle)]',
        )}
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(13,148,136,0.18), transparent 40%),' +
            'radial-gradient(circle at 80% 70%, rgba(13,148,136,0.10), transparent 45%),' +
            'linear-gradient(180deg, var(--color-sunken) 0%, var(--color-canvas) 100%)',
        }}
        aria-hidden
      >
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              'linear-gradient(var(--color-border-subtle) 1px, transparent 1px),' +
              'linear-gradient(90deg, var(--color-border-subtle) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 70%)',
          }}
        />
        <div className="relative z-10 max-w-[420px] px-10 text-center">
          <Badge tone="accent" className="mb-6 mx-auto">
            <span className="size-1.5 rounded-full bg-[var(--color-accent)] mr-1" />
            Operations workspace
          </Badge>
          <blockquote className="text-[22px] leading-[1.35] font-medium tracking-tight text-[var(--color-text-primary)]">
            “Every booking, every collection, every report — visible at a glance.”
          </blockquote>
          <p className="mt-5 text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
            A single, calm dashboard for the entire CareMol home-collection workflow. Designed for clarity under pressure.
          </p>

          <div className="mt-10 grid grid-cols-3 gap-3 text-left">
            {[
              { k: 'Avg slot', v: '7am — 9pm' },
              { k: 'Centre', v: 'Melattur' },
              { k: 'Pin', v: '679326' },
            ].map((s) => (
              <div
                key={s.k}
                className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-3 py-2"
              >
                <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
                  {s.k}
                </div>
                <div className="text-[13px] font-medium text-[var(--color-text-primary)] tabular-nums">
                  {s.v}
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
