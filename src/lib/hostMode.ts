// Host-based sign-in mode for the deployed admin/staff subdomains.
//
// One Vercel deployment serves multiple domains:
//   - admin.caremol.in  -> admin-only sign-in (Google)
//   - staff.caremol.in  -> phleb-only sign-in (email/password)
//   - anything else     -> 'open' (both methods, no host/role bounce). This
//                          covers caremol.in directly, Vercel preview URLs,
//                          and localhost so dev never gets blocked.
//
// The host gate is UX only — auth + Firestore rules remain the real boundary.

export type HostMode = 'admin' | 'staff' | 'open';

export function getHostMode(): HostMode {
  if (typeof window === 'undefined') return 'open';
  const h = window.location.hostname.toLowerCase();
  if (h.startsWith('admin.')) return 'admin';
  if (h.startsWith('staff.')) return 'staff';
  return 'open';
}

// Full URLs the host-mismatch bounce points to. Production hosts only —
// 'open' callers never bounce.
const HOST_URLS: Record<Exclude<HostMode, 'open'>, string> = {
  admin: 'https://admin.caremol.in',
  staff: 'https://staff.caremol.in',
};

export function urlForHostMode(mode: 'admin' | 'staff'): string {
  return HOST_URLS[mode];
}

export function hostLabel(mode: HostMode): string {
  if (mode === 'admin') return 'admin.caremol.in';
  if (mode === 'staff') return 'staff.caremol.in';
  return '';
}
