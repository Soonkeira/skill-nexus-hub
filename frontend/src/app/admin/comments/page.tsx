'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import Link from 'next/link';
import { MessageSquare, Search, Trash2 } from 'lucide-react';
import ConfirmDialog from '@/components/ConfirmDialog';
import Pagination from '@/components/Pagination';

interface Comment {
  id: number;
  skill_id: number;
  skill_name: string;
  skill_slug: string;
  owner_username: string;
  user_id: number;
  username: string;
  content: string;
  parent_id: number | null;
  created_at: string;
}

export default function AdminCommentsPage() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [skillSlug, setSkillSlug] = useState('');
  const [username, setUsername] = useState('');
  const pageSize = 20;
  const totalPages = Math.ceil(total / pageSize);

  const [deletingComment, setDeletingComment] = useState<Comment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);

  function loadComments() {
    setLoading(true);
    api.get('/admin/comments', { params: { page, page_size: pageSize, skill_slug: skillSlug || undefined, username: username || undefined } })
      .then(({ data }) => { setComments(data.items); setTotal(data.total); setSelectedIds(new Set()); })
      .catch(() => setComments([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadComments(); }, [page]);
  useEffect(() => { if (page === 1) loadComments(); else setPage(1); }, [skillSlug, username]);

  async function confirmDelete() {
    if (!deletingComment) return;
    setDeleting(true);
    try {
      await api.delete(`/admin/comments/${deletingComment.id}`);
      setDeletingComment(null);
      loadComments();
    } catch {
      setDeletingComment(null);
    } finally {
      setDeleting(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const allSelected = comments.length > 0 && comments.every(c => selectedIds.has(String(c.id)));
  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(comments.map(c => String(c.id))));
    }
  }

  async function confirmBulkDelete() {
    setBulkDeleting(true);
    try {
      const { data } = await api.post('/admin/comments/bulk-delete', { comment_ids: Array.from(selectedIds) });
      setConfirmBulk(false);
      setSelectedIds(new Set());
      loadComments();
      // surface count silently — could be a toast if available
      void data;
    } catch {
      setConfirmBulk(false);
    } finally {
      setBulkDeleting(false);
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
                  <MessageSquare className="w-3.5 h-3.5" />
                  管理员
                </div>
                <h1 className="text-[22px] font-bold text-[var(--text-primary)] mt-3">评论管理</h1>
                <p className="text-[13px] text-[var(--text-muted)] mt-1">管理所有用户的评论，共 {total} 条。</p>
              </div>
            </div>

            {/* Search */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2 surface-card border border-[var(--border)] rounded-lg h-10 px-3 w-full max-w-xs">
                <Search className="w-4 h-4 text-[var(--text-muted)]" />
                <input value={skillSlug} onChange={e => setSkillSlug(e.target.value)} placeholder="技能 Slug..."
                  className="bg-transparent text-[13px] text-[var(--text-primary)] outline-none w-full placeholder:text-[var(--text-muted)]" />
              </div>
              <div className="flex items-center gap-2 surface-card border border-[var(--border)] rounded-lg h-10 px-3 w-full max-w-xs">
                <Search className="w-4 h-4 text-[var(--text-muted)]" />
                <input value={username} onChange={e => setUsername(e.target.value)} placeholder="用户名..."
                  className="bg-transparent text-[13px] text-[var(--text-primary)] outline-none w-full placeholder:text-[var(--text-muted)]" />
              </div>
              <div className="flex-1" />
              {selectedIds.size > 0 && (
                <button onClick={() => setConfirmBulk(true)}
                  className="flex items-center gap-1.5 text-[13px] font-medium text-red-600 border border-red-200 bg-red-50 px-3.5 py-2 rounded-lg hover:bg-red-100 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" /> 批量删除({selectedIds.size})
                </button>
              )}
            </div>

            {loading ? (
              <div className="text-center py-16 text-[13px] text-[var(--text-muted)]">加载中...</div>
            ) : comments.length > 0 ? (
              <div className="table-shell rounded-xl">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--bg-card-subtle)]">
                      <th className="text-left py-3 px-4 font-medium text-[var(--text-muted)] w-10">
                        <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="rounded" aria-label="全选" />
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-[var(--text-muted)]">技能</th>
                      <th className="text-left py-3 px-4 font-medium text-[var(--text-muted)]">用户</th>
                      <th className="text-left py-3 px-4 font-medium text-[var(--text-muted)]">评论内容</th>
                      <th className="text-center py-3 px-4 font-medium text-[var(--text-muted)]">回复</th>
                      <th className="text-left py-3 px-4 font-medium text-[var(--text-muted)]">时间</th>
                      <th className="text-center py-3 px-4 font-medium text-[var(--text-muted)]">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comments.map((comment) => {
                      const cid = String(comment.id);
                      return (
                      <tr key={comment.id} className="border-b border-[var(--border)] last:border-0 hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <input type="checkbox" checked={selectedIds.has(cid)} onChange={() => toggleSelect(cid)} className="rounded" aria-label={`选择评论 ${comment.id}`} />
                        </td>
                        <td className="py-3 px-4">
                          <Link href={`/skill/${comment.owner_username}/${comment.skill_slug}`} className="font-medium text-[var(--text-primary)] hover:text-[var(--primary)]">{comment.skill_name}</Link>
                        </td>
                        <td className="py-3 px-4 text-[var(--text-secondary)]">{comment.username}</td>
                        <td className="py-3 px-4 text-[var(--text-secondary)] max-w-xs">
                          {comment.content.length > 80 ? (
                            expandedIds.has(comment.id) ? (
                              <span>{comment.content} <button onClick={() => setExpandedIds(prev => { const next = new Set(prev); next.delete(comment.id); return next; })} className="text-[var(--primary)] hover:underline text-[11px] ml-1">收起</button></span>
                            ) : (
                              <span>{comment.content.slice(0, 80)}... <button onClick={() => setExpandedIds(prev => new Set(prev).add(comment.id))} className="text-[var(--primary)] hover:underline text-[11px] ml-1">展开</button></span>
                            )
                          ) : comment.content}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {comment.parent_id ? (
                            <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-gray-100 text-[var(--text-muted)]">回复评论</span>
                          ) : '-'}
                        </td>
                        <td className="py-3 px-4 text-[var(--text-muted)]">{new Date(comment.created_at).toLocaleString('zh-CN')}</td>
                        <td className="py-3 px-4 text-center">
                          <button onClick={() => setDeletingComment(comment)} className="w-7 h-7 rounded-md hover:bg-red-50 inline-flex items-center justify-center text-[var(--text-muted)] hover:text-red-500 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-16 text-[13px] text-[var(--text-muted)]">暂无评论数据</div>
            )}

            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deletingComment !== null}
        title="删除评论"
        message={`确定要删除用户「${deletingComment?.username}」的评论吗？此操作不可恢复。`}
        confirmText="删除"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeletingComment(null)}
      />

      <ConfirmDialog
        open={confirmBulk}
        title="批量删除评论"
        message={`确定要删除选中的 ${selectedIds.size} 条评论吗？此操作不可恢复。`}
        confirmText={bulkDeleting ? '删除中...' : '删除'}
        danger
        onConfirm={confirmBulkDelete}
        onCancel={() => setConfirmBulk(false)}
      />
    </div>
  );
}
