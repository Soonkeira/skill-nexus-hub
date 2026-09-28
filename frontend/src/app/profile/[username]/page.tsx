'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import AlertDialog from '@/components/AlertDialog';
import { formatDate } from '@/utils';
import { ArrowLeft, Building2, Shield, CalendarDays } from 'lucide-react';

interface PublicUser {
  username: string;
  nickname: string | null;
  avatar_url: string | null;
  department: string | null;
  role: string;
  created_at: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  user: '用户',
};

const AVATAR_COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EC4899',
  '#06B6D4', '#EF4444', '#6366F1', '#F97316', '#14B8A6',
];

function hashColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export default function PublicProfilePage() {
  const params = useParams();
  const username = params.username as string;
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/users/${username}`).then(({ data }) => setUser(data)).catch(() => setError('用户不存在')).finally(() => setLoading(false));
  }, [username]);

  if (loading) return <div className="flex h-screen"><Sidebar /><div className="flex-1 flex items-center justify-center text-[var(--text-muted)]">加载中...</div></div>;

  if (error || !user) return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <AlertDialog
          open={true}
          title="提示"
          message={error || '用户不存在'}
          icon="warning"
          onClose={() => setError('')}
        />
        <Link href="/" className="text-[var(--primary)] text-[13px] hover:underline">返回首页</Link>
      </div>
    </div>
  );

  const displayName = user.nickname || user.username;
  const initial = displayName.charAt(0).toUpperCase();
  const bgColor = hashColor(user.username);

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-6 flex flex-col gap-5">
            <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] w-fit">
              <ArrowLeft className="w-3.5 h-3.5" /> 返回
            </Link>

            <div className="page-hero rounded-[10px] p-6 max-w-lg">
              <div className="flex items-center gap-4 mb-5">
                <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0" style={{ backgroundColor: bgColor }}>
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white text-2xl font-semibold">{initial}</span>
                  )}
                </div>
                <div>
                  <h1 className="text-[20px] font-bold text-[var(--text-primary)]">{displayName}</h1>
                  <span className="text-[13px] text-[var(--text-muted)]">@{user.username}</span>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2.5 text-[13px]">
                  <Shield className="w-4 h-4 text-[var(--text-muted)]" />
                  <span className="text-[var(--text-muted)]">角色</span>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${user.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                    {ROLE_LABELS[user.role] || user.role}
                  </span>
                </div>
                {user.department && (
                  <div className="flex items-center gap-2.5 text-[13px]">
                    <Building2 className="w-4 h-4 text-[var(--text-muted)]" />
                    <span className="text-[var(--text-muted)]">部门</span>
                    <span className="text-[var(--text-primary)]">{user.department}</span>
                  </div>
                )}
                <div className="flex items-center gap-2.5 text-[13px]">
                  <CalendarDays className="w-4 h-4 text-[var(--text-muted)]" />
                  <span className="text-[var(--text-muted)]">注册时间</span>
                  <span className="text-[var(--text-primary)]">{formatDate(user.created_at)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
