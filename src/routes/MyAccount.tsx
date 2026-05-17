import { useMemo, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { CheckCircle2, KeyRound, User as UserIcon } from 'lucide-react';
import { Page, PageHeader } from '../shell/Page';
import { Card, CardHeader, CardBody, Button, Input, Badge } from '../ui';
import { useAuth } from '../context/AuthContext';
import { useOwnStaff } from '../hooks/useOwnStaff';
import { useBookingConfig } from '../hooks/useBookingConfig';
import type { WeeklySchedule } from '../types';
import { formatSlotLabel } from '../services/slotService';

const WEEKDAYS: { key: keyof WeeklySchedule; label: string }[] = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

export function MyAccountRoute() {
  const { user, role, isPasswordUser, changePassword } = useAuth();
  const { staff } = useOwnStaff(user);
  const config = useBookingConfig();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const displayName = useMemo(() => {
    return staff?.name || user?.displayName || user?.email?.split('@')[0] || 'You';
  }, [staff, user]);

  if (!user) return <Navigate to="/sign-in" replace />;

  const onSubmitPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from the current one.');
      return;
    }
    setSubmitting(true);
    const result = await changePassword(newPassword, currentPassword);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error || 'Could not change password.');
      return;
    }
    setSuccess(true);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  return (
    <Page maxWidth="md">
      <PageHeader
        title="My Account"
        description="Your profile details and password."
      />

      <div className="space-y-5 sm:space-y-6">
        <Card>
          <CardHeader title="Profile" />
          <CardBody className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="size-12 rounded-full bg-[var(--color-sunken)] border border-[var(--color-border-subtle)] flex items-center justify-center text-[var(--color-accent-hover)]">
                <UserIcon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[15px] font-semibold tracking-tight text-[var(--color-text-primary)]">{displayName}</div>
                <div className="text-[12.5px] text-[var(--color-text-secondary)] flex items-center gap-2 flex-wrap">
                  {user.email && <span>{user.email}</span>}
                  {role && (
                    <Badge tone={role === 'admin' ? 'accent' : role === 'phlebotomist' ? 'assigned' : 'neutral'}>
                      {role}
                    </Badge>
                  )}
                  {staff && staff.active === false && (
                    <Badge tone="danger">Inactive</Badge>
                  )}
                </div>
              </div>
            </div>
            {staff?.phone && (
              <div className="text-[13px] text-[var(--color-text-secondary)]">
                <span className="font-medium text-[var(--color-text-primary)]">Phone: </span>
                <span className="font-mono">{staff.phone}</span>
              </div>
            )}
            {staff?.defaultSchedule && (
              <div>
                <div className="text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-[0.06em] mb-2">
                  Default Weekly Schedule
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {WEEKDAYS.map(({ key, label }) => {
                    const phlebStarts = staff.defaultSchedule?.[key] ?? [];
                    const dayTemplate = config.slotsByWeekday?.[key] ?? config.slots;
                    const visible = dayTemplate.filter((s) => phlebStarts.includes(s.start));
                    const off = visible.length === 0;
                    return (
                      <div
                        key={key}
                        className={`rounded-md border px-1.5 py-1.5 text-center min-h-[58px] ${
                          off
                            ? 'bg-[var(--color-sunken)] border-[var(--color-border-subtle)] text-[var(--color-text-secondary)]'
                            : 'bg-[var(--color-surface)] border-[var(--color-border-subtle)]'
                        }`}
                      >
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">{label}</div>
                        {off ? (
                          <div className="text-[10px] mt-1 italic">Off</div>
                        ) : (
                          <div className="mt-1 space-y-0.5">
                            {visible.map((s) => (
                              <div key={s.start} className="text-[9.5px] tabular-nums leading-tight text-[var(--color-text-primary)]">
                                {formatSlotLabel(s)}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <KeyRound className="w-4 h-4" /> Change Password
              </span>
            }
            subtitle={
              isPasswordUser
                ? 'Enter your current password and the new one.'
                : 'Your account uses Google sign-in. Password change is not applicable.'
            }
          />
          {isPasswordUser ? (
            <CardBody>
              <form onSubmit={onSubmitPassword} className="space-y-4 max-w-md">
                <Input
                  type="password"
                  label="Current password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
                <Input
                  type="password"
                  label="New password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  hint="Minimum 6 characters."
                  required
                />
                <Input
                  type="password"
                  label="Confirm new password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                {error && (
                  <div className="text-[12.5px] text-[var(--color-status-danger)] bg-[var(--color-status-danger-bg)] border border-[var(--color-status-danger-ring)] rounded-md px-3 py-2">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="text-[12.5px] text-[var(--color-status-completed)] bg-[var(--color-status-completed-bg)] border border-[var(--color-status-completed-ring)] rounded-md px-3 py-2 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Password updated successfully.
                  </div>
                )}
                <div>
                  <Button type="submit" variant="primary" loading={submitting}>
                    Update password
                  </Button>
                </div>
              </form>
            </CardBody>
          ) : (
            <CardBody>
              <p className="text-[13px] text-[var(--color-text-secondary)]">
                You're signed in with Google. Manage your password in your Google account.
              </p>
            </CardBody>
          )}
        </Card>
      </div>
    </Page>
  );
}
