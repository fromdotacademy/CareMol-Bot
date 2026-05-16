import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from './cn';

export function TableScroll({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'w-full overflow-x-auto scroll-area',
        'border border-[var(--color-border-subtle)] rounded-[var(--radius-lg)]',
        'bg-[var(--color-surface)]',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Table({ className, children, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <table
      className={cn('w-full border-collapse text-sm', className)}
      {...rest}
    >
      {children}
    </table>
  );
}

export function THead({ className, children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        'bg-[var(--color-sunken)] text-[var(--color-text-secondary)]',
        'text-[11px] uppercase tracking-[0.06em] font-medium',
        className,
      )}
      {...rest}
    >
      {children}
    </thead>
  );
}

export function TBody({ className, children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      className={cn('divide-y divide-[var(--color-border-subtle)]', className)}
      {...rest}
    >
      {children}
    </tbody>
  );
}

interface TrProps extends HTMLAttributes<HTMLTableRowElement> {
  interactive?: boolean;
  selected?: boolean;
}

export function Tr({ interactive, selected, className, children, ...rest }: TrProps) {
  return (
    <tr
      className={cn(
        interactive && 'cursor-pointer transition-colors hover:bg-[var(--color-sunken)]',
        selected && 'bg-[var(--color-accent-soft)]',
        className,
      )}
      {...rest}
    >
      {children}
    </tr>
  );
}

interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'right' | 'center';
}

export function Th({ align = 'left', className, children, scope = 'col', ...rest }: ThProps) {
  return (
    <th
      scope={scope}
      className={cn(
        'px-3.5 py-2.5 font-medium',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'right' | 'center';
  mono?: boolean;
  tabular?: boolean;
}

export function Td({ align = 'left', mono, tabular, className, children, ...rest }: TdProps) {
  return (
    <td
      className={cn(
        'px-3.5 py-3 text-[13.5px] text-[var(--color-text-primary)] align-middle',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        mono && 'font-mono text-[12.5px]',
        tabular && 'tabular-nums',
        className,
      )}
      {...rest}
    >
      {children}
    </td>
  );
}
