import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  as?: 'div' | 'section' | 'article';
  padded?: boolean;
  flush?: boolean; // remove default border for nested cards
  interactive?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { padded = false, flush = false, interactive = false, className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      data-themed
      className={cn(
        'bg-[var(--color-surface)] rounded-[var(--radius-lg)]',
        !flush && 'border border-[var(--color-border-subtle)]',
        padded && 'p-5',
        interactive && 'transition-shadow hover:shadow-[var(--shadow-sm)]',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});

interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

export function CardHeader({ title, subtitle, actions, className, children, ...rest }: CardHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 px-5 pt-5 pb-4',
        'border-b border-[var(--color-border-subtle)]',
        className,
      )}
      {...rest}
    >
      <div className="min-w-0">
        {title && (
          <h3 className="text-[15px] font-semibold tracking-tight text-[var(--color-text-primary)]">
            {title}
          </h3>
        )}
        {subtitle && (
          <p className="mt-0.5 text-[13px] text-[var(--color-text-secondary)]">{subtitle}</p>
        )}
        {children}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('p-5', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 px-5 py-4',
        'border-t border-[var(--color-border-subtle)]',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
