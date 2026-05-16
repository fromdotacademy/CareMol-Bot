import type { ReactNode } from 'react';
import { cn } from './cn';

interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({ icon, title, description, action, className, compact }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-10 px-6 gap-3' : 'py-16 px-6 gap-4',
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            'flex items-center justify-center rounded-full',
            'bg-[var(--color-sunken)] text-[var(--color-text-tertiary)]',
            'border border-[var(--color-border-subtle)]',
            compact ? 'size-10' : 'size-12',
          )}
        >
          {icon}
        </div>
      )}
      <div className="max-w-sm">
        <h3 className="text-[15px] font-semibold tracking-tight text-[var(--color-text-primary)]">
          {title}
        </h3>
        {description && (
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
