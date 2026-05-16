import type { ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { cn, IconButton } from '../ui';
import { NAV_ITEMS } from './nav';

interface TopbarProps {
  onOpenMobileNav: () => void;
  actions?: ReactNode;
}

function deriveTitleFromPath(pathname: string): string {
  const match = NAV_ITEMS.find((i) => i.to === pathname || pathname.startsWith(i.to + '/'));
  if (match) return match.label;
  if (pathname === '/' || pathname === '') return 'CareMol';
  return pathname.replace(/^\//, '').split('/')[0].replace(/[-_]/g, ' ');
}

export function Topbar({ onOpenMobileNav, actions }: TopbarProps) {
  const { pathname } = useLocation();
  const title = deriveTitleFromPath(pathname);

  return (
    <header
      data-themed
      className={cn(
        'sticky top-0 z-30 h-14 flex items-center justify-between gap-3 px-3 sm:px-5',
        'bg-[var(--color-surface)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-surface)]/85',
        'border-b border-[var(--color-border-subtle)]',
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <IconButton
          label="Open navigation"
          size="sm"
          variant="ghost"
          className="md:hidden"
          onClick={onOpenMobileNav}
        >
          <Menu className="size-5" />
        </IconButton>
        <h1 className="text-[15px] sm:text-[16px] font-semibold tracking-tight text-[var(--color-text-primary)] truncate capitalize">
          {title}
        </h1>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}
