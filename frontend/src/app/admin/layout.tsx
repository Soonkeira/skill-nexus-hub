'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!auth.authLoading) {
      if (!auth.isLoggedIn) {
        router.replace('/login');
      } else if (!auth.isAdmin) {
        router.replace('/');
      } else {
        setReady(true);
      }
    }
  }, [auth.authLoading, auth.isLoggedIn, auth.isAdmin, router]);

  if (auth.authLoading || !ready) {
    return (
      <div className="flex items-center justify-center h-screen">
        <span className="text-[13px] text-[var(--text-muted)]">加载中...</span>
      </div>
    );
  }

  return <>{children}</>;
}
