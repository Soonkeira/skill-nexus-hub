'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import api from '@/lib/api';
import { Building2, Shield } from 'lucide-react';

interface PublicUser {
  username: string;
  nickname: string | null;
  avatar_url: string | null;
  department: string | null;
  role: string;
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

const cache = new Map<string, PublicUser>();

export default function UserHoverCard({ username, children }: { username: string; children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState<'top' | 'bottom'>('bottom');
  const triggerRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(true);

    if (!user && !loading) {
      const cached = cache.get(username);
      if (cached) {
        setUser(cached);
      } else {
        setLoading(true);
        api.get(`/users/${username}`).then(({ data }) => {
          setUser(data);
          cache.set(username, data);
        }).catch(() => {}).finally(() => setLoading(false));
      }
    }

    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition(rect.top < 200 ? 'bottom' : 'top');
    }
  }, [username, user, loading]);

  const hide = useCallback(() => {
    timerRef.current = setTimeout(() => setVisible(false), 150);
  }, []);

  const stay = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const displayName = user?.nickname || username;
  const initial = displayName.charAt(0).toUpperCase();
  const bgColor = hashColor(username);

  return (
    <span
      ref={triggerRef}
      className="relative inline-block"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {visible && (
        <div
          ref={cardRef}
          onMouseEnter={stay}
          onMouseLeave={hide}
          className={`fixed z-50 bg-white border border-[var(--border)] rounded-lg shadow-lg p-3 w-[220px] transition-opacity duration-150 ${position === 'top' ? '' : ''}`}
          style={{
            ...(triggerRef.current ? (() => {
              const rect = triggerRef.current.getBoundingClientRect();
              if (position === 'top') {
                return { top: rect.top - 110, left: rect.left };
              }
              return { top: rect.bottom + 6, left: rect.left };
            })() : {}),
          }}
        >
          {loading && !user ? (
            <p className="text-[12px] text-[var(--text-muted)] text-center py-2">加载中...</p>
          ) : user ? (
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0" style={{ backgroundColor: bgColor }}>
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white text-sm font-semibold">{initial}</span>
                )}
              </div>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[13px] font-medium text-[var(--text-primary)] truncate">{displayName}</span>
                <span className="text-[11px] text-[var(--text-muted)]">@{user.username}</span>
              </div>
            </div>
          ) : (
            <p className="text-[12px] text-[var(--text-muted)]">{username}</p>
          )}
          {user && (
            <div className="flex flex-col gap-1.5 mt-2 pt-2 border-t border-[var(--border)]">
              <div className="flex items-center gap-1.5 text-[11px]">
                <Shield className="w-3 h-3 text-[var(--text-muted)]" />
                <span className={`font-medium px-1.5 py-0.5 rounded-full ${user.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                  {ROLE_LABELS[user.role] || user.role}
                </span>
              </div>
              {user.department && (
                <div className="flex items-center gap-1.5 text-[11px]">
                  <Building2 className="w-3 h-3 text-[var(--text-muted)]" />
                  <span className="text-[var(--text-primary)]">{user.department}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
