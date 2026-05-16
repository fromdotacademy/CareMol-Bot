import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../ui';

interface PageProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  /** Constrain max width. Default: none (full-bleed). */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  /** Remove default vertical/horizontal padding. */
  flush?: boolean;
}

const maxWidthMap: Record<NonNullable<PageProps['maxWidth']>, string> = {
  sm: 'max-w-3xl',
  md: 'max-w-5xl',
  lg: 'max-w-6xl',
  xl: 'max-w-[1400px]',
  '2xl': 'max-w-[1600px]',
  full: 'max-w-none',
};

/**
 * Standard page container. Provides consistent gutters and vertical rhythm
 * across every route inside <AppShell />. Default is full-bleed at any width.
 */
export function Page({ children, className, maxWidth = 'full', flush, ...rest }: PageProps) {
  return (
    <div
      className={cn(
        flush ? '' : 'px-4 sm:px-6 lg:px-8 py-5 sm:py-6 lg:py-8',
        'mx-auto w-full',
        maxWidthMap[maxWidth],
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * Standard page header. Title left, action cluster right, optional description below title.
 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-4 mb-5 sm:mb-6',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-[22px] sm:text-[26px] font-semibold tracking-tight leading-[1.2] text-[var(--color-text-primary)]">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--color-text-secondary)] max-w-[70ch]">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}
