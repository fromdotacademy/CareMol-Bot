import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] active:bg-[var(--color-accent-hover)] disabled:opacity-50',
  secondary:
    'bg-[var(--color-sunken)] text-[var(--color-text-primary)] hover:bg-[var(--color-border-subtle)] border border-[var(--color-border-subtle)] disabled:opacity-50',
  outline:
    'bg-transparent text-[var(--color-text-primary)] border border-[var(--color-border-strong)] hover:bg-[var(--color-sunken)] disabled:opacity-50',
  ghost:
    'bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-sunken)] hover:text-[var(--color-text-primary)] disabled:opacity-50',
  danger:
    'bg-[var(--color-status-danger)] text-white hover:opacity-90 disabled:opacity-50',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-[var(--radius-sm)]',
  md: 'h-10 px-4 text-sm gap-2 rounded-[var(--radius-md)]',
  lg: 'h-11 px-5 text-[15px] gap-2 rounded-[var(--radius-md)]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading,
    iconLeft,
    iconRight,
    fullWidth,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium tracking-tight whitespace-nowrap select-none',
        'transition-colors duration-150 ease-out',
        'focus-visible:outline-none',
        'disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        iconLeft && <span className="inline-flex shrink-0">{iconLeft}</span>
      )}
      {children && <span className="truncate">{children}</span>}
      {!loading && iconRight && <span className="inline-flex shrink-0">{iconRight}</span>}
    </button>
  );
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  label: string; // required for a11y
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'ghost', size = 'md', label, className, children, type = 'button', ...rest },
  ref,
) {
  const dims = size === 'sm' ? 'size-8' : size === 'lg' ? 'size-11' : 'size-10';
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center',
        'transition-colors duration-150 ease-out',
        'rounded-[var(--radius-md)] focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variantClasses[variant],
        dims,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
