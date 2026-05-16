import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export type BadgeTone =
  | 'neutral'
  | 'accent'
  | 'created'
  | 'assigned'
  | 'collected'
  | 'processing'
  | 'completed'
  | 'danger';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  dot?: boolean;
  size?: 'sm' | 'md';
  children?: ReactNode;
}

const toneStyles: Record<BadgeTone, { bg: string; text: string; ring: string; dot: string }> = {
  neutral: {
    bg: 'bg-[var(--color-sunken)]',
    text: 'text-[var(--color-text-secondary)]',
    ring: 'ring-[var(--color-border-subtle)]',
    dot: 'bg-[var(--color-text-tertiary)]',
  },
  accent: {
    bg: 'bg-[var(--color-accent-soft)]',
    text: 'text-[var(--color-accent-hover)]',
    ring: 'ring-[var(--color-accent-soft)]',
    dot: 'bg-[var(--color-accent)]',
  },
  created: {
    bg: 'bg-[var(--color-status-created-bg)]',
    text: 'text-[var(--color-status-created)]',
    ring: 'ring-[var(--color-status-created-ring)]',
    dot: 'bg-[var(--color-status-created)]',
  },
  assigned: {
    bg: 'bg-[var(--color-status-assigned-bg)]',
    text: 'text-[var(--color-status-assigned)]',
    ring: 'ring-[var(--color-status-assigned-ring)]',
    dot: 'bg-[var(--color-status-assigned)]',
  },
  collected: {
    bg: 'bg-[var(--color-status-collected-bg)]',
    text: 'text-[var(--color-status-collected)]',
    ring: 'ring-[var(--color-status-collected-ring)]',
    dot: 'bg-[var(--color-status-collected)]',
  },
  processing: {
    bg: 'bg-[var(--color-status-processing-bg)]',
    text: 'text-[var(--color-status-processing)]',
    ring: 'ring-[var(--color-status-processing-ring)]',
    dot: 'bg-[var(--color-status-processing)]',
  },
  completed: {
    bg: 'bg-[var(--color-status-completed-bg)]',
    text: 'text-[var(--color-status-completed)]',
    ring: 'ring-[var(--color-status-completed-ring)]',
    dot: 'bg-[var(--color-status-completed)]',
  },
  danger: {
    bg: 'bg-[var(--color-status-danger-bg)]',
    text: 'text-[var(--color-status-danger)]',
    ring: 'ring-[var(--color-status-danger-ring)]',
    dot: 'bg-[var(--color-status-danger)]',
  },
};

export function Badge({ tone = 'neutral', dot = false, size = 'sm', className, children, ...rest }: BadgeProps) {
  const style = toneStyles[tone];
  const sizing = size === 'sm' ? 'text-[11px] h-5 px-2 gap-1.5' : 'text-[12px] h-6 px-2.5 gap-1.5';

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium tracking-tight whitespace-nowrap rounded-full',
        'ring-1 ring-inset',
        style.bg,
        style.text,
        style.ring,
        sizing,
        className,
      )}
      {...rest}
    >
      {dot && <span className={cn('size-1.5 rounded-full', style.dot)} aria-hidden />}
      {children}
    </span>
  );
}

/**
 * Map a CareMol booking status string to the semantic badge tone.
 */
export function bookingStatusTone(status: string | undefined | null): BadgeTone {
  switch ((status ?? '').toLowerCase()) {
    case 'created':
      return 'created';
    case 'assigned':
      return 'assigned';
    case 'collected':
      return 'collected';
    case 'processing':
      return 'processing';
    case 'completed':
      return 'completed';
    case 'cancelled':
    case 'failed':
      return 'danger';
    default:
      return 'neutral';
  }
}
