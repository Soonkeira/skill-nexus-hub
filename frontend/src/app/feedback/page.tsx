'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import AlertDialog from '@/components/AlertDialog';
import { MessageCircle, Send, AlertTriangle, HelpCircle, Lightbulb, MoreHorizontal } from 'lucide-react';

const feedbackTypes = [
  { value: 'bug', label: '遇到 BUG', icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50 border-red-200' },
  { value: 'usage', label: '不会使用', icon: HelpCircle, color: 'text-amber-500', bg: 'bg-amber-50 border-amber-200' },
  { value: 'suggestion', label: '提出建议', icon: Lightbulb, color: 'text-blue-500', bg: 'bg-blue-50 border-blue-200' },
  { value: 'other', label: '其他', icon: MoreHorizontal, color: 'text-[var(--text-muted)]', bg: 'bg-gray-50 border-gray-200' },
];

export default function FeedbackPage() {
  const auth = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [feedbackType, setFeedbackType] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function validate() {
    if (!title.trim()) { setError('请输入标题'); return false; }
    if (!feedbackType) { setError('请选择反馈类型'); return false; }
    if (!description.trim()) { setError('请输入详细说明'); return false; }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!validate()) return;

    setSubmitting(true);
    try {
      await api.post('/feedback', {
        title: title.trim(),
        feedback_type: feedbackType,
        description: description.trim(),
      });
      router.push('/my-feedback');
    } catch (err: any) {
      setError(err.response?.data?.detail || '提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-6 flex flex-col gap-5">
            <div className="page-hero rounded-xl p-6">
              <div className="inline-flex items-center gap-2 text-[12px] text-[var(--primary)] font-medium bg-blue-50 px-2.5 py-1 rounded-md">
                <MessageCircle className="w-3.5 h-3.5" />
                问题反馈
              </div>
              <h1 className="text-[24px] font-bold text-[var(--text-primary)] mt-3">提交反馈</h1>
              <p className="text-[13px] text-[var(--text-secondary)] mt-2 leading-relaxed">
                遇到问题或有好想法？告诉我们，我们会认真对待每一条反馈。
              </p>
            </div>

            <form onSubmit={handleSubmit} className="surface-card rounded-xl p-6 flex flex-col gap-5">
              <AlertDialog
                open={!!error}
                title="操作失败"
                message={error}
                icon="warning"
                onClose={() => setError('')}
              />

              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[var(--text-primary)]" htmlFor="title">标题</label>
                <input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  type="text"
                  maxLength={200}
                  placeholder="简要描述你遇到的问题或建议"
                  className="focus-ring w-full rounded-lg border border-[var(--border)] bg-[var(--bg-page)] px-3.5 py-2.5 text-[13px] text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:bg-white focus:ring-2 focus:ring-blue-50"
                />
              </div>

              <div>
                <label className="mb-2 block text-[13px] font-medium text-[var(--text-primary)]">反馈类型</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {feedbackTypes.map((ft) => {
                    const Icon = ft.icon;
                    const selected = feedbackType === ft.value;
                    return (
                      <button
                        key={ft.value}
                        type="button"
                        onClick={() => setFeedbackType(ft.value)}
                        className={`focus-ring flex flex-col items-center gap-1.5 rounded-lg border p-3 text-[12px] font-medium transition-all ${
                          selected
                            ? `${ft.bg} ${ft.color} border-current shadow-sm`
                            : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--tag-bg)]'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        {ft.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[var(--text-primary)]" htmlFor="desc">详细说明</label>
                <textarea
                  id="desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={6}
                  maxLength={5000}
                  placeholder={`请尽量详细描述，例如：\n• 问题出现在哪个页面？进行了什么操作？\n• 你期望的结果是什么？\n• 实际发生了什么？\n• 如果是建议，描述你希望的功能和场景`}
                  className="focus-ring w-full rounded-lg border border-[var(--border)] bg-[var(--bg-page)] px-3.5 py-2.5 text-[13px] text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:bg-white focus:ring-2 focus:ring-blue-50 resize-none leading-relaxed"
                />
                <p className="mt-1 text-[12px] text-[var(--text-muted)] text-right">{description.length}/5000</p>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={submitting || !auth.isLoggedIn}
                  className="btn-press inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-6 py-2.5 text-[13px] font-semibold text-white transition-all hover:bg-[var(--primary-dark)] hover:shadow-[var(--shadow-soft)] disabled:opacity-50"
                >
                  {submitting ? '提交中...' : <><Send className="w-3.5 h-3.5" />提交反馈</>}
                </button>
                {!auth.isLoggedIn && (
                  <span className="text-[12px] text-[var(--text-muted)]">请先登录后再提交反馈</span>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
