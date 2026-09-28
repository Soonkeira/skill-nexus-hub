'use client';

import { useState } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { MessageSquare, Trash2 } from 'lucide-react';
import UserHoverCard from '@/components/UserHoverCard';
import type { Comment } from '@/lib/types';

interface CommentItemProps {
  comment: Comment;
  slug: string;
  owner?: string;
  depth?: number;
  onRefresh: () => void;
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export default function CommentItem({ comment, slug, owner, depth = 0, onRefresh, onToast }: CommentItemProps) {
  const auth = useAuth();
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submitReply() {
    if (!replyText.trim()) return;
    setSubmitting(true);
    try {
      const params: Record<string, unknown> = {};
      if (owner) params.owner = owner;
      await api.post(`/skills/by-slug/${slug}/comments`, {
        content: replyText,
        parent_id: comment.id,
      }, { params });
      setReplyText('');
      setShowReply(false);
      onRefresh();
      onToast('回复成功', 'success');
    } catch {
      onToast('回复失败', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    try {
      const params: Record<string, unknown> = {};
      if (owner) params.owner = owner;
      await api.delete(`/skills/by-slug/${slug}/comments/${comment.id}`, { params });
      onRefresh();
      onToast('评论已删除', 'success');
    } catch {
      onToast('删除失败', 'error');
    }
  }

  const canDelete = auth.isLoggedIn && (auth.user?.id === comment.user_id || auth.isAdmin);

  return (
    <div className={depth > 0 ? 'pl-4 border-l-2 border-[var(--border)]' : ''}>
      <div className="surface-card rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <UserHoverCard username={comment.username}>
              <span className="text-[13px] font-medium text-[var(--primary)] hover:underline cursor-pointer">{comment.username}</span>
            </UserHoverCard>
          </div>
          <div className="flex items-center gap-1">
            {auth.isLoggedIn && (
              <button onClick={() => { setShowReply(!showReply); setReplyText(''); }}
                className="text-[11px] text-[var(--text-muted)] hover:text-[var(--primary)] px-2 py-1 rounded hover:bg-blue-50 inline-flex items-center gap-0.5">
                <MessageSquare className="w-3 h-3" />
                回复
              </button>
            )}
            {canDelete && (
              <button onClick={handleDelete}
                className="text-[11px] text-[var(--text-muted)] hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 inline-flex items-center gap-0.5">
                <Trash2 className="w-3 h-3" />
                删除
              </button>
            )}
          </div>
        </div>
        <p className="text-[13px] text-[var(--text-primary)] leading-relaxed">{comment.content}</p>
        <span className="text-[11px] text-[var(--text-muted)] mt-2 block">{new Date(comment.created_at).toLocaleString('zh-CN')}</span>

        {showReply && (
          <div className="mt-3 flex gap-2">
            <textarea
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              placeholder={`回复 ${comment.username}...`}
              rows={2}
              className="flex-1 border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none resize-none bg-white focus:border-[var(--primary)]"
            />
            <div className="flex flex-col gap-1">
              <button onClick={submitReply} disabled={!replyText.trim() || submitting}
                className="px-3 py-1.5 bg-[var(--primary)] text-white text-[12px] rounded-md font-medium disabled:opacity-40">
                {submitting ? '...' : '回复'}
              </button>
              <button onClick={() => { setShowReply(false); setReplyText(''); }}
                className="px-3 py-1.5 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                取消
              </button>
            </div>
          </div>
        )}
      </div>

      {comment.replies && comment.replies.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {comment.replies.map(reply => (
            <CommentItem
              key={reply.id}
              comment={reply}
              slug={slug}
              owner={owner}
              depth={depth + 1}
              onRefresh={onRefresh}
              onToast={onToast}
            />
          ))}
        </div>
      )}
    </div>
  );
}
