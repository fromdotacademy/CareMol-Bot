import { useState, type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { MobileNav, MobileBottomBar } from './MobileNav';

interface AppShellProps {
  topbarActions?: ReactNode;
}

export function AppShell({ topbarActions }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div
      data-themed
      className="h-screen w-screen bg-[var(--color-canvas)] text-[var(--color-text-primary)] flex overflow-hidden"
    >
      {/* Desktop sidebar */}
      <div className="hidden md:flex shrink-0">
        <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed((p) => !p)} />
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
            className="hidden md:block absolute top-3 left-[72px] z-20 size-6 rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] shadow-[var(--shadow-xs)]"
          >
            ›
          </button>
        )}
      </div>

      {/* Mobile drawer */}
      <MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} actions={topbarActions} />
        <main className="flex-1 overflow-y-auto scroll-area pb-16 md:pb-0">
          <Outlet />
        </main>
        <MobileBottomBar />
      </div>
    </div>
  );
}
