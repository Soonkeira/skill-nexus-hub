'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useSidebar } from '@/lib/sidebar';
import {
  Boxes,
  Home,
  Store,
  Folder,
  Clock,
  BarChart3,
  Users,
  UserCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Moon,
  Sun,
  X,
  Heart,
  FileText,
  MessageSquare,
  MessageCircle,
  BrainCircuit,
  MonitorSmartphone,
} from 'lucide-react';

const mainNavItems = [
  { label: '首页', icon: Home, href: '/' },
  { label: '技能市场', icon: Store, href: '/market' },
  { label: '我的技能', icon: Folder, href: '/my-skills' },
  { label: '我的收藏', icon: Heart, href: '/favorites' },
  { label: '本地 Skill', icon: MonitorSmartphone, href: '/local-skills' },
  { label: '待审批', icon: Clock, href: '/pending' },
  { label: '统计', icon: BarChart3, href: '/stats' },
  { label: '问题反馈', icon: MessageCircle, href: '/feedback' },
  { label: '我的反馈', icon: FileText, href: '/my-feedback' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const auth = useAuth();
  const { mobileOpen, closeMobile } = useSidebar();
  const [collapsed, setCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') {
      setDarkMode(true);
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }, []);

  useEffect(() => {
    closeMobile();
  }, [pathname, closeMobile]);

  function toggleDark() {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    localStorage.setItem('theme', next ? 'dark' : 'light');
  }

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const mainNav = [
    ...mainNavItems,
  ];

  const mgmtNav = [
    { label: '个人中心', icon: UserCircle, href: '/profile' },
    ...(auth.isAdmin
      ? [
          { label: '技能管理', icon: Boxes, href: '/admin/skills' },
          { label: '用户管理', icon: Users, href: '/admin/users' },
          { label: '评论管理', icon: MessageSquare, href: '/admin/comments' },
          { label: '反馈管理', icon: MessageCircle, href: '/admin/feedback' },
          { label: 'LLM 配置', icon: BrainCircuit, href: '/admin/llm' },
          { label: '审计日志', icon: FileText, href: '/admin/audit-logs' },
        ]
      : []),
  ];

  const sidebarContent = (
    <aside
      className="h-screen overflow-hidden bg-[var(--bg-sidebar)]/95 border-r border-[var(--border)] flex flex-col py-5 gap-1 shrink-0 transition-[width] duration-200 ease-in-out backdrop-blur"
      style={{ width: collapsed ? 60 : 200 }}
    >
      <Link href="/" className="flex shrink-0 items-center gap-2.5 px-3 pb-5" style={{ justifyContent: collapsed ? 'center' : undefined }}>
        <div className="w-9 h-9 rounded-lg bg-[var(--primary)] flex items-center justify-center shadow-md shadow-blue-200/60 shrink-0">
          <Boxes className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <span className="block text-[15px] font-semibold text-[var(--text-primary)] leading-tight">Skill Nexus Hub</span>
            <span className="block text-[11px] text-[var(--text-muted)] leading-tight mt-0.5">Agent Skill Ops</span>
          </div>
        )}
      </Link>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <nav className="flex flex-col gap-0.5 px-2">
        {mainNav.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link key={item.href} href={item.href}
              title={collapsed ? item.label : undefined}
              className={`focus-ring flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all ${active ? 'bg-[var(--primary)] text-white font-medium shadow-sm' : 'text-[var(--text-secondary)] hover:bg-[var(--tag-bg)] hover:text-[var(--text-primary)]'}`}
              style={{ justifyContent: collapsed ? 'center' : undefined }}>
              <Icon className="w-[18px] h-[18px] shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {!collapsed && (
        <>
          <div className="h-px bg-[var(--border)] my-2 mx-2" />
          <div className="px-5 py-2 pt-1">
            <span className="text-xs font-medium text-[var(--text-muted)]">管理</span>
          </div>
        </>
      )}
      {collapsed && <div className="h-px bg-[var(--border)] my-2 mx-2" />}

      <nav className="flex flex-col gap-0.5 px-2">
        {mgmtNav.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link key={item.href} href={item.href}
              title={collapsed ? item.label : undefined}
              className={`focus-ring flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all ${active ? 'bg-[var(--primary)] text-white font-medium shadow-sm' : 'text-[var(--text-secondary)] hover:bg-[var(--tag-bg)] hover:text-[var(--text-primary)]'}`}
              style={{ justifyContent: collapsed ? 'center' : undefined }}>
              <Icon className="w-[18px] h-[18px] shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
      </div>

      <div className="shrink-0 px-2 flex flex-col gap-0.5">
        <button onClick={toggleDark}
          className="flex items-center gap-2 px-3 py-2 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--tag-bg)] hover:text-[var(--text-primary)] rounded-md"
          style={{ justifyContent: collapsed ? 'center' : undefined }}>
          {darkMode ? <Sun className="w-[18px] h-[18px] shrink-0" /> : <Moon className="w-[18px] h-[18px] shrink-0" />}
          {!collapsed && <span>{darkMode ? '浅色模式' : '深色模式'}</span>}
        </button>

        <button onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 px-3 py-2 text-[var(--text-muted)] text-[13px] hover:bg-[var(--tag-bg)] hover:text-[var(--text-primary)] rounded-md"
          style={{ justifyContent: collapsed ? 'center' : undefined }}>
          {collapsed ? <PanelLeftOpen className="w-[18px] h-[18px]" /> : <PanelLeftClose className="w-[18px] h-[18px]" />}
          {!collapsed && <span>收起</span>}
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        {sidebarContent}
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={closeMobile} />
          <div className="relative z-10">
            {sidebarContent}
          </div>
          <button onClick={closeMobile} className="absolute top-4 right-4 z-20 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </>
  );
}
