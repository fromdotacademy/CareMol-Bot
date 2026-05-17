import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { visibleNavItems } from './nav';
import { cn } from '../ui';

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
}

export function MobileNav({ open, onClose }: MobileNavProps) {
  const { role, user, logout } = useAuth();
  const items = visibleNavItems(role);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] md:hidden" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-[var(--color-overlay)] backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <nav
        className={cn(
          'absolute inset-y-0 left-0 w-[78%] max-w-[300px] bg-[var(--color-surface)]',
          'border-r border-[var(--color-border-subtle)] shadow-[var(--shadow-lg)] flex flex-col',
        )}
      >
        <div className="h-14 px-4 flex items-center gap-2 border-b border-[var(--color-border-subtle)]">
          <div className="flex size-8 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent)] text-white font-semibold">
            C
          </div>
          <div>
            <div className="text-[14px] font-semibold tracking-tight text-[var(--color-text-primary)] leading-tight">
              CareMol
            </div>
            <div className="text-[11px] text-[var(--color-text-tertiary)] leading-tight">
              Lab Operations
            </div>
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 h-11 px-3 rounded-[var(--radius-md)] text-[14px] font-medium tracking-tight',
                      isActive
                        ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-hover)]'
                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-sunken)] hover:text-[var(--color-text-primary)]',
                    )
                  }
                >
                  <Icon className="size-[18px]" />
                  {item.label}
                </NavLink>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-[var(--color-border-subtle)] p-2">
          {user && (
            <div className="px-3 py-1.5 text-[11px] text-[var(--color-text-tertiary)] truncate">
              Signed in as <span className="text-[var(--color-text-secondary)] font-medium">{user.email || user.displayName || 'user'}</span>
            </div>
          )}
          <button
            type="button"
            onClick={async () => { onClose(); await logout(); }}
            className="w-full flex items-center gap-3 h-11 px-3 rounded-[var(--radius-md)] text-[14px] font-medium tracking-tight text-[var(--color-status-danger)] hover:bg-[var(--color-status-danger-bg)] transition-colors"
          >
            <LogOut className="size-[18px]" />
            Sign out
          </button>
        </div>
      </nav>
    </div>,
    document.body,
  );
}

/**
 * Bottom tab bar — visible on mobile only.
 * Shows up to 5 top items; the simulator is pinned in the middle for thumb access.
 */
export function MobileBottomBar() {
  const { role } = useAuth();
  const items = visibleNavItems(role).slice(0, 5);

  return (
    <nav
      data-themed
      className={cn(
        'md:hidden fixed inset-x-0 bottom-0 z-30 h-16',
        'bg-[var(--color-surface)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-surface)]/85',
        'border-t border-[var(--color-border-subtle)]',
        'flex items-stretch justify-around',
        'pb-[env(safe-area-inset-bottom)]',
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 text-[10.5px] font-medium tracking-tight',
                isActive
                  ? 'text-[var(--color-accent)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
              )
            }
          >
            <Icon className="size-[19px]" />
            <span className="truncate max-w-[64px]">{item.shortLabel ?? item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
