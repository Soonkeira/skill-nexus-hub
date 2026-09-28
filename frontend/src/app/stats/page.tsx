'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Skill } from '@/lib/types';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import AlertDialog from '@/components/AlertDialog';
import { TrendingUp, Download, Users, Package } from 'lucide-react';
interface Stats { total_skills: number; total_downloads: number; total_users: number; total_versions: number; }

export default function StatsPage() {
  const auth = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [topSkills, setTopSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.isLoggedIn) return;
    Promise.all([
      api.get('/stats/overview').then(({ data }) => setStats(data)).catch(() => setError('无法加载统计数据')),
      api.get('/skills', { params: { page: 1, page_size: 5 } }).then(({ data }) => setTopSkills(data.items || [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [auth.isLoggedIn]);

  if (!auth.isLoggedIn) return null;
  if (loading) return <div className="flex h-screen"><Sidebar /><div className="flex-1 flex items-center justify-center text-[var(--text-muted)]">加载中...</div></div>;

  if (error) return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex items-center justify-center text-[var(--text-muted)]">
        <AlertDialog
          open={true}
          title="加载失败"
          message={error}
          icon="warning"
          onClose={() => setError(null)}
        />
      </div>
    </div>
  );

  const cards = stats ? [
    { label: '技能总数', value: stats.total_skills, iconBg: 'bg-blue-50', tone: 'text-blue-600', icon: Package },
    { label: '总下载量', value: stats.total_downloads, iconBg: 'bg-emerald-50', tone: 'text-emerald-600', icon: Download },
    { label: '注册用户', value: stats.total_users, iconBg: 'bg-violet-50', tone: 'text-violet-600', icon: Users },
    { label: '版本总数', value: stats.total_versions, iconBg: 'bg-amber-50', tone: 'text-amber-600', icon: TrendingUp },
  ] : [];

  const maxDownloads = topSkills.length > 0 ? Math.max(...topSkills.map(s => s.download_count || 0), 1) : 1;

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-6 flex flex-col gap-5">
            <div className="page-hero rounded-xl p-6">
              <h1 className="text-[22px] font-semibold text-[var(--text-primary)]">数据统计</h1>
              <p className="text-[13px] text-[var(--text-muted)] mt-1">统计数据来自技能下载、版本和用户活动，用于观察内部 Skill 的使用情况。</p>
            </div>
            {stats && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  {cards.map(c => {
                    const Icon = c.icon;
                    return (
                      <div key={c.label} className="metric-tile rounded-[10px] p-5 flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${c.iconBg}`}>
                          <Icon className={`w-5 h-5 ${c.tone}`} />
                        </div>
                        <div>
                          <p className="text-[12px] text-[var(--text-muted)]">{c.label}</p>
                          <p className={`text-xl font-bold ${c.tone}`}>{c.value.toLocaleString()}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {/* Popular Skills */}
                  <div className="surface-card rounded-[10px] p-5">
                    <h2 className="text-[15px] font-semibold text-[var(--text-primary)] mb-4">热门技能</h2>
                    {topSkills.length > 0 ? (
                      <div className="flex flex-col gap-3">
                        {topSkills.map((skill, i) => (
                          <div key={skill.id} className="flex items-center gap-3">
                            <span className="text-[13px] text-[var(--text-muted)] w-5 text-right font-medium">{i + 1}</span>
                            <span className="text-[13px] text-[var(--text-primary)] w-28 truncate font-medium">{skill.name}</span>
                            <div className="flex-1 h-7 bg-[var(--bg-page)] rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-[var(--primary)] transition-all duration-500" style={{ width: `${Math.max((skill.download_count || 0) / maxDownloads * 100, 4)}%` }} />
                            </div>
                            <span className="text-[13px] text-[var(--text-muted)] w-14 text-right tabular-nums">{skill.download_count || 0}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <p className="text-[13px] font-medium text-[var(--text-primary)]">暂无热门技能</p>
                        <p className="text-[12px] text-[var(--text-muted)] mt-1">技能产生下载后，这里会展示 Top 5 排名。</p>
                      </div>
                    )}
                  </div>

                  {/* Quick Stats */}
                  <div className="surface-card rounded-[10px] p-5">
                    <h2 className="text-[15px] font-semibold text-[var(--text-primary)] mb-4">平台概览</h2>
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center justify-between py-2 border-b border-[var(--border)]">
                        <span className="text-[13px] text-[var(--text-secondary)]">平均每技能下载量</span>
                        <span className="text-[15px] font-semibold text-[var(--text-primary)]">{stats.total_skills > 0 ? Math.round(stats.total_downloads / stats.total_skills) : 0}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 border-b border-[var(--border)]">
                        <span className="text-[13px] text-[var(--text-secondary)]">平均每技能版本数</span>
                        <span className="text-[15px] font-semibold text-[var(--text-primary)]">{stats.total_skills > 0 ? (stats.total_versions / stats.total_skills).toFixed(1) : '0'}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 border-b border-[var(--border)]">
                        <span className="text-[13px] text-[var(--text-secondary)]">每用户技能数</span>
                        <span className="text-[15px] font-semibold text-[var(--text-primary)]">{stats.total_users > 0 ? (stats.total_skills / stats.total_users).toFixed(1) : '0'}</span>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-[13px] text-[var(--text-secondary)]">总下载量</span>
                        <span className="text-[15px] font-semibold text-[var(--text-primary)]">{stats.total_downloads.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
