'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';
import type { InstallTarget, Skill } from '@/lib/types';
import TopBar from '@/components/TopBar';
import Sidebar from '@/components/Sidebar';
import { Download, Filter, PackageSearch, Search, Sparkles } from 'lucide-react';
import SkillIcon from '@/components/SkillIcon';
import SkillTrustBadges from '@/components/SkillTrustBadges';
import Pagination from '@/components/Pagination';
export default function MarketPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-[var(--text-muted)]">加载中...</div>}>
      <MarketContent />
    </Suspense>
  );
}

function MarketContent() {
  const auth = useAuth();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const [skills, setSkills] = useState<Skill[]>([]);
  const [targets, setTargets] = useState<InstallTarget[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedTarget, setSelectedTarget] = useState('');
  const [loading, setLoading] = useState(true);
  const pageSize = 20;
  const totalPages = Math.ceil(total / pageSize);
  const searchRef = useRef<ReturnType<typeof setTimeout>>(null);

  async function loadSkills(query?: string) {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, page_size: pageSize };
      const q = query !== undefined ? query : searchQuery;
      if (q) params.q = q;
      if (selectedTarget) params.target = selectedTarget;
      const { data } = await api.get('/skills', { params });
      setSkills(data.items);
      setTotal(data.total);
    } catch (e) {
      console.error('Failed to load skills:', e);
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSkills();
  }, [page, selectedTarget]);

  useEffect(() => {
    api.get('/skills/install-targets')
      .then(({ data }) => setTargets(Array.isArray(data) ? data : []))
      .catch((e) => console.error('Failed to load targets:', e));
    return () => {
      if (searchRef.current) clearTimeout(searchRef.current);
    };
  }, []);

  function debounceSearch(val: string) {
    setSearchQuery(val);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => {
      setPage(1);
      loadSkills(val);
    }, 300);
  }

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-6 flex flex-col gap-5">
            <div className="page-hero rounded-xl p-6 flex flex-col gap-5">
              <div className="flex items-start justify-between gap-5">
                <div>
                  <div className="inline-flex items-center gap-2 text-[12px] text-[var(--primary)] font-medium bg-blue-50 px-2.5 py-1 rounded-md">
                    <Sparkles className="w-3.5 h-3.5" />
                    团队能力目录
                  </div>
                  <h1 className="text-[24px] font-bold text-[var(--text-primary)] mt-3">Skill 市场</h1>
                  <p className="text-sm text-[var(--text-secondary)] mt-2 max-w-[620px] leading-relaxed">
                    查找可安装、可复用、已经过团队审核的 Agent Skill，并按目标工具快速筛选。
                  </p>
                </div>
                <div className="hidden lg:flex items-center gap-3 rounded-lg border border-[var(--border)] bg-white/80 px-4 py-3">
                  <div className="text-right">
                    <p className="text-[22px] font-bold text-[var(--text-primary)]">{total}</p>
                    <p className="text-[12px] text-[var(--text-muted)]">可安装技能</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col lg:flex-row gap-3">
                <div className="flex items-center gap-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg h-11 px-3.5 flex-1 shadow-sm">
                  <Search className="w-4 h-4 text-[var(--text-muted)]" />
                  <input
                    value={searchQuery}
                    onChange={(e) => debounceSearch(e.target.value)}
                    type="text"
                    placeholder="搜索 Skill、标签、描述..."
                    className="bg-transparent text-[13px] text-[var(--text-primary)] outline-none w-full placeholder:text-[var(--text-muted)]"
                  />
                </div>
                <div className="flex items-center gap-2 overflow-x-auto">
                  <span className="hidden lg:inline-flex items-center gap-1 text-[12px] text-[var(--text-muted)] px-1">
                    <Filter className="w-3.5 h-3.5" />
                    目标
                  </span>
                  <button
                    onClick={() => { setSelectedTarget(''); setPage(1); }}
                    className={`px-3.5 py-2 rounded-md text-[13px] border transition-colors whitespace-nowrap ${!selectedTarget ? 'bg-[var(--primary)] text-white font-medium border-[var(--primary)]' : 'bg-white text-[var(--text-secondary)] border-[var(--border)] hover:bg-gray-50'}`}
                  >
                    全部
                  </button>
                  {targets.map((target) => (
                    <button
                      key={target.name}
                      onClick={() => { setSelectedTarget(target.name); setPage(1); }}
                      className={`px-3.5 py-2 rounded-md text-[13px] border transition-colors whitespace-nowrap ${selectedTarget === target.name ? 'bg-[var(--primary)] text-white font-medium border-[var(--primary)]' : 'bg-white text-[var(--text-secondary)] border-[var(--border)] hover:bg-gray-50'}`}
                    >
                      {target.display_name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {skills.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {skills.map((skill, index) => (
                  <Link
                    key={skill.id}
                    href={`/skill/${skill.owner_name || '_'}/${skill.slug}`}
                    style={{ '--stagger-index': index % 20 } as React.CSSProperties}
                    className="surface-card skill-card-hover stagger-in rounded-[10px] p-5 flex flex-col gap-3 cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="skill-icon-wrap"><SkillIcon skill={skill} index={index} /></div>
                      <span className="text-[12px] text-[var(--text-muted)]">{skill.versions?.[0]?.version || ''}</span>
                    </div>
                    <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{skill.name}</h3>
                    <p className="text-[12px] text-[var(--text-muted)]">by {skill.owner_nickname || skill.owner_name || '-'}</p>
                    <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed line-clamp-2">
                      {skill.description || '暂无描述'}
                    </p>
                    <div className="flex gap-1.5 flex-wrap">
                      {(skill.tags || []).slice(0, 3).map((tag) => (
                        <span key={tag} className="bg-[var(--tag-bg)] text-[var(--text-secondary)] text-[12px] px-2 py-0.5 rounded">
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
                ))}
              </div>
            ) : !loading ? (
              <div className="surface-card border-dashed rounded-[10px] text-center py-16 flex flex-col items-center gap-3">
                <div className="w-11 h-11 rounded-lg bg-blue-50 flex items-center justify-center">
                  <PackageSearch className="w-5 h-5 text-[var(--primary)]" />
                </div>
                <div>
                  <p className="text-[14px] font-medium text-[var(--text-primary)]">还没有可安装的 Skill</p>
                  <p className="text-[13px] text-[var(--text-muted)] mt-1">
                    {auth.isLoggedIn ? '清空筛选或发布第一个 Skill 后，团队成员就能在这里搜索和安装。' : '清空筛选后仍没有结果时，登录后可以发布团队 Skill。'}
                  </p>
                </div>
                {auth.isLoggedIn && <Link href="/publish" className="text-[13px] font-medium text-[var(--primary)] hover:underline">发布第一个 Skill</Link>}
              </div>
            ) : null}

            {loading && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="surface-card rounded-[10px] p-5 flex flex-col gap-3">
                    <div className="flex items-center gap-3"><div className="skeleton w-10 h-10 rounded-lg" /><div className="flex-1"><div className="skeleton h-3 w-24 mb-2" /><div className="skeleton h-2.5 w-16" /></div></div>
                    <div className="skeleton h-3 w-full" /><div className="skeleton h-3 w-2/3" />
                    <div className="flex gap-2"><div className="skeleton h-5 w-12" /><div className="skeleton h-5 w-14" /></div>
                    <div className="flex items-center justify-between mt-auto pt-2 border-t border-[var(--border)]"><div className="skeleton h-3 w-10" /><div className="skeleton h-3 w-16" /></div>
                  </div>
                ))}
              </div>
            )}

            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </div>
      </div>
    </div>
  );
}
