'use client';

import { useEffect, useRef, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Info, X } from 'lucide-react';

interface AlertDialogProps {
  open: boolean;
  title: string;
  message?: string;
  children?: ReactNode;
  icon?: 'info' | 'warning';
  onClose: () => void;
  actions?: ReactNode;
}

export default function AlertDialog({ open, title, message, children, icon = 'info', onClose, actions }: AlertDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const IconComponent = icon === 'warning' ? AlertTriangle : Info;
  const iconColor = icon === 'warning' ? 'text-amber-500' : 'text-[var(--primary)]';

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose} role="presentation">
      <div className="absolute inset-0 bg-black/40" />
      <div
        ref={dialogRef}
        className="relative max-h-[85vh] w-full max-w-[480px] overflow-y-auto rounded-xl bg-[var(--bg-card)] p-6 shadow-xl"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alert-title"
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-start gap-3 mb-4">
          <IconComponent className={`w-5 h-5 mt-0.5 shrink-0 ${iconColor}`} />
          <div className="flex-1">
            <h3 id="alert-title" className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</h3>
            {message && <p className="mt-1 break-words text-[13px] text-[var(--text-secondary)]">{message}</p>}
            {children}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          {actions || (
            <button onClick={onClose} className="px-4 py-2 text-[13px] rounded-lg bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary-dark)]">知道了</button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
