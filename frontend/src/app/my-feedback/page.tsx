'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Feedback, FeedbackType, FeedbackStatus } from '@/lib/types';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import {
  FileText,
  AlertTriangle,
  HelpCircle,
  Lightbulb,
  MoreHorizontal,
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Plus,
  Filter,
} from 'lucide-react';
import Pagination from '@/components/Pagination';

const typeConfig: Record<FeedbackType, { label: string; icon: typeof AlertTriangle; color: string }> = {
  bug: { label: 'BUG', icon: AlertTriangle, color: 'text-red-500 bg-red-50' },
  usage: { label: '使用', icon: HelpCircle, color: 'text-amber-500 bg-amber-50' },
  suggestion: { label: '建议', icon: Lightbulb, color: 'text-blue-500 bg-blue-50' },
  other: { label: '其他', icon: MoreHorizontal, color: 'text-[var(--text-muted)] bg-gray-50' },
};

const statusConfig: Record<FeedbackStatus, { label: string; icon: typeof Clock; color: string }> = {
  pending: { label: '待处理', icon: Clock, color: 'text-[var(--text-muted)] bg-gray-50' },
  processing: { label: '处理中', icon: Loader2, color: 'text-amber-500 bg-amber-50' },
  resolved: { label: '已解决', icon: CheckCircle2, color: 'text-green-600 bg-green-50' },
  closed: { label: '已关闭', icon: XCircle, color: 'text-[var(--text-muted)] bg-gray-50' },
};

export default function MyFeedbackPage() {
  const auth = useAuth();
  const [items, setItems] = useState<Feedback[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const pageSize = 20;
  const totalPages = Math.ceil(total / pageSize);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  function loadFeedback() {
    setLoading(true);
    api.get('/feedback/my', { params: { page, page_size: pageSize } })
      .then(({ data }) => { setItems(data.items); setTotal(data.total); })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (auth.user) loadFeedback();
  }, [auth.user, page]);

  const filteredItems = items.filter((fb) => {
    if (filterType && fb.feedback_type !== filterType) return false;
    if (filterStatus && fb.status !== filterStatus) return false;
    return true;
  });

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
                  <FileText className="w-3.5 h-3.5" />
                  反馈记录
                </div>
                <h1 className="text-[22px] font-bold text-[var(--text-primary)] mt-3">我的反馈</h1>
                <p className="text-[13px] text-[var(--text-muted)] mt-1">查看你提交的所有反馈及处理进度。</p>
              </div>
              <Link
                href="/feedback"
                className="btn-press flex items-center gap-1.5 text-[13px] font-medium text-white px-4 py-2 rounded-lg bg-[var(--primary)] transition-all hover:shadow-[var(--shadow-soft)]"
              >
                <Plus className="w-3.5 h-3.5" />
                新建反馈
              </Link>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 overflow-x-auto">
              <span className="hidden lg:inline-flex items-center gap-1 text-[12px] text-[var(--text-muted)] px-1">
                <Filter className="w-3.5 h-3.5" />类型
              </span>
              <button onClick={() => setFilterType('')}
                className={`px-3 py-1.5 rounded-md text-[12px] border transition-colors whitespace-nowrap ${!filterType ? 'bg-[var(--primary)] text-white font-medium border-[var(--primary)]' : 'surface-card text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--tag-bg)]'}`}>
                全部
              </button>
              {Object.entries(typeConfig).map(([key, cfg]) => (
                <button key={key} onClick={() => setFilterType(filterType === key ? '' : key)}
                  className={`px-3 py-1.5 rounded-md text-[12px] border transition-colors whitespace-nowrap ${filterType === key ? 'bg-[var(--primary)] text-white font-medium border-[var(--primary)]' : 'surface-card text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--tag-bg)]'}`}>
                  {cfg.label}
                </button>
              ))}
              <span className="hidden lg:inline-flex items-center gap-1 text-[12px] text-[var(--text-muted)] px-1 ml-2">状态</span>
              <button onClick={() => setFilterStatus('')}
                className={`px-3 py-1.5 rounded-md text-[12px] border transition-colors whitespace-nowrap ${!filterStatus ? 'bg-[var(--primary)] text-white font-medium border-[var(--primary)]' : 'surface-card text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--tag-bg)]'}`}>
                全部
              </button>
              {Object.entries(statusConfig).map(([key, cfg]) => (
                <button key={key} onClick={() => setFilterStatus(filterStatus === key ? '' : key)}
                  className={`px-3 py-1.5 rounded-md text-[12px] border transition-colors whitespace-nowrap ${filterStatus === key ? 'bg-[var(--primary)] text-white font-medium border-[var(--primary)]' : 'surface-card text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--tag-bg)]'}`}>
                  {cfg.label}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="grid gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="surface-card rounded-xl p-5">
                    <div className="flex items-center gap-3">
                      <div className="skeleton w-14 h-5 rounded" />
                      <div className="skeleton h-4 w-40" />
                    </div>
                    <div className="skeleton h-3 w-full mt-3" />
                    <div className="skeleton h-3 w-2/3 mt-2" />
                  </div>
                ))}
              </div>
            ) : filteredItems.length > 0 ? (
              <div className="grid gap-3">
                {filteredItems.map((fb) => {
                  const tc = typeConfig[fb.feedback_type as FeedbackType] || typeConfig.other;
                  const sc = statusConfig[fb.status as FeedbackStatus] || statusConfig.pending;
                  const TypeIcon = tc.icon;
                  const StatusIcon = sc.icon;
                  const expanded = expandedId === fb.id;

                  return (
                    <div
                      key={fb.id}
                      className="surface-card rounded-xl transition-all cursor-pointer hover:border-[var(--primary)]/20"
                      onClick={() => setExpandedId(expanded ? null : fb.id)}
                    >
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded ${tc.color}`}>
                              <TypeIcon className="w-3 h-3" />
                              {tc.label}
                            </span>
                            <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded ${sc.color}`}>
                              <StatusIcon className={`w-3 h-3 ${fb.status === 'processing' ? 'animate-spin' : ''}`} />
                              {sc.label}
                            </span>
                            <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">{fb.title}</h3>
                          </div>
                          <span className="text-[12px] text-[var(--text-muted)] whitespace-nowrap">
                            {new Date(fb.created_at).toLocaleDateString('zh-CN')}
                          </span>
                        </div>

                        {expanded && (
                          <div className="mt-4 pt-4 border-t border-[var(--border)]">
                            <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{fb.description}</p>

                            {fb.admin_reply && (
                              <div className="mt-4 rounded-lg bg-blue-50/60 border border-blue-100 p-4">
                                <div className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--primary)] mb-2">
                                  <MessageSquare className="w-3.5 h-3.5" />
                                  管理员回复
                                  {fb.replier_name && <span className="text-[var(--text-muted)] ml-1">by {fb.replier_name}</span>}
                                  {fb.replied_at && (
                                    <span className="text-[var(--text-muted)] ml-auto">
                                      {new Date(fb.replied_at).toLocaleDateString('zh-CN')}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[13px] text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">{fb.admin_reply}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="surface-card border-dashed rounded-xl text-center py-16 flex flex-col items-center gap-3">
                <div className="w-11 h-11 rounded-lg bg-blue-50 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-[var(--primary)]" />
                </div>
                <div>
                  <p className="text-[14px] font-medium text-[var(--text-primary)]">暂无反馈记录</p>
                  <p className="text-[13px] text-[var(--text-muted)] mt-1">提交第一条反馈后，在这里查看处理进度。</p>
                </div>
                <Link href="/feedback" className="text-[13px] font-medium text-[var(--primary)] hover:underline">提交反馈</Link>
              </div>
            )}

            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </div>
      </div>
    </div>
  );
}
