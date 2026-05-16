import type { ReactNode } from 'react';
import { cn } from './cn';

interface AvatarProps {
  name?: string | null;
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  tone?: 'neutral' | 'accent';
  className?: string;
  children?: ReactNode;
}

const sizeMap: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-[11px]',
  md: 'size-10 text-[13px]',
  lg: 'size-12 text-[15px]',
};

function initialsFromName(name: string | null | undefined): string {
  if (!name) return '·';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ name, src, size = 'md', tone = 'neutral', className, children }: AvatarProps) {
  const base = cn(
    'inline-flex items-center justify-center rounded-full font-medium tracking-tight uppercase',
    'border border-[var(--color-border-subtle)]',
    tone === 'accent'
      ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-hover)]'
      : 'bg-[var(--color-sunken)] text-[var(--color-text-secondary)]',
    sizeMap[size],
    className,
  );

  if (src) {
    return (
      <span className={cn(base, 'overflow-hidden p-0')}>
        <img src={src} alt={name ?? ''} className="size-full object-cover" />
      </span>
    );
  }

  return <span className={base}>{children ?? initialsFromName(name)}</span>;
}

interface AvatarStackProps {
  names: (string | null | undefined)[];
  size?: AvatarProps['size'];
  max?: number;
}

export function AvatarStack({ names, size = 'sm', max = 3 }: AvatarStackProps) {
  const visible = names.slice(0, max);
  const extra = Math.max(0, names.length - visible.length);
  return (
    <span className="inline-flex -space-x-2">
      {visible.map((n, i) => (
        <Avatar key={i} name={n} size={size} className="ring-2 ring-[var(--color-surface)]" />
      ))}
      {extra > 0 && (
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-full ring-2 ring-[var(--color-surface)]',
            'bg-[var(--color-sunken)] text-[var(--color-text-secondary)] font-medium tabular-nums',
            sizeMap[size ?? 'sm'],
          )}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}
