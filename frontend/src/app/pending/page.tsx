'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import { Check, X, Download, ClipboardCheck } from 'lucide-react';
import { useToast } from '@/lib/toast';
import { formatDate, formatFileSize } from '@/utils';
import ConfirmDialog from '@/components/ConfirmDialog';
import AlertDialog from '@/components/AlertDialog';
import { useAuth } from '@/lib/auth';

type PendingVersion = {
  id: string;
  version_id: string;
  skill_slug: string;
  skill_name: string;
  owner_username: string;
  version: string;
  original_filename: string | null;
  file_size: number;
  publisher_username: string;
  created_at: string;
};

export default function PendingPage() {
  const auth = useAuth();
  const [versions, setVersions] = useState<PendingVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<{action: string, slug: string, version: string, owner: string} | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const { addToast } = useToast();

  useEffect(() => {
    api.get('/pending').then(({ data }) => setVersions((data as { items?: PendingVersion[] }).items || [])).catch((e) => { console.error('Failed to load pending:', e); }).finally(() => setLoading(false));
  }, []);

  async function approve(skillSlug: string, version: string, owner: string) {
    try {
      await api.post(`/skills/by-slug/${skillSlug}/versions/${version}/approve`, null, { params: { owner } });
      setVersions(versions.filter((v) => !(v.skill_slug === skillSlug && v.version === version && v.owner_username === owner)));
      addToast('版本已批准', 'success');
    } catch (e: any) { setErrorMsg(e.response?.data?.detail || '操作失败，请稍后重试'); }
  }

  async function reject(skillSlug: string, version: string, owner: string) {
    try {
      await api.post(`/skills/by-slug/${skillSlug}/versions/${version}/reject`, { reason: rejectReason.trim() || undefined }, { params: { owner } });
      setVersions(versions.filter((v) => !(v.skill_slug === skillSlug && v.version === version && v.owner_username === owner)));
      addToast('版本已拒绝', 'success');
    } catch (e: any) { setErrorMsg(e.response?.data?.detail || '操作失败，请稍后重试'); }
  }

  async function downloadForReview(v: PendingVersion) {
    setDownloadingId(v.id);
    try {
      const { data, headers } = await api.get(
        `/skills/by-slug/${v.skill_slug}/versions/${v.version}/download`,
        { responseType: 'blob', params: { owner: v.owner_username } },
      );
      const contentType = typeof headers['content-type'] === 'string' ? headers['content-type'] : 'application/zip';
      const blob = new Blob([data], { type: contentType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = v.original_filename || `${v.skill_slug}-${v.version}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to download review file:', e);
      addToast('下载失败', 'error');
    } finally {
      setDownloadingId(null);
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
              <h1 className="text-[22px] font-semibold text-[var(--text-primary)]">待审批</h1>
              <p className="text-[13px] text-[var(--text-muted)] mt-1">{auth.isAdmin ? '集中处理提交上来的 Skill 版本，审批通过后会进入内部市场。' : '这里显示你提交后仍在等待管理员审核的 Skill 版本。'}</p>
            </div>
            {loading ? <p className="text-[13px] text-[var(--text-muted)]">加载中...</p> : versions.length > 0 ? (
              <div className="table-shell rounded-[10px]">
                <table className="w-full text-[13px]">
                  <thead><tr className="border-b border-[var(--border)]">
                    <th className="text-left px-5 py-3 font-medium text-[11px] text-[var(--text-muted)]">技能</th>
                    <th className="text-left px-5 py-3 font-medium text-[11px] text-[var(--text-muted)]">版本</th>
                    <th className="text-left px-5 py-3 font-medium text-[11px] text-[var(--text-muted)]">文件信息</th>
                    <th className="text-left px-5 py-3 font-medium text-[11px] text-[var(--text-muted)]">提交时间</th>
                    {auth.isAdmin ? <th className="text-left px-5 py-3 font-medium text-[11px] text-[var(--text-muted)]">操作</th> : <th className="text-left px-5 py-3 font-medium text-[11px] text-[var(--text-muted)]">状态</th>}
                  </tr></thead>
                  <tbody>
                    {versions.map((v) => (
                      <tr key={v.id} className="border-b border-[var(--border)] last:border-0 hover:bg-gray-50">
                        <td className="px-5 py-3 font-medium text-[var(--text-primary)]">{v.skill_name || v.skill_slug}</td>
                        <td className="px-5 py-3 text-[var(--text-secondary)]">{v.version}</td>
                        <td className="px-5 py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[12px] text-[var(--text-secondary)]">{v.original_filename || '-'}</span>
                            <span className="text-[11px] text-[var(--text-muted)]">{v.file_size ? formatFileSize(v.file_size) : '-'}</span>
                            <button type="button" onClick={() => downloadForReview(v)} disabled={downloadingId === v.id} className="flex items-center gap-1 text-[11px] text-[var(--primary)] hover:underline disabled:opacity-50"><Download className="w-3 h-3" />{downloadingId === v.id ? '下载中...' : '下载审查'}</button>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-[11px] text-[var(--text-muted)]">{formatDate(v.created_at)}</td>
                        <td className="px-5 py-3">
                          <div className="flex gap-2">
                            {auth.isAdmin ? (
                              <>
                                <button onClick={() => setPendingAction({action: 'approve', slug: v.skill_slug, version: v.version, owner: v.owner_username})} className="flex items-center gap-1 text-green-600 hover:text-green-800 text-[12px]"><Check className="w-3.5 h-3.5" />通过</button>
                                <button onClick={() => setPendingAction({action: 'reject', slug: v.skill_slug, version: v.version, owner: v.owner_username})} className="flex items-center gap-1 text-red-600 hover:text-red-800 text-[12px]"><X className="w-3.5 h-3.5" />拒绝</button>
                              </>
                            ) : (
                              <span className="text-[12px] text-amber-600">等待审核</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-white border border-dashed border-[var(--border)] rounded-[10px] text-center py-16 flex flex-col items-center gap-3">
                <div className="w-11 h-11 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <ClipboardCheck className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-[14px] font-medium text-[var(--text-primary)]">暂无待审批版本</p>
                  <p className="text-[13px] text-[var(--text-muted)] mt-1">
                    {auth.isAdmin
                      ? '等待提交审核的版本会显示在这里，你可以下载文件后通过或拒绝。'
                      : '你提交后仍在等待管理员审核的版本会显示在这里，请耐心等待。'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={pendingAction !== null && pendingAction.action === 'approve'}
        title="确认批准"
        message="确定要批准该版本吗？批准后将对所有用户可见，系统将自动触发 AI 分析（如已配置默认 LLM 提供商）。"
        confirmText="批准"
        onConfirm={() => { if (pendingAction) approve(pendingAction.slug, pendingAction.version, pendingAction.owner); setPendingAction(null); }}
        onCancel={() => setPendingAction(null)}
      />

      {/* Reject dialog with reason */}
      {pendingAction?.action === 'reject' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setPendingAction(null); setRejectReason(''); }} />
          <div className="relative z-10 bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-3">拒绝版本</h3>
            <p className="text-[13px] text-[var(--text-secondary)] mb-3">确定要拒绝该版本吗？可以填写拒绝原因。</p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="拒绝原因（可选）..."
              rows={3}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none resize-none mb-4 focus:border-[var(--primary)]"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setPendingAction(null); setRejectReason(''); }} className="px-4 py-2 text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">取消</button>
              <button onClick={() => { if (pendingAction) reject(pendingAction.slug, pendingAction.version, pendingAction.owner); setPendingAction(null); setRejectReason(''); }} className="px-4 py-2 text-[13px] bg-red-600 text-white rounded-md font-medium hover:bg-red-700">拒绝</button>
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
