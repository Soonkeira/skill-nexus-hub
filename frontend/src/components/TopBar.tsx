'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Search, Download, UserCircle, LogOut, ChevronDown, Menu } from 'lucide-react';
import { useSidebar } from '@/lib/sidebar';
import { getLucideIcon } from '@/lib/icon-presets';

export default function TopBar() {
  const auth = useAuth();
  const router = useRouter();
  const { toggleMobile } = useSidebar();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [showCliOnboarding, setShowCliOnboarding] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const displayName = auth.user?.nickname || auth.user?.username || '';
  const username = auth.user?.username || '';
  const shouldShowUsername = Boolean(username && username !== displayName);
  const initial = displayName.charAt(0).toUpperCase();
  const avatarUrl = auth.user?.avatar_url || '';
  const isImageAvatar = /^data:image\//.test(avatarUrl) || /^https?:\/\//.test(avatarUrl) || avatarUrl.startsWith('/');
  const avatarLucideIcon = !isImageAvatar && avatarUrl ? getLucideIcon(avatarUrl) : undefined;
  const avatarText = avatarUrl && !isImageAvatar && !avatarLucideIcon ? avatarUrl : initial;

  const platform = typeof navigator !== 'undefined'
    ? navigator.platform.toLowerCase().includes('win') ? 'windows'
      : navigator.platform.toLowerCase().includes('mac') ? 'darwin' : 'linux'
    : 'windows';

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (!auth.user || typeof window === 'undefined') return;
    const storageKey = `snh-cli-onboarding-dismissed:${auth.user.id}`;
    if (window.localStorage.getItem(storageKey)) return;

    const createdAt = auth.user.created_at ? Date.parse(auth.user.created_at) : NaN;
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    const isNewUser = Number.isNaN(createdAt) || Date.now() - createdAt <= oneWeekMs;
    if (isNewUser) setShowCliOnboarding(true);
  }, [auth.user?.id, auth.user?.created_at]);

  function dismissCliOnboarding() {
    if (auth.user && typeof window !== 'undefined') {
      window.localStorage.setItem(`snh-cli-onboarding-dismissed:${auth.user.id}`, '1');
    }
    setShowCliOnboarding(false);
  }

  function handleSearch(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && query.trim()) {
      router.push(`/market?q=${encodeURIComponent(query.trim())}`);
    }
  }

  return (
    <>
    <header className="relative z-[60] h-[60px] bg-[var(--bg-card)] border-b border-[var(--border)] flex items-center justify-between px-4 sm:px-6 shrink-0 backdrop-blur">
      <div className="flex items-center gap-3">
        <button onClick={toggleMobile} className="md:hidden p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          <Menu className="w-5 h-5" />
        </button>
        <div className="hidden sm:flex items-center gap-2 bg-[var(--bg-card-subtle)] border border-[var(--border)] rounded-lg h-9 px-3 w-[min(22rem,38vw)] shadow-sm">
        <Search className="w-4 h-4 text-[var(--text-muted)]" />
        <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleSearch}
          type="text" placeholder="搜索 Skill、标签、描述..." className="bg-transparent text-[13px] text-[var(--text-primary)] outline-none w-full placeholder:text-[var(--text-muted)]" />
        </div>
      </div>
      <div className="flex items-center gap-3 sm:gap-4">
        <a href={`/api/cli/download/${platform}`} download className="hidden sm:flex items-center gap-1.5 bg-[var(--primary)] text-white text-[13px] font-medium px-4 py-2 rounded-md hover:bg-[var(--primary-dark)] transition-colors shadow-sm">
          <Download className="w-3.5 h-3.5" />
          下载客户端
        </a>
        <div ref={ref} className="relative">
          <button onClick={() => setOpen(!open)} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded-lg bg-[var(--primary)] flex items-center justify-center overflow-hidden text-white text-sm font-semibold shadow-sm">
              {auth.user?.avatar_url && isImageAvatar ? (
                <img src={auth.user.avatar_url} alt={displayName || 'avatar'} className="h-full w-full object-cover" />
              ) : avatarLucideIcon ? (
                (() => { const AvatarIcon = avatarLucideIcon; return <AvatarIcon size={16} className="text-white" strokeWidth={2} />; })()
              ) : (
                <span>{avatarText}</span>
              )}
            </div>
            <span className="hidden min-w-0 max-w-[10rem] flex-col items-start leading-tight sm:flex">
              <span className="max-w-full truncate text-[13px] text-[var(--text-primary)]">{displayName}</span>
              {shouldShowUsername && (
                <span className="max-w-full truncate text-[11px] text-[var(--text-muted)]">@{username}</span>
              )}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-[var(--border)] rounded-lg shadow-lg py-1 z-50">
              <Link href="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 text-[13px] text-[var(--text-secondary)] hover:bg-gray-50">
                <UserCircle className="w-4 h-4" />
                个人中心
              </Link>
              <button onClick={() => { setOpen(false); auth.logout(); }} className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-red-500 hover:bg-gray-50">
                <LogOut className="w-4 h-4" />
                退出登录
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
    {showCliOnboarding && (
      <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
        <div className="absolute inset-0 bg-black/40" onClick={dismissCliOnboarding} />
        <div className="relative w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[18px] font-semibold text-[var(--text-primary)]">下载 SNH 客户端</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                一键安装需要本地安装 SNH CLI 工具，安装步骤：
              </p>
            </div>
            <button type="button" onClick={dismissCliOnboarding} className="rounded-md px-2 py-1 text-[18px] leading-none text-[var(--text-muted)] hover:bg-[var(--bg-card-subtle)] hover:text-[var(--text-primary)]" aria-label="关闭">
              ×
            </button>
          </div>
          <div className="mt-4 space-y-3 text-[13px] text-[var(--text-secondary)]">
            <div className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--bg-card-subtle)] text-[12px] font-semibold text-[var(--text-primary)]">1</span>
              <p>点击页面右上角「下载客户端」按钮，下载压缩包</p>
            </div>
            <div className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--bg-card-subtle)] text-[12px] font-semibold text-[var(--text-primary)]">2</span>
              <p>解压后双击运行 snh.exe，自动安装到系统 PATH</p>
            </div>
            <div className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--bg-card-subtle)] text-[12px] font-semibold text-[var(--text-primary)]">3</span>
              <p>重新在浏览器中点击「安装到 xxx」按钮</p>
            </div>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={dismissCliOnboarding} className="rounded-lg border border-[var(--border)] px-4 py-2 text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-card-subtle)]">
              稍后再说
            </button>
            <a href={`/api/cli/download/${platform}`} download onClick={dismissCliOnboarding} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-[13px] font-medium text-white hover:bg-[var(--primary-dark)]">
              <Download className="w-4 h-4" />
              下载客户端
            </a>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
