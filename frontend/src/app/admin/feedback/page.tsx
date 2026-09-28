'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import type { Feedback, FeedbackType, FeedbackStatus } from '@/lib/types';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import AlertDialog from '@/components/AlertDialog';
import {
  Shield,
  Search,
  AlertTriangle,
  HelpCircle,
  Lightbulb,
  MoreHorizontal,
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  Send,
  Filter,
} from 'lucide-react';
import Pagination from '@/components/Pagination';

const typeConfig: Record<FeedbackType, { label: string; icon: typeof AlertTriangle; color: string }> = {
  bug: { label: 'BUG', icon: AlertTriangle, color: 'text-red-500 bg-red-50' },
  usage: { label: '使用', icon: HelpCircle, color: 'text-amber-500 bg-amber-50' },
  suggestion: { label: '建议', icon: Lightbulb, color: 'text-blue-500 bg-blue-50' },
  other: { label: '其他', icon: MoreHorizontal, color: 'text-[var(--text-muted)] bg-gray-50' },
};

const statusOptions: { value: FeedbackStatus; label: string; icon: typeof Clock; color: string }[] = [
  { value: 'pending', label: '待处理', icon: Clock, color: 'text-[var(--text-muted)] bg-gray-50' },
  { value: 'processing', label: '处理中', icon: Loader2, color: 'text-amber-500 bg-amber-50' },
  { value: 'resolved', label: '已解决', icon: CheckCircle2, color: 'text-green-600 bg-green-50' },
  { value: 'closed', label: '已关闭', icon: XCircle, color: 'text-[var(--text-muted)] bg-gray-50' },
];

const statusConfig = Object.fromEntries(statusOptions.map(s => [s.value, s])) as Record<FeedbackStatus, typeof statusOptions[0]>;

export default function AdminFeedbackPage() {
  const [items, setItems] = useState<Feedback[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const pageSize = 20;
  const totalPages = Math.ceil(total / pageSize);
  const [errorMsg, setErrorMsg] = useState('');

  // Filters
  const [q, setQ] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Reply dialog
  const [replyingTo, setReplyingTo] = useState<Feedback | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyStatus, setReplyStatus] = useState<string>('');
  const [sending, setSending] = useState(false);

  function loadFeedback() {
    setLoading(true);
    const params: Record<string, unknown> = { page, page_size: pageSize };
    if (q) params.q = q;
    if (filterType) params.feedback_type = filterType;
    if (filterStatus) params.status = filterStatus;

    api.get('/admin/feedback', { params })
      .then(({ data }) => { setItems(data.items); setTotal(data.total); })
      .catch((e) => { setItems([]); setErrorMsg(e.response?.data?.detail || '加载失败'); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadFeedback(); }, [page]);
  useEffect(() => { if (page === 1) loadFeedback(); else setPage(1); }, [q, filterType, filterStatus]);

  function openReply(fb: Feedback) {
    setReplyingTo(fb);
    setReplyText('');
    setReplyStatus(fb.status);
  }

  async function sendReply() {
    if (!replyingTo || !replyText.trim()) return;
    setSending(true);
    try {
      await api.put(`/admin/feedback/${replyingTo.id}/reply`, {
        reply: replyText.trim(),
        status: replyStatus || undefined,
      });
      setReplyingTo(null);
      loadFeedback();
    } catch (e: any) {
      setErrorMsg(e.response?.data?.detail || '回复失败');
    } finally {
      setSending(false);
    }
  }

  async function updateStatus(fb: Feedback, newStatus: string) {
    try {
      await api.put(`/admin/feedback/${fb.id}/status`, { status: newStatus });
      loadFeedback();
    } catch (e: any) {
      setErrorMsg(e.response?.data?.detail || '操作失败');
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-6 flex flex-col gap-5">
            <div className="page-hero rounded-xl p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 text-[12px] text-[var(--primary)] font-medium bg-blue-50 px-2.5 py-1 rounded-md">
                  <Shield className="w-3.5 h-3.5" />
                  管理员
                </div>
                <h1 className="text-[22px] font-bold text-[var(--text-primary)] mt-3">反馈管理</h1>
                <p className="text-[13px] text-[var(--text-muted)] mt-1">查看和回复用户反馈，共 {total} 条。</p>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="flex items-center gap-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg h-10 px-3 flex-1 max-w-md shadow-sm">
                <Search className="w-4 h-4 text-[var(--text-muted)]" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索标题或描述..."
                  className="bg-transparent text-[13px] text-[var(--text-primary)] outline-none w-full placeholder:text-[var(--text-muted)]" />
              </div>
              <div className="flex items-center gap-2 overflow-x-auto">
                <span className="hidden lg:inline-flex items-center gap-1 text-[12px] text-[var(--text-muted)] px-1">
                  <Filter className="w-3.5 h-3.5" />类型
                </span>
                <button onClick={() => setFilterType('')}
                  className={`px-3 py-2 rounded-md text-[13px] border transition-colors whitespace-nowrap ${!filterType ? 'bg-[var(--primary)] text-white font-medium border-[var(--primary)]' : 'surface-card text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--tag-bg)]'}`}>
                  全部
                </button>
                {Object.entries(typeConfig).map(([key, cfg]) => (
                  <button key={key} onClick={() => setFilterType(filterType === key ? '' : key)}
                    className={`px-3 py-2 rounded-md text-[13px] border transition-colors whitespace-nowrap ${filterType === key ? 'bg-[var(--primary)] text-white font-medium border-[var(--primary)]' : 'surface-card text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--tag-bg)]'}`}>
                    {cfg.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 overflow-x-auto">
                <span className="hidden lg:inline-flex items-center gap-1 text-[12px] text-[var(--text-muted)] px-1">状态</span>
                <button onClick={() => setFilterStatus('')}
                  className={`px-3 py-2 rounded-md text-[13px] border transition-colors whitespace-nowrap ${!filterStatus ? 'bg-[var(--primary)] text-white font-medium border-[var(--primary)]' : 'surface-card text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--tag-bg)]'}`}>
                  全部
                </button>
                {statusOptions.map((s) => (
                  <button key={s.value} onClick={() => setFilterStatus(filterStatus === s.value ? '' : s.value)}
                    className={`px-3 py-2 rounded-md text-[13px] border transition-colors whitespace-nowrap ${filterStatus === s.value ? 'bg-[var(--primary)] text-white font-medium border-[var(--primary)]' : 'surface-card text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--tag-bg)]'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            {loading ? (
              <div className="text-center py-16 text-[13px] text-[var(--text-muted)]">加载中...</div>
            ) : items.length > 0 ? (
              <div className="table-shell rounded-xl overflow-hidden border border-[var(--border)]">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--bg-card-subtle)]">
                      <th className="text-left py-3 px-4 font-medium text-[var(--text-muted)]">反馈</th>
                      <th className="text-left py-3 px-4 font-medium text-[var(--text-muted)]">用户</th>
                      <th className="text-center py-3 px-4 font-medium text-[var(--text-muted)]">类型</th>
                      <th className="text-center py-3 px-4 font-medium text-[var(--text-muted)]">状态</th>
                      <th className="text-left py-3 px-4 font-medium text-[var(--text-muted)]">时间</th>
                      <th className="text-center py-3 px-4 font-medium text-[var(--text-muted)]">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((fb) => {
                      const tc = typeConfig[fb.feedback_type as FeedbackType] || typeConfig.other;
                      const sc = statusConfig[fb.status as FeedbackStatus] || statusConfig.pending;
                      const TypeIcon = tc.icon;
                      const StatusIcon = sc.icon;
                      return (
                        <tr key={fb.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-card-subtle)]">
                          <td className="py-3 px-4 max-w-[320px]">
                            <p className="font-medium text-[var(--text-primary)] truncate">{fb.title}</p>
                            <p className="text-[12px] text-[var(--text-muted)] line-clamp-1 mt-0.5">{fb.description}</p>
                            {fb.admin_reply && (
                              <p className="text-[12px] text-[var(--primary)] mt-1 line-clamp-1">已回复: {fb.admin_reply}</p>
                            )}
                          </td>
                          <td className="py-3 px-4 text-[var(--text-secondary)]">{fb.username || '-'}</td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded ${tc.color}`}>
                              <TypeIcon className="w-3 h-3" />{tc.label}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <select
                              value={fb.status}
                              onChange={(e) => updateStatus(fb, e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              className={`text-[11px] font-medium px-2 py-1 rounded border-none outline-none cursor-pointer ${sc.color}`}
                            >
                              {statusOptions.map(s => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 px-4 text-[var(--text-muted)] text-[12px]">
                            {new Date(fb.created_at).toLocaleDateString('zh-CN')}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => openReply(fb)}
                              className="btn-press inline-flex items-center gap-1 text-[12px] font-medium text-[var(--primary)] px-3 py-1.5 rounded-md hover:bg-blue-50 transition-colors"
                            >
                              <Send className="w-3 h-3" />
                              回复
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-16 text-[13px] text-[var(--text-muted)]">暂无反馈数据</div>
            )}

            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </div>
      </div>

      {/* Reply Dialog */}
      {replyingTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setReplyingTo(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative surface-card rounded-xl p-6 w-[540px] max-h-[80vh] overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[16px] font-semibold text-[var(--text-primary)] mb-1">回复反馈</h3>
            <p className="text-[12px] text-[var(--text-muted)] mb-4">{replyingTo.title}</p>

            <div className="rounded-lg bg-[var(--bg-page)] p-3 mb-4">
              <p className="text-[12px] font-medium text-[var(--text-secondary)] mb-1">用户描述</p>
              <p className="text-[13px] text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">{replyingTo.description}</p>
            </div>

            {replyingTo.admin_reply && (
              <div className="rounded-lg bg-blue-50/60 border border-blue-100 p-3 mb-4">
                <p className="text-[12px] font-medium text-[var(--primary)] mb-1">当前回复</p>
                <p className="text-[13px] text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">{replyingTo.admin_reply}</p>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[var(--text-muted)]">回复内容</label>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={4}
                  placeholder="输入管理员回复..."
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-page)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none resize-none focus:border-[var(--primary)] placeholder:text-[var(--text-muted)]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[var(--text-muted)]">更新状态</label>
                <div className="flex gap-2">
                  {statusOptions.map((s) => {
                    const StatusIcon = s.icon;
                    return (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setReplyStatus(s.value)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-medium border transition-colors ${
                          replyStatus === s.value
                            ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                            : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--tag-bg)]'
                        }`}
                      >
                        <StatusIcon className={`w-3 h-3 ${s.value === 'processing' && replyStatus === s.value ? 'animate-spin' : ''}`} />
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setReplyingTo(null)} className="px-4 py-2 text-[13px] rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--tag-bg)]">取消</button>
              <button onClick={sendReply} disabled={sending || !replyText.trim()} className="btn-press px-4 py-2 text-[13px] rounded-lg bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary-dark)] disabled:opacity-50">
                {sending ? '发送中...' : '发送回复'}
              </button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog
        open={!!errorMsg}
        title="操作失败"
        message={errorMsg}
        icon="warning"
        onClose={() => setErrorMsg('')}
      />
    </div>
  );
}
