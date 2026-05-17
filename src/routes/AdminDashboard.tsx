import { useNavigate } from 'react-router-dom';
import { DashboardView, type AdminTab } from '../App';
import { useErrorBoundary } from '../context/ErrorContext';
import { Page } from '../shell/Page';

const TAB_TO_PATH: Record<AdminTab, string> = {
  bookings: '/bookings',
  patients: '/patients',
  staff: '/staff',
  schedule: '/schedule',
  settings: '/settings',
  analytics: '/analytics',
};

function useTabNavigator() {
  const navigate = useNavigate();
  return (next: AdminTab) => navigate(TAB_TO_PATH[next]);
}

function AdminRoute({ tab }: { tab: AdminTab }) {
  const { setDbError } = useErrorBoundary();
  const onTabChange = useTabNavigator();
  return (
    <Page>
      <DashboardView tab={tab} onTabChange={onTabChange} onError={setDbError} />
    </Page>
  );
}

export function BookingsRoute() {
  return <AdminRoute tab="bookings" />;
}
export function PatientsRoute() {
  return <AdminRoute tab="patients" />;
}
export function StaffRoute() {
  return <AdminRoute tab="staff" />;
}
export function ScheduleRoute() {
  return <AdminRoute tab="schedule" />;
}
export function SettingsRoute() {
  return <AdminRoute tab="settings" />;
}
export function AnalyticsRoute() {
  return <AdminRoute tab="analytics" />;
}
