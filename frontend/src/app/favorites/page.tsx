'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import type { Skill } from '@/lib/types';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import Pagination from '@/components/Pagination';
import Link from 'next/link';
import { Download, Heart } from 'lucide-react';
import SkillIcon from '@/components/SkillIcon';

export default function FavoritesPage() {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;
  const totalPages = Math.ceil(total / pageSize);

  function loadFavorites() {
    setLoading(true);
    api.get('/bookmarks', { params: { page, page_size: pageSize } })
      .then(({ data }) => { setSkills(data.items); setTotal(data.total); })
      .catch(() => setSkills([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!auth.isLoggedIn && !auth.authLoading) {
      router.push('/login');
      return;
    }
    if (auth.user) loadFavorites();
  }, [auth.user, auth.isLoggedIn, auth.authLoading, page]);

  async function unfavorite(slug: string) {
    try {
      await api.delete(`/bookmarks/${slug}`);
      loadFavorites();
    } catch {
      toast.addToast('取消收藏失败，请稍后重试', 'error');
    }
  }

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-6 flex flex-col gap-5">
            <div className="page-hero rounded-xl p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 text-[12px] text-[var(--primary)] font-medium bg-blue-50 px-2.5 py-1 rounded-md">
                  <Heart className="w-3.5 h-3.5" />
                  个人收藏夹
                </div>
                <h1 className="text-[22px] font-bold text-[var(--text-primary)] mt-3">我的收藏</h1>
                <p className="text-[13px] text-[var(--text-muted)] mt-1">浏览和管理你收藏的技能。</p>
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="surface-card rounded-[10px] p-5 flex flex-col gap-3">
                    <div className="flex items-center gap-3"><div className="skeleton w-10 h-10 rounded-lg" /><div className="flex-1"><div className="skeleton h-3 w-24 mb-2" /><div className="skeleton h-2.5 w-16" /></div></div>
                    <div className="skeleton h-3 w-full" /><div className="skeleton h-3 w-2/3" />
                  </div>
                ))}
              </div>
            ) : skills.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {skills.map((skill, i) => (
                  <div key={skill.id}
                    style={{ '--stagger-index': i % 20 } as React.CSSProperties}
                    className="surface-card rounded-[10px] p-5 flex flex-col gap-3 border border-[var(--border)] hover:border-[var(--primary)]/30 transition-colors stagger-in skill-card-hover">
                    <div className="flex items-start justify-between">
                      <div className="skill-icon-wrap"><SkillIcon skill={skill} index={i} /></div>
                      <button onClick={() => unfavorite(skill.slug)} className="w-7 h-7 rounded-md hover:bg-red-50 flex items-center justify-center text-[var(--text-muted)] hover:text-red-500 transition-colors" title="取消收藏">
                        <Heart className="w-3.5 h-3.5 fill-current text-red-400" />
                      </button>
                    </div>
                    <Link href={`/skill/${skill.owner_name || '_'}/${skill.slug}`}>
                      <h3 className="text-[15px] font-semibold text-[var(--text-primary)] hover:text-[var(--primary)]">{skill.name}</h3>
                    </Link>
                    <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed line-clamp-2">{skill.description || '暂无描述'}</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {(skill.tags || []).slice(0, 3).map(tag => (
                        <span key={tag} className="bg-[var(--tag-bg)] text-[var(--text-secondary)] text-[12px] px-2 py-0.5 rounded">{tag}</span>
                      ))}
                    </div>
                    <div className="flex items-center justify-between mt-auto pt-1">
                      <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]"><Download className="w-3 h-3" />{skill.download_count || 0}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="surface-card border-dashed rounded-[10px] text-center py-16 flex flex-col items-center gap-3">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--bg-page)] flex items-center justify-center">
                  <Heart className="w-7 h-7 text-[var(--text-muted)]" />
                </div>
                <p className="text-[15px] font-medium text-[var(--text-primary)]">暂无收藏</p>
                <p className="text-[13px] mt-1.5 text-[var(--text-muted)]">浏览技能库，点击收藏感兴趣的内容</p>
                <Link href="/market" className="text-[13px] font-medium text-[var(--primary)] hover:underline">浏览技能市场</Link>
              </div>
            )}
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </div>
      </div>
    </div>
  );
}
