'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const displayPages = (() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | string)[] = [1];
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    if (start > 2) pages.push('...');
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 1) pages.push('...');
    pages.push(totalPages);
    return pages;
  })();

  const btnBase = 'w-8 h-8 rounded-md flex items-center justify-center text-[13px] border transition-colors';
  const btnInactive = `surface-card border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--tag-bg)]`;
  const btnActive = 'bg-[var(--primary)] text-white border-[var(--primary)] font-semibold';

  return (
    <div className="flex items-center justify-center gap-1 py-3">
      <button
        onClick={() => page > 1 && onPageChange(page - 1)}
        disabled={page <= 1}
        className={`${btnBase} ${btnInactive} disabled:opacity-40`}
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>
      {displayPages.map((p, i) =>
        typeof p === 'number' ? (
          <button
            key={i}
            onClick={() => onPageChange(p)}
            className={`${btnBase} ${p === page ? btnActive : btnInactive}`}
          >
            {p}
          </button>
        ) : (
          <span key={i} className="w-8 h-8 flex items-center justify-center text-[13px] text-[var(--text-muted)]">
            ...
          </span>
        )
      )}
      <button
        onClick={() => page < totalPages && onPageChange(page + 1)}
        disabled={page >= totalPages}
        className={`${btnBase} ${btnInactive} disabled:opacity-40`}
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
