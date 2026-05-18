import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

export type ConfirmVariant = 'normal' | 'danger';

export interface ConfirmConfig {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  onConfirm: () => void | Promise<void>;
}

interface ConfirmDialogProps {
  pending: ConfirmConfig | null;
  onClose: () => void;
}

export function ConfirmDialog({ pending, onClose }: ConfirmDialogProps) {
  const variant: ConfirmVariant = pending?.variant ?? 'normal';
  const confirmLabel = pending?.confirmLabel ?? 'Confirm';
  const cancelLabel = pending?.cancelLabel ?? 'Cancel';

  const handleConfirm = async () => {
    if (!pending) return;
    try {
      await pending.onConfirm();
    } finally {
      onClose();
    }
  };

  return (
    <Modal
      open={!!pending}
      onClose={onClose}
      size="sm"
      title={pending?.title}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            size="sm"
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {pending && (
        <div className="flex items-start gap-3">
          {variant === 'danger' && (
            <div className="shrink-0 rounded-full bg-red-50 p-2 text-[var(--color-status-danger)]">
              <AlertTriangle className="size-5" />
            </div>
          )}
          <div className="text-[14px] leading-relaxed text-[var(--color-text-primary)]">
            {pending.body}
          </div>
        </div>
      )}
    </Modal>
  );
}
