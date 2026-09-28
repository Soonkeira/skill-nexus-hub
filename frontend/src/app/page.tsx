'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';
import type { Skill } from '@/lib/types';
import TopBar from '@/components/TopBar';
import Sidebar from '@/components/Sidebar';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
  Download,
  Flame,
  Package,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  TrendingUp,
  UploadCloud,
  Users,
} from 'lucide-react';
import SkillIcon from '@/components/SkillIcon';
import SkillTrustBadges from '@/components/SkillTrustBadges';

interface HomeStats {
  total_downloads: number;
  total_users: number;
}

function uniqueSkills(...groups: Skill[][]) {
  const seen = new Set<string>();
  const result: Skill[] = [];
  for (const group of groups) {
    for (const skill of group) {
      if (seen.has(skill.id)) continue;
      seen.add(skill.id);
      result.push(skill);
    }
  }
  return result;
}

function skillHref(skill: Skill) {
  return `/skill/${skill.owner_name || '_'}/${skill.slug}`;
}

function SkillCard({ skill, index }: { skill: Skill; index: number }) {
  return (
    <Link
      href={skillHref(skill)}
      style={{ '--stagger-index': index } as React.CSSProperties}
      className="surface-card skill-card-hover stagger-in rounded-[10px] p-5 flex flex-col gap-3 cursor-pointer"
    >
      <div className="flex items-start justify-between gap-3">
        <SkillIcon skill={skill} index={index} />
        <span className="text-[11px] text-[var(--text-muted)]">{skill.versions?.[0]?.version || ''}</span>
      </div>
      <div>
        <h3 className="text-[15px] font-semibold text-[var(--text-primary)] line-clamp-1">{skill.name}</h3>
        <p className="mt-1 text-[12px] text-[var(--text-muted)]">
          by {skill.owner_nickname || skill.owner_name || '-'}
          {skill.owner_department ? ` · ${skill.owner_department}` : ''}
        </p>
      </div>
      <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed line-clamp-2">
        {skill.description || '暂无描述'}
      </p>
      <div className="flex gap-1.5 flex-wrap">
        {(skill.tags || []).slice(0, 3).map((tag) => (
          <span key={tag} className="bg-[var(--tag-bg)] text-[var(--text-secondary)] text-[11px] px-2 py-0.5 rounded">
            {tag}
          </span>
        ))}
      </div>
      <SkillTrustBadges trust={skill.trust} compact />
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-[var(--border)]">
        <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
          <Download className="w-3 h-3" />
          {skill.download_count || 0}
        </span>
        <span className="text-[12px] font-medium text-[var(--primary)]">查看详情</span>
      </div>
    </Link>
  );
}

function SkillShelf({
  title,
  subtitle,
  icon,
  skills,
  loading,
  empty,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  skills: Skill[];
  loading: boolean;
  empty: string;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-[var(--primary)] flex items-center justify-center">
            {icon}
          </div>
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold text-[var(--text-primary)]">{title}</h2>
            <p className="text-[12px] text-[var(--text-muted)] mt-0.5">{subtitle}</p>
          </div>
        </div>
        <Link href="/market" className="flex items-center gap-1 text-[13px] text-[var(--primary)] font-medium hover:underline">
          查看全部 <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-8 text-[13px] text-[var(--text-muted)]">加载中...</div>
      ) : skills.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {skills.slice(0, 4).map((skill, i) => (
            <SkillCard key={skill.id} skill={skill} index={i} />
          ))}
        </div>
      ) : (
        <div className="surface-card border-dashed rounded-[10px] px-4 py-8 text-center text-[13px] text-[var(--text-muted)]">
          {empty}
        </div>
      )}
    </section>
  );
}

export default function HomePage() {
  const auth = useAuth();
  const router = useRouter();
  const [newestSkills, setNewestSkills] = useState<Skill[]>([]);
  const [weeklySkills, setWeeklySkills] = useState<Skill[]>([]);
  const [downloadedSkills, setDownloadedSkills] = useState<Skill[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<HomeStats | null>(null);
  const [activeHomeTab, setActiveHomeTab] = useState('featured');

  useEffect(() => {
    if (!auth.authLoading && !auth.isLoggedIn) {
      router.push('/login');
    }
  }, [auth.authLoading, auth.isLoggedIn, router]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [newestRes, weeklyRes, downloadsRes, statsRes] = await Promise.all([
          api.get('/skills', { params: { page: 1, page_size: 12 } }),
          api.get('/skills', { params: { page: 1, page_size: 8, sort: 'weekly_downloads' } }),
          api.get('/skills', { params: { page: 1, page_size: 8, sort: 'downloads' } }),
          api.get('/stats/overview').catch(() => null),
        ]);
        setNewestSkills(newestRes.data.items || []);
        setWeeklySkills(weeklyRes.data.items || []);
        setDownloadedSkills(downloadsRes.data.items || []);
        setTotal(newestRes.data.total || 0);
        if (statsRes) setStats(statsRes.data);
      } catch (e) {
        console.error('Failed to load home:', e);
        setNewestSkills([]);
        setWeeklySkills([]);
        setDownloadedSkills([]);
      } finally {
        setLoading(false);
      }
    }
    if (auth.isLoggedIn) load();
  }, [auth.isLoggedIn]);

  const featuredSkills = useMemo(() => {
    return uniqueSkills(downloadedSkills, newestSkills).filter((skill) => {
      const trust = skill.trust;
      return trust?.review_status === 'approved' && trust?.documentation_status === 'complete';
    });
  }, [downloadedSkills, newestSkills]);

  const departmentSkills = useMemo(() => {
    const department = auth.user?.department?.trim();
    if (!department) return [];
    return uniqueSkills(newestSkills, downloadedSkills).filter(
      (skill) => skill.owner_department?.trim() === department,
    );
  }, [auth.user?.department, downloadedSkills, newestSkills]);

  if (auth.authLoading || !auth.isLoggedIn) return null;

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-6 flex flex-col gap-6">
            <div className="mesh-hero rounded-xl p-7 flex items-stretch justify-between gap-7 shadow-[var(--shadow-soft)]">
              <div className="flex flex-col gap-4 min-w-0">
                <div className="mesh-hero-badge inline-flex w-fit items-center gap-2 rounded-md px-2.5 py-1 text-[12px] font-medium">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  审核后发布 · Web + CLI 安装
                </div>
                <div>
                  <h1 className="mesh-hero-title text-[32px] font-bold text-[var(--text-primary)] tracking-tight leading-tight">Skill 工作台</h1>
                  <p className="mesh-hero-copy text-sm max-w-[620px] leading-relaxed mt-2">
                    统一查看团队技能、跟进审核状态，并把可复用的 Agent Skill 发布到团队市场。
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Link
                    href="/publish"
                    className="mesh-hero-primary btn-press flex items-center gap-1.5 text-[13px] font-medium px-4 py-2 rounded-md"
                  >
                    发布 Skill
                    <UploadCloud className="w-3.5 h-3.5" />
                  </Link>
                  <Link
                    href="/market"
                    className="mesh-hero-secondary flex items-center gap-1.5 text-[13px] font-medium px-3 py-2 rounded-md transition-colors"
                  >
                    查看全部
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
              <div className="hidden xl:grid grid-cols-2 gap-3 min-w-[360px]">
                <div className="mesh-hero-card rounded-lg px-4 py-3">
                  <p className="mesh-hero-label text-[11px]">精选 Skill</p>
                  <p className="mesh-hero-value text-[15px] font-semibold mt-1">{featuredSkills.length || '--'} 个可信推荐</p>
                </div>
                <div className="mesh-hero-card rounded-lg px-4 py-3">
                  <p className="mesh-hero-label text-[11px]">本周热门</p>
                  <p className="mesh-hero-value text-[15px] font-semibold mt-1">{weeklySkills.length || '--'} 个活跃技能</p>
                </div>
                <div className="mesh-hero-card col-span-2 rounded-lg px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="mesh-hero-label text-[11px]">推荐工作流</p>
                    <p className="mesh-hero-value text-[15px] font-semibold mt-1">发现 · 安装 · 复用 · 沉淀</p>
                  </div>
                  <TerminalSquare className="mesh-hero-terminal w-7 h-7" />
                </div>
                <div className="mesh-hero-role col-span-2 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2 text-[12px]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                    当前角色：{auth.isAdmin ? '管理员，可审批和管理用户' : '普通用户，可发布、浏览和安装 Skill'}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 -mt-4 relative z-10">
              <div className="metric-tile rounded-xl p-5 flex items-center gap-4">
                <div className="w-11 h-11 rounded-lg flex items-center justify-center bg-blue-50">
                  <Package className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-[22px] font-bold text-[var(--text-primary)]">{total}</p>
                  <p className="text-[12px] text-[var(--text-muted)]">技能总数</p>
                </div>
              </div>
              <div className="metric-tile rounded-xl p-5 flex items-center gap-4">
                <div className="w-11 h-11 rounded-lg flex items-center justify-center bg-emerald-50">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-[22px] font-bold text-[var(--text-primary)]">{stats?.total_downloads ?? '--'}</p>
                  <p className="text-[12px] text-[var(--text-muted)]">总下载量</p>
                </div>
              </div>
              <div className="metric-tile rounded-xl p-5 flex items-center gap-4">
                <div className="w-11 h-11 rounded-lg flex items-center justify-center bg-violet-50">
                  <Users className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <p className="text-[22px] font-bold text-[var(--text-primary)]">{stats?.total_users ?? '--'}</p>
                  <p className="text-[12px] text-[var(--text-muted)]">注册用户</p>
                </div>
              </div>
            </div>

            {/* Skill tabs */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-1 border-b border-[var(--border)]">
                {[
                  { key: 'featured', label: '精选 Skill', icon: <Sparkles className="w-3.5 h-3.5" /> },
                  { key: 'weekly', label: '本周热门', icon: <Flame className="w-3.5 h-3.5" /> },
                  { key: 'newest', label: '新发布', icon: <Clock3 className="w-3.5 h-3.5" /> },
                  { key: 'downloads', label: '高下载', icon: <TrendingUp className="w-3.5 h-3.5" /> },
                  ...(auth.user?.department ? [{ key: 'department', label: '部门推荐', icon: <Building2 className="w-3.5 h-3.5" /> }] : []),
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveHomeTab(tab.key)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${
                      activeHomeTab === tab.key
                        ? 'text-[var(--primary)] border-[var(--primary)]'
                        : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="mt-1">
                {activeHomeTab === 'featured' && (
                  loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="surface-card rounded-[10px] p-5 flex flex-col gap-3">
                          <div className="flex items-center gap-3"><div className="skeleton w-10 h-10 rounded-lg" /><div className="flex-1"><div className="skeleton h-3 w-24 mb-2" /><div className="skeleton h-2.5 w-16" /></div></div>
                          <div className="skeleton h-3 w-full" /><div className="skeleton h-3 w-2/3" />
                          <div className="flex gap-2"><div className="skeleton h-5 w-12" /><div className="skeleton h-5 w-14" /></div>
                        </div>
                      ))}
                    </div>
                  )
                  : featuredSkills.length > 0 ? (
                    <div className="flex flex-col gap-4">
                      {featuredSkills.length >= 4 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                          {featuredSkills.slice(0, 4).map((skill, i) => <SkillCard key={skill.id} skill={skill} index={i} />)}
                        </div>
                      )}
                      {featuredSkills.length > 4 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                          {featuredSkills.slice(4, 8).map((skill, i) => <SkillCard key={skill.id} skill={skill} index={i + 4} />)}
                        </div>
                      )}
                      {featuredSkills.length > 0 && featuredSkills.length < 4 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {featuredSkills.map((skill, i) => <SkillCard key={skill.id} skill={skill} index={i} />)}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="surface-card border-dashed rounded-[10px] px-4 py-8 text-center text-[13px] text-[var(--text-muted)]">
                      还没有满足精选条件的 Skill，审核通过并补全说明后会自动出现。
                    </div>
                  )
                )}
                {activeHomeTab === 'weekly' && (
                  loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="surface-card rounded-[10px] p-5 flex flex-col gap-3">
                          <div className="flex items-center gap-3"><div className="skeleton w-10 h-10 rounded-lg" /><div className="flex-1"><div className="skeleton h-3 w-24 mb-2" /><div className="skeleton h-2.5 w-16" /></div></div>
                          <div className="skeleton h-3 w-full" /><div className="skeleton h-3 w-2/3" />
                          <div className="flex gap-2"><div className="skeleton h-5 w-12" /><div className="skeleton h-5 w-14" /></div>
                        </div>
                      ))}
                    </div>
                  )
                  : weeklySkills.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                      {weeklySkills.slice(0, 8).map((skill, i) => <SkillCard key={skill.id} skill={skill} index={i} />)}
                    </div>
                  ) : (
                    <div className="surface-card border-dashed rounded-[10px] px-4 py-8 text-center text-[13px] text-[var(--text-muted)]">
                      本周还没有下载记录，使用后这里会自动更新。
                    </div>
                  )
                )}
                {activeHomeTab === 'newest' && (
                  loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="surface-card rounded-[10px] p-5 flex flex-col gap-3">
                          <div className="flex items-center gap-3"><div className="skeleton w-10 h-10 rounded-lg" /><div className="flex-1"><div className="skeleton h-3 w-24 mb-2" /><div className="skeleton h-2.5 w-16" /></div></div>
                          <div className="skeleton h-3 w-full" /><div className="skeleton h-3 w-2/3" />
                          <div className="flex gap-2"><div className="skeleton h-5 w-12" /><div className="skeleton h-5 w-14" /></div>
                        </div>
                      ))}
                    </div>
                  )
                  : newestSkills.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                      {newestSkills.slice(0, 8).map((skill, i) => <SkillCard key={skill.id} skill={skill} index={i} />)}
                    </div>
                  ) : (
                    <div className="surface-card border-dashed rounded-[10px] px-4 py-8 text-center text-[13px] text-[var(--text-muted)]">
                      还没有发布的团队 Skill，发布第一个 Skill 后会出现在这里。
                    </div>
                  )
                )}
                {activeHomeTab === 'downloads' && (
                  loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="surface-card rounded-[10px] p-5 flex flex-col gap-3">
                          <div className="flex items-center gap-3"><div className="skeleton w-10 h-10 rounded-lg" /><div className="flex-1"><div className="skeleton h-3 w-24 mb-2" /><div className="skeleton h-2.5 w-16" /></div></div>
                          <div className="skeleton h-3 w-full" /><div className="skeleton h-3 w-2/3" />
                          <div className="flex gap-2"><div className="skeleton h-5 w-12" /><div className="skeleton h-5 w-14" /></div>
                        </div>
                      ))}
                    </div>
                  )
                  : downloadedSkills.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                      {downloadedSkills.slice(0, 8).map((skill, i) => <SkillCard key={skill.id} skill={skill} index={i} />)}
                    </div>
                  ) : (
                    <div className="surface-card border-dashed rounded-[10px] px-4 py-8 text-center text-[13px] text-[var(--text-muted)]">
                      还没有下载数据。
                    </div>
                  )
                )}
                {activeHomeTab === 'department' && (
                  loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="surface-card rounded-[10px] p-5 flex flex-col gap-3">
                          <div className="flex items-center gap-3"><div className="skeleton w-10 h-10 rounded-lg" /><div className="flex-1"><div className="skeleton h-3 w-24 mb-2" /><div className="skeleton h-2.5 w-16" /></div></div>
                          <div className="skeleton h-3 w-full" /><div className="skeleton h-3 w-2/3" />
                          <div className="flex gap-2"><div className="skeleton h-5 w-12" /><div className="skeleton h-5 w-14" /></div>
                        </div>
                      ))}
                    </div>
                  )
                  : departmentSkills.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                      {departmentSkills.slice(0, 8).map((skill, i) => <SkillCard key={skill.id} skill={skill} index={i} />)}
                    </div>
                  ) : (
                    <div className="surface-card border-dashed rounded-[10px] px-4 py-8 text-center text-[13px] text-[var(--text-muted)]">
                      当前部门还没有可推荐的 Skill。
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
