import type { ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from './cn';

interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  trend?: { direction: 'up' | 'down' | 'flat'; value: string };
  accent?: boolean;
  className?: string;
}

export function StatCard({ label, value, hint, icon, trend, accent, className }: StatCardProps) {
  return (
    <div
      data-themed
      className={cn(
        'relative flex flex-col gap-3 rounded-[var(--radius-lg)] border p-4 sm:p-5',
        'bg-[var(--color-surface)] border-[var(--color-border-subtle)]',
        'transition-colors',
        accent && 'bg-[var(--color-accent-soft)] border-[var(--color-accent-soft)]',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-[var(--color-text-secondary)]">
          {label}
        </span>
        {icon && (
          <span
            className={cn(
              'flex items-center justify-center size-7 rounded-[var(--radius-sm)]',
              'bg-[var(--color-sunken)] text-[var(--color-text-secondary)]',
              accent && 'bg-white/60 text-[var(--color-accent-hover)]',
            )}
          >
            {icon}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-[28px] sm:text-[30px] font-semibold tracking-tight tabular-nums text-[var(--color-text-primary)] leading-none">
          {value}
        </span>
        {trend && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-[12px] font-medium tabular-nums',
              trend.direction === 'up' && 'text-[var(--color-status-completed)]',
              trend.direction === 'down' && 'text-[var(--color-status-danger)]',
              trend.direction === 'flat' && 'text-[var(--color-text-tertiary)]',
            )}
          >
            {trend.direction === 'up' && <TrendingUp className="size-3" />}
            {trend.direction === 'down' && <TrendingDown className="size-3" />}
            {trend.direction === 'flat' && <Minus className="size-3" />}
            {trend.value}
          </span>
        )}
      </div>

      {hint && (
        <p className="text-[12.5px] text-[var(--color-text-secondary)] leading-snug">{hint}</p>
      )}
    </div>
  );
}
