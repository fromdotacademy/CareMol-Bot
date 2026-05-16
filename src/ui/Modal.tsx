import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from './cn';
import { IconButton } from './Button';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children?: ReactNode;
  /**
   * When true (default), modal becomes a bottom-sheet on small screens.
   */
  mobileSheet?: boolean;
  className?: string;
}

const sizeMap = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  size = 'md',
  mobileSheet = true,
  children,
  className,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // lock body scroll
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open && dialogRef.current) {
      const focusable = dialogRef.current.querySelector<HTMLElement>(
        'input, button, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    }
  }, [open]);

  if (!open) return null;

  const node = (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      <div
        className="absolute inset-0 bg-[var(--color-overlay)] backdrop-blur-[2px] animate-in fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={dialogRef}
        className={cn(
          'relative w-full bg-[var(--color-surface)] shadow-[var(--shadow-lg)]',
          'border-t border-[var(--color-border-subtle)] sm:border',
          'flex flex-col max-h-[92vh]',
          mobileSheet
            ? 'rounded-t-[var(--radius-xl-2)] sm:rounded-[var(--radius-lg)]'
            : 'rounded-[var(--radius-lg)]',
          sizeMap[size],
          className,
        )}
      >
        {mobileSheet && (
          <div className="flex sm:hidden justify-center pt-2.5 pb-1" aria-hidden>
            <span className="h-1 w-9 rounded-full bg-[var(--color-border-strong)]" />
          </div>
        )}
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 border-b border-[var(--color-border-subtle)]">
            <div className="min-w-0">
              {title && (
                <h2
                  id="modal-title"
                  className="text-[16px] font-semibold tracking-tight text-[var(--color-text-primary)]"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">{description}</p>
              )}
            </div>
            <IconButton label="Close" onClick={onClose} size="sm" variant="ghost">
              <X className="size-4" />
            </IconButton>
          </div>
        )}
        <div className="flex-1 overflow-y-auto scroll-area px-5 py-4">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface)] flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
