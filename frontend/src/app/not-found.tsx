'use client';

import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import { FileQuestion } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
                <FileQuestion className="w-8 h-8 text-[var(--primary)]" />
              </div>
              <h1 className="text-[24px] font-bold text-[var(--text-primary)]">页面不存在</h1>
              <p className="text-[14px] text-[var(--text-muted)] mt-2">你访问的页面可能已被移除或地址有误。</p>
              <Link
                href="/"
                className="mt-5 inline-flex items-center gap-1.5 bg-[var(--primary)] text-white text-[13px] font-medium px-5 py-2.5 rounded-lg hover:bg-[var(--primary-dark)] transition-colors"
              >
                返回首页
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
