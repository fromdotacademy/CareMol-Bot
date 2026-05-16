import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from './cn';

const fieldShell =
  'w-full bg-[var(--color-surface)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] ' +
  'border border-[var(--color-border-strong)] rounded-[var(--radius-md)] ' +
  'transition-colors duration-150 ' +
  'focus:border-[var(--color-accent)] focus:outline-none focus:ring-0 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

interface BaseFieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>,
    BaseFieldProps {
  size?: 'sm' | 'md';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, optional, iconLeft, iconRight, size = 'md', className, id, ...rest },
  ref,
) {
  const reactId = useId();
  const fieldId = id ?? reactId;
  const heightCls = size === 'sm' ? 'h-9 text-[13px]' : 'h-10 text-sm';

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={fieldId}
          className="text-[13px] font-medium text-[var(--color-text-secondary)] flex items-center gap-1.5"
        >
          {label}
          {optional && (
            <span className="text-[11px] font-normal text-[var(--color-text-tertiary)]">
              (optional)
            </span>
          )}
        </label>
      )}
      <div className="relative">
        {iconLeft && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--color-text-tertiary)]">
            {iconLeft}
          </span>
        )}
        <input
          ref={ref}
          id={fieldId}
          className={cn(
            fieldShell,
            heightCls,
            'px-3',
            iconLeft && 'pl-9',
            iconRight && 'pr-9',
            error && 'border-[var(--color-status-danger)] focus:border-[var(--color-status-danger)]',
            className,
          )}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${fieldId}-desc` : undefined}
          {...rest}
        />
        {iconRight && (
          <span className="absolute inset-y-0 right-3 flex items-center text-[var(--color-text-tertiary)]">
            {iconRight}
          </span>
        )}
      </div>
      {(error || hint) && (
        <p
          id={`${fieldId}-desc`}
          className={cn(
            'text-[12px] leading-tight',
            error ? 'text-[var(--color-status-danger)]' : 'text-[var(--color-text-tertiary)]',
          )}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
});

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'>,
    BaseFieldProps {
  size?: 'sm' | 'md';
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, optional, size = 'md', className, id, children, ...rest },
  ref,
) {
  const reactId = useId();
  const fieldId = id ?? reactId;
  const heightCls = size === 'sm' ? 'h-9 text-[13px]' : 'h-10 text-sm';

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={fieldId}
          className="text-[13px] font-medium text-[var(--color-text-secondary)] flex items-center gap-1.5"
        >
          {label}
          {optional && (
            <span className="text-[11px] font-normal text-[var(--color-text-tertiary)]">
              (optional)
            </span>
          )}
        </label>
      )}
      <select
        ref={ref}
        id={fieldId}
        className={cn(
          fieldShell,
          heightCls,
          'px-3 pr-9 appearance-none bg-no-repeat bg-[right_0.75rem_center] bg-[length:14px]',
          error && 'border-[var(--color-status-danger)] focus:border-[var(--color-status-danger)]',
          className,
        )}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717A' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
        }}
        {...rest}
      >
        {children}
      </select>
      {(error || hint) && (
        <p
          className={cn(
            'text-[12px] leading-tight',
            error ? 'text-[var(--color-status-danger)]' : 'text-[var(--color-text-tertiary)]',
          )}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
});

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement>,
    BaseFieldProps {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, optional, className, id, ...rest },
  ref,
) {
  const reactId = useId();
  const fieldId = id ?? reactId;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={fieldId}
          className="text-[13px] font-medium text-[var(--color-text-secondary)] flex items-center gap-1.5"
        >
          {label}
          {optional && (
            <span className="text-[11px] font-normal text-[var(--color-text-tertiary)]">
              (optional)
            </span>
          )}
        </label>
      )}
      <textarea
        ref={ref}
        id={fieldId}
        className={cn(
          fieldShell,
          'min-h-[80px] text-sm px-3 py-2 resize-y',
          error && 'border-[var(--color-status-danger)] focus:border-[var(--color-status-danger)]',
          className,
        )}
        {...rest}
      />
      {(error || hint) && (
        <p
          className={cn(
            'text-[12px] leading-tight',
            error ? 'text-[var(--color-status-danger)]' : 'text-[var(--color-text-tertiary)]',
          )}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
});
