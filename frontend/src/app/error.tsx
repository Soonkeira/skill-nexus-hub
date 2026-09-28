'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import { AlertTriangle } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Page error:', error);
  }, [error]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 rounded-xl bg-red-50 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
              <h1 className="text-[24px] font-bold text-[var(--text-primary)]">出了点问题</h1>
              <p className="text-[14px] text-[var(--text-muted)] mt-2">页面加载时遇到错误，请重试或返回首页。</p>
              <div className="flex items-center justify-center gap-3 mt-5">
                <button
                  onClick={reset}
                  className="bg-[var(--primary)] text-white text-[13px] font-medium px-5 py-2.5 rounded-lg hover:bg-[var(--primary-dark)] transition-colors"
                >
                  重试
                </button>
                <Link
                  href="/"
                  className="text-[13px] font-medium text-[var(--primary)] px-5 py-2.5 rounded-lg border border-[var(--border)] hover:bg-gray-50 transition-colors"
                >
                  返回首页
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
