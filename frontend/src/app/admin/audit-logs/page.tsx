'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import { Shield, FileText } from 'lucide-react';
import Pagination from '@/components/Pagination';

interface AuditLog {
  id: number;
  actor_id: number;
  actor_name: string;
  action: string;
  target_type: string;
  target_id: string;
  detail: string;
  ip_address: string;
  created_at: string;
}

const ACTION_OPTIONS = [
  { value: '', label: '全部操作' },
  { value: 'delete_user', label: '删除用户' },
  { value: 'update_role', label: '修改角色' },
  { value: 'reset_avatar', label: '重置头像' },
  { value: 'reset_nickname', label: '重置昵称' },
  { value: 'delete_skill', label: '删除技能' },
  { value: 'update_visibility', label: '修改可见性' },
  { value: 'approve_version', label: '批准版本' },
  { value: 'reject_version', label: '拒绝版本' },
  { value: 'delete_comment', label: '删除评论' },
];

const TARGET_TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'user', label: '用户' },
  { value: 'skill', label: '技能' },
  { value: 'skill_version', label: '技能版本' },
  { value: 'comment', label: '评论' },
];

const actionLabels: Record<string, string> = {
  'login': '登录', 'register': '注册', 'update_profile': '更新资料',
  'change_password': '修改密码', 'create_skill': '创建技能', 'update_skill': '更新技能',
  'delete_skill': '删除技能', 'update_visibility': '更新可见性', 'create_version': '创建版本',
  'approve_version': '审批通过', 'reject_version': '审批驳回', 'delete_user': '删除用户',
  'update_role': '更新角色', 'delete_comment': '删除评论', 'reply_feedback': '回复反馈',
  'update_feedback_status': '更新反馈状态', 'reset_avatar': '重置头像', 'reset_nickname': '重置昵称',
};
const targetLabels: Record<string, string> = {
  'skill': '技能', 'version': '版本', 'user': '用户', 'comment': '评论', 'feedback': '反馈',
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const pageSize = 20;
  const totalPages = Math.ceil(total / pageSize);

  function loadLogs() {
    setLoading(true);
    api.get('/admin/audit-logs', { params: { page, page_size: pageSize, action: action || undefined, target_type: targetType || undefined } })
      .then(({ data }) => {
        let items: AuditLog[] = data.items;
        if (dateFrom) {
          const from = new Date(dateFrom);
          items = items.filter((l: AuditLog) => new Date(l.created_at) >= from);
        }
        if (dateTo) {
          const to = new Date(dateTo);
          to.setHours(23, 59, 59, 999);
          items = items.filter((l: AuditLog) => new Date(l.created_at) <= to);
        }
        setLogs(items);
        setTotal(data.total);
      })
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadLogs(); }, [page, action, targetType]);
  useEffect(() => { if (page === 1) loadLogs(); else setPage(1); }, [dateFrom, dateTo]);

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
                <h1 className="text-[22px] font-bold text-[var(--text-primary)] mt-3">审计日志</h1>
                <p className="text-[13px] text-[var(--text-muted)] mt-1">查看系统操作记录，共 {total} 条。</p>
              </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3">
              <select value={action} onChange={e => { setAction(e.target.value); setPage(1); }}
                className="h-10 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-page)] text-[13px] text-[var(--text-primary)] outline-none">
                {ACTION_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
              <select value={targetType} onChange={e => { setTargetType(e.target.value); setPage(1); }}
                className="h-10 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-page)] text-[13px] text-[var(--text-primary)] outline-none">
                {TARGET_TYPE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="h-10 border border-[var(--border)] rounded-lg px-3 text-[13px] text-[var(--text-primary)] outline-none bg-[var(--bg-page)]" />
              <span className="text-[12px] text-[var(--text-muted)]">至</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="h-10 border border-[var(--border)] rounded-lg px-3 text-[13px] text-[var(--text-primary)] outline-none bg-[var(--bg-page)]" />
            </div>

            {loading ? (
              <div className="text-center py-16 text-[13px] text-[var(--text-muted)]">加载中...</div>
            ) : logs.length > 0 ? (
              <div className="table-shell rounded-xl">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--bg-card-subtle)]">
                      <th className="text-left py-3 px-4 font-medium text-[var(--text-muted)]">操作者</th>
                      <th className="text-left py-3 px-4 font-medium text-[var(--text-muted)]">操作</th>
                      <th className="text-left py-3 px-4 font-medium text-[var(--text-muted)]">目标类型</th>
                      <th className="text-left py-3 px-4 font-medium text-[var(--text-muted)]">目标ID</th>
                      <th className="text-left py-3 px-4 font-medium text-[var(--text-muted)]">详情</th>
                      <th className="text-left py-3 px-4 font-medium text-[var(--text-muted)]">IP地址</th>
                      <th className="text-left py-3 px-4 font-medium text-[var(--text-muted)]">时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => (
                      <tr key={log.id} className="border-b border-[var(--border)] last:border-0 hover:bg-gray-50">
                        <td className="py-3 px-4 text-[var(--text-secondary)]">{log.actor_name || '-'}</td>
                        <td className="py-3 px-4 text-[var(--text-secondary)]">{actionLabels[log.action] || log.action}</td>
                        <td className="py-3 px-4 text-[var(--text-secondary)]">{targetLabels[log.target_type] || log.target_type}</td>
                        <td className="py-3 px-4 text-[var(--text-muted)]">{log.target_id}</td>
                        <td className="py-3 px-4 text-[var(--text-muted)]">{log.detail || '-'}</td>
                        <td className="py-3 px-4 text-[var(--text-muted)]">{log.ip_address || '-'}</td>
                        <td className="py-3 px-4 text-[var(--text-muted)]">{new Date(log.created_at).toLocaleString('zh-CN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-16 text-[13px] text-[var(--text-muted)]">暂无审计日志</div>
            )}

            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </div>
      </div>
    </div>
  );
}
