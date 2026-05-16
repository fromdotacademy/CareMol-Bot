import { Navigate } from 'react-router-dom';
import { PhlebotomistDashboard } from '../App';
import { useAuth } from '../context/AuthContext';
import { useErrorBoundary } from '../context/ErrorContext';
import { Page } from '../shell/Page';

export function QueueRoute() {
  const { user } = useAuth();
  const { setDbError } = useErrorBoundary();
  if (!user) return <Navigate to="/sign-in" replace />;
  return (
    <Page>
      <PhlebotomistDashboard user={user} onError={setDbError} />
    </Page>
  );
}
