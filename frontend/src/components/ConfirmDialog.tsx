'use client';

import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { createPortal } from 'react-dom';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ open, title, message, confirmText = '确认', cancelText = '取消', danger = false, onConfirm, onCancel }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      previousFocus.current = document.activeElement as HTMLElement;
      dialogRef.current?.focus();
    } else {
      previousFocus.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCancel(); return; }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onCancel} role="presentation">
      <div className="absolute inset-0 bg-black/40" />
      <div
        ref={dialogRef}
        className="relative bg-white rounded-xl p-6 w-[400px] shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-desc"
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          {danger && <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" aria-hidden="true" />}
          <div>
            <h3 id="dialog-title" className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</h3>
            <p id="dialog-desc" className="text-[13px] text-[var(--text-secondary)] mt-1">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} className="px-4 py-2 text-[13px] rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-gray-50">{cancelText}</button>
          <button onClick={onConfirm} className={`px-4 py-2 text-[13px] rounded-lg text-white font-medium ${danger ? 'bg-red-500 hover:bg-red-600' : 'bg-[var(--primary)] hover:bg-[var(--primary-dark)]'}`}>{confirmText}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
