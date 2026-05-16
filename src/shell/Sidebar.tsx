import { NavLink } from 'react-router-dom';
import { ChevronsLeft, LogOut, Moon, Sun, User as UserIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../hooks/useTheme';
import { cn, IconButton } from '../ui';
import { NAV_GROUPS, visibleNavItems, type NavGroupId } from './nav';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onItemClick?: () => void;
}

export function Sidebar({ collapsed, onToggleCollapse, onItemClick }: SidebarProps) {
  const { user, role, logout } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const items = visibleNavItems(role);

  const groupOrder: NavGroupId[] = ['operations', 'people', 'tools', 'system'];

  return (
    <aside
      data-themed
      className={cn(
        'flex h-full flex-col bg-[var(--color-surface)] border-r border-[var(--color-border-subtle)]',
        'transition-[width] duration-200 ease-out',
        collapsed ? 'w-[68px]' : 'w-[240px]',
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          'flex items-center h-14 px-3 border-b border-[var(--color-border-subtle)]',
          collapsed ? 'justify-center' : 'justify-between',
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex shrink-0 size-8 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent)] text-white font-semibold tracking-tight">
            C
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-[14px] font-semibold tracking-tight text-[var(--color-text-primary)] leading-tight">
                CareMol
              </div>
              <div className="text-[11px] text-[var(--color-text-tertiary)] leading-tight">
                Lab Operations
              </div>
            </div>
          )}
        </div>
        {!collapsed && (
          <IconButton label="Collapse sidebar" size="sm" variant="ghost" onClick={onToggleCollapse}>
            <ChevronsLeft className="size-4" />
          </IconButton>
        )}
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto scroll-area py-3">
        {groupOrder.map((groupId) => {
          const groupItems = items.filter((i) => i.group === groupId);
          if (groupItems.length === 0) return null;
          return (
            <div key={groupId} className="mb-3">
              {!collapsed && (
                <div className="px-3 mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
                  {NAV_GROUPS[groupId].label}
                </div>
              )}
              <ul className="flex flex-col gap-0.5 px-2">
                {groupItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        onClick={onItemClick}
                        className={({ isActive }) =>
                          cn(
                            'group relative flex items-center gap-2.5 h-9 rounded-[var(--radius-md)] text-[13.5px] font-medium tracking-tight',
                            'transition-colors',
                            collapsed ? 'justify-center px-0' : 'px-2.5',
                            isActive
                              ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-hover)]'
                              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-sunken)] hover:text-[var(--color-text-primary)]',
                          )
                        }
                        title={collapsed ? item.label : undefined}
                      >
                        <Icon className="size-[17px] shrink-0" aria-hidden />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Footer — user + theme */}
      <div
        className={cn(
          'border-t border-[var(--color-border-subtle)] p-2 flex flex-col gap-1',
          collapsed && 'items-center',
        )}
      >
        <button
          onClick={toggleTheme}
          className={cn(
            'flex items-center gap-2.5 h-9 rounded-[var(--radius-md)] text-[13px] font-medium',
            'text-[var(--color-text-secondary)] hover:bg-[var(--color-sunken)] hover:text-[var(--color-text-primary)] transition-colors',
            collapsed ? 'justify-center w-9' : 'px-2.5 w-full',
          )}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? <Sun className="size-[17px]" /> : <Moon className="size-[17px]" />}
          {!collapsed && <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
        </button>

        <div
          className={cn(
            'flex items-center gap-2 rounded-[var(--radius-md)] px-1.5 py-1',
            collapsed ? 'flex-col gap-1.5 p-1' : '',
          )}
        >
          <div className="flex shrink-0 size-8 items-center justify-center rounded-full bg-[var(--color-sunken)] border border-[var(--color-border-subtle)] overflow-hidden text-[var(--color-text-secondary)]">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
            ) : (
              <UserIcon className="size-4" />
            )}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium tracking-tight text-[var(--color-text-primary)] truncate">
                {user?.displayName || user?.email?.split('@')[0] || 'Signed in'}
              </div>
              <div className="text-[11px] text-[var(--color-text-tertiary)] truncate capitalize">
                {role ?? '—'}
              </div>
            </div>
          )}
          <IconButton label="Sign out" size="sm" variant="ghost" onClick={logout}>
            <LogOut className="size-4" />
          </IconButton>
        </div>
      </div>
    </aside>
  );
}
