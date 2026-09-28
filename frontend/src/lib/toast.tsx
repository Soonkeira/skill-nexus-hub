'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (message: string, type?: Toast['type']) => void;
  removeToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      {mounted && createPortal(
        <div
          className="toast-container pointer-events-none fixed left-4 right-4 top-4 z-[200] flex flex-col items-end gap-2 sm:left-auto sm:w-[min(400px,calc(100vw-2rem))]"
          aria-live="polite"
          aria-atomic="false"
        >
          {toasts.map(toast => (
            <div
              key={toast.id}
              role={toast.type === 'error' ? 'alert' : 'status'}
              onClick={() => removeToast(toast.id)}
              className="pointer-events-auto relative w-full cursor-pointer overflow-hidden rounded-lg px-4 py-3 text-[13px] font-medium text-white shadow-lg animate-toast-in"
              style={{
                background: toast.type === 'success' ? '#059669' : toast.type === 'error' ? '#DC2626' : toast.type === 'warning' ? '#D97706' : '#2563EB',
              }}
            >
              {toast.message}
              <div
                className="absolute bottom-0 left-0 h-[3px] rounded-bl-lg bg-white/35"
                style={{ animation: 'toast-progress 3.5s linear forwards' }}
              />
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
