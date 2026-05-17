import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { defaultRouteForRole, NAV_ITEMS } from '../shell/nav';
import { getHostMode, urlForHostMode } from '../lib/hostMode';

/**
 * Auth + role gate for all in-shell routes.
 * - Unauthenticated → /sign-in
 * - Authenticated but role-loading → spinner
 * - Authenticated but role doesn't match the host (admin.* vs staff.*) → sign out
 *   and bounce to the correct host with ?wrongHost=1 so the SignIn page can
 *   explain. The host gate is UX only — Firestore rules remain the real
 *   permission boundary.
 * - Authenticated but route not allowed for current role → redirect to role's default
 */
export function ProtectedRoute() {
  const { user, isAuthReady, role, roleLoading, logout } = useAuth();
  const location = useLocation();
  const hostMode = getHostMode();

  // Cross-host bounce — fires once role is resolved and the role doesn't match
  // the subdomain (admin.* expects role='admin'; staff.* expects 'phlebotomist').
  // 'open' hosts (caremol.in / previews / localhost) skip this entirely.
  const needsBounce =
    !!user &&
    !!role &&
    !roleLoading &&
    ((hostMode === 'admin' && role !== 'admin') ||
      (hostMode === 'staff' && role !== 'phlebotomist'));

  useEffect(() => {
    if (!needsBounce) return;
    const target = hostMode === 'admin' ? 'staff' : 'admin';
    (async () => {
      try { await logout(); } catch { /* still bounce */ }
      window.location.replace(`${urlForHostMode(target)}/sign-in?wrongHost=1`);
    })();
  }, [needsBounce, hostMode, logout]);

  if (!isAuthReady) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[var(--color-canvas)]">
        <Loader2 className="size-5 animate-spin text-[var(--color-accent)]" />
      </div>
    );
  }
  if (!user) return <Navigate to="/sign-in" replace />;
  if (roleLoading || needsBounce) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[var(--color-canvas)]">
        <Loader2 className="size-5 animate-spin text-[var(--color-accent)]" />
      </div>
    );
  }

  // Path-based role check
  const allowed = NAV_ITEMS.find((n) => location.pathname === n.to || location.pathname.startsWith(n.to + '/'));
  if (allowed && role && !allowed.roles.includes(role)) {
    return <Navigate to={defaultRouteForRole(role)} replace />;
  }

  return <Outlet />;
}
