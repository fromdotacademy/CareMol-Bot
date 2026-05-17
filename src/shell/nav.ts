import type { ComponentType, SVGProps } from 'react';
import {
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  MessageSquare,
  Settings as SettingsIcon,
  UsersRound,
  UserCog,
  CircleUser,
} from 'lucide-react';
import type { ResolvedRole } from '../hooks/useStaffRole';

export type NavGroupId = 'operations' | 'people' | 'tools' | 'system';

export interface NavItem {
  to: string;
  label: string;
  shortLabel?: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  group: NavGroupId;
  /** Which roles can see this item. */
  roles: ReadonlyArray<ResolvedRole>;
}

export const NAV_GROUPS: Record<NavGroupId, { id: NavGroupId; label: string }> = {
  operations: { id: 'operations', label: 'Operations' },
  people: { id: 'people', label: 'People' },
  tools: { id: 'tools', label: 'Tools' },
  system: { id: 'system', label: 'System' },
};

export const NAV_ITEMS: NavItem[] = [
  {
    to: '/bookings',
    label: 'Bookings',
    icon: LayoutDashboard,
    group: 'operations',
    roles: ['admin'],
  },
  {
    to: '/queue',
    label: 'My Queue',
    shortLabel: 'Queue',
    icon: ClipboardList,
    group: 'operations',
    roles: ['phlebotomist'],
  },
  {
    to: '/schedule',
    label: 'Schedule',
    icon: CalendarDays,
    group: 'operations',
    roles: ['admin'],
  },
  {
    to: '/patients',
    label: 'Patients',
    icon: UsersRound,
    group: 'people',
    roles: ['admin'],
  },
  {
    to: '/staff',
    label: 'Staff',
    icon: UserCog,
    group: 'people',
    roles: ['admin'],
  },
  {
    to: '/simulator',
    label: 'Bot Simulator',
    shortLabel: 'Simulator',
    icon: MessageSquare,
    group: 'tools',
    roles: ['admin', 'customer'],
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: SettingsIcon,
    group: 'system',
    roles: ['admin'],
  },
  {
    to: '/me',
    label: 'My Account',
    shortLabel: 'Account',
    icon: CircleUser,
    group: 'system',
    roles: ['admin', 'phlebotomist'],
  },
];

/** Returns the nav items visible to the given role, preserving declared order. */
export function visibleNavItems(role: ResolvedRole | null): NavItem[] {
  if (!role) return [];
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

/** Default landing route per role. */
export function defaultRouteForRole(role: ResolvedRole | null): string {
  if (role === 'admin') return '/bookings';
  if (role === 'phlebotomist') return '/queue';
  return '/simulator';
}
