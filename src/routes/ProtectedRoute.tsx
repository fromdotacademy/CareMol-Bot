import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { defaultRouteForRole, NAV_ITEMS } from '../shell/nav';

/**
 * Auth + role gate for all in-shell routes.
 * - Unauthenticated → /sign-in
 * - Authenticated but role-loading → spinner
 * - Authenticated but route not allowed for current role → redirect to role's default
 */
export function ProtectedRoute() {
  const { user, isAuthReady, role, roleLoading } = useAuth();
  const location = useLocation();

  if (!isAuthReady) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[var(--color-canvas)]">
        <Loader2 className="size-5 animate-spin text-[var(--color-accent)]" />
      </div>
    );
  }
  if (!user) return <Navigate to="/sign-in" replace />;
  if (roleLoading) {
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
