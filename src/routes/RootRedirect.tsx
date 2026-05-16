import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { defaultRouteForRole } from '../shell/nav';

export function RootRedirect() {
  const { user, roleLoading, role } = useAuth();
  if (!user) return <Navigate to="/sign-in" replace />;
  if (roleLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center py-20">
        <Loader2 className="size-5 animate-spin text-[var(--color-accent)]" />
      </div>
    );
  }
  return <Navigate to={defaultRouteForRole(role)} replace />;
}
