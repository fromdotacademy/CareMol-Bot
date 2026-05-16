import type { HTMLAttributes } from 'react';
import { cn } from './cn';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  width?: number | string;
  height?: number | string;
  rounded?: 'sm' | 'md' | 'lg' | 'full';
}

export function Skeleton({ width, height, rounded = 'md', className, style, ...rest }: SkeletonProps) {
  const radius = {
    sm: 'rounded-[var(--radius-sm)]',
    md: 'rounded-[var(--radius-md)]',
    lg: 'rounded-[var(--radius-lg)]',
    full: 'rounded-full',
  }[rounded];

  return (
    <div
      className={cn(
        'animate-pulse bg-[var(--color-sunken)] border border-[var(--color-border-subtle)]/60',
        radius,
        className,
      )}
      style={{ width, height, ...style }}
      {...rest}
    />
  );
}
