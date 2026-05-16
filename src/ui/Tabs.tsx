import type { ReactNode } from 'react';
import { cn } from './cn';

export interface TabItem<T extends string = string> {
  value: T;
  label: ReactNode;
  count?: number;
  disabled?: boolean;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
  variant?: 'underline' | 'pill';
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
  variant = 'underline',
}: TabsProps<T>) {
  if (variant === 'pill') {
    return (
      <div
        role="tablist"
        className={cn(
          'inline-flex items-center gap-1 p-1',
          'bg-[var(--color-sunken)] rounded-[var(--radius-md)]',
          'border border-[var(--color-border-subtle)]',
          className,
        )}
      >
        {items.map((item) => {
          const active = item.value === value;
          return (
            <button
              key={item.value}
              role="tab"
              aria-selected={active}
              disabled={item.disabled}
              onClick={() => onChange(item.value)}
              className={cn(
                'inline-flex items-center gap-1.5 h-8 px-3 rounded-[var(--radius-sm)]',
                'text-[13px] font-medium tracking-tight transition-colors',
                active
                  ? 'bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-[var(--shadow-xs)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
                item.disabled && 'opacity-50 cursor-not-allowed',
              )}
            >
              {item.label}
              {typeof item.count === 'number' && (
                <span className="text-[11px] tabular-nums text-[var(--color-text-tertiary)]">
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="tablist"
      className={cn(
        'flex items-center gap-1 border-b border-[var(--color-border-subtle)] overflow-x-auto scrollbar-none',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={cn(
              'relative inline-flex items-center gap-1.5 h-10 px-3.5 text-[13.5px] font-medium tracking-tight',
              'transition-colors whitespace-nowrap',
              active
                ? 'text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
              item.disabled && 'opacity-50 cursor-not-allowed',
            )}
          >
            {item.label}
            {typeof item.count === 'number' && (
              <span
                className={cn(
                  'min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full text-[10px] tabular-nums',
                  active
                    ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-hover)]'
                    : 'bg-[var(--color-sunken)] text-[var(--color-text-secondary)]',
                )}
              >
                {item.count}
              </span>
            )}
            {active && (
              <span
                className="absolute inset-x-2 -bottom-px h-[2px] bg-[var(--color-accent)] rounded-full"
                aria-hidden
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
