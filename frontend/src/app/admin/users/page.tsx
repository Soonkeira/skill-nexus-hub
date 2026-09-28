'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';
import type { User } from '@/lib/types';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useToast } from '@/lib/toast';
import { formatDate } from '@/utils';
import { ShieldCheck, Trash2, ImageOff, UserX, Search } from 'lucide-react';
import Pagination from '@/components/Pagination';

const ROLES = [
  { value: 'user', label: '用户' },
  { value: 'admin', label: '管理员' },
];

export default function AdminUsersPage() {
  const auth = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<{ userId: string; role: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pendingResetAvatar, setPendingResetAvatar] = useState<User | null>(null);
  const [pendingResetNickname, setPendingResetNickname] = useState<User | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const pageSize = 20;
  const totalPages = Math.ceil(total / pageSize);
  const toast = useToast();

  function loadUsers() {
    setLoading(true);
    api.get('/admin/users', { params: { page, page_size: pageSize } })
      .then(({ data }) => {
        const items = (data as any).items || data || [];
        if (q) {
          const lower = q.toLowerCase();
          const filtered = items.filter((u: any) =>
            (u.username || '').toLowerCase().includes(lower) ||
            (u.nickname || '').toLowerCase().includes(lower)
          );
          setUsers(filtered);
          setTotal((data as any).total ? (data as any).total - ((data as any).items?.length ?? 0) + filtered.length : filtered.length);
        } else {
          setUsers(items);
          setTotal((data as any).total ?? (data as any).length ?? 0);
        }
      })
      .catch((e) => { console.error('Failed to load users:', e); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadUsers(); }, [page]);
  useEffect(() => { if (page === 1) loadUsers(); else setPage(1); }, [q]);

  async function changeRole(userId: string, newRole: string) {
    setUpdating(userId);
    try {
      await api.put(`/admin/users/${userId}/role`, { role: newRole });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole as User['role'] } : u));
    } catch (e) {
      console.error('Failed to update role:', e);
    } finally {
      setUpdating(null);
    }
  }

  async function deleteUser(userId: string) {
    setDeleting(userId);
    try {
      await api.delete(`/admin/users/${userId}`);
      setUsers(prev => prev.filter(u => u.id !== userId));
      setTotal(prev => Math.max(0, prev - 1));
      toast.addToast('用户已删除', 'success');
    } catch (e: any) {
      toast.addToast(e.response?.data?.detail || '删除失败', 'error');
    } finally {
      setDeleting(null);
    }
  }

  async function resetAvatar(userId: string) {
    setResetting(userId);
    try {
      await api.put(`/admin/users/${userId}/reset-avatar`);
      toast.addToast('头像已重置', 'success');
      loadUsers();
    } catch (e: any) {
      toast.addToast(e.response?.data?.detail || '重置头像失败', 'error');
    } finally {
      setResetting(null);
    }
  }

  async function resetNickname(userId: string) {
    setResetting(userId);
    try {
      await api.put(`/admin/users/${userId}/reset-nickname`);
      toast.addToast('昵称已重置', 'success');
      loadUsers();
    } catch (e: any) {
      toast.addToast(e.response?.data?.detail || '重置昵称失败', 'error');
    } finally {
      setResetting(null);
    }
  }

  function roleBadgeClass(role: string) {
    return role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600';
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
                <ShieldCheck className="w-3.5 h-3.5" />
                管理员控制台
              </div>
              <h1 className="text-[22px] font-semibold text-[var(--text-primary)] mt-3">用户管理</h1>
              <p className="text-[13px] text-[var(--text-muted)] mt-1">维护账号资料与管理员权限，共 {total} 位用户。</p>
            </div>
            <div className="flex items-center gap-2 surface-card border border-[var(--border)] rounded-lg h-10 px-3 w-full max-w-md">
              <Search className="w-4 h-4 text-[var(--text-muted)]" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索用户名..."
                className="bg-transparent text-[13px] text-[var(--text-primary)] outline-none w-full placeholder:text-[var(--text-muted)]" />
            </div>
            {loading ? <p className="text-[13px] text-[var(--text-muted)]">加载中...</p> : (
              <div className="table-shell rounded-xl">
                <table className="w-full text-[13px]">
                  <thead><tr className="border-b border-[var(--border)]">
                    <th className="text-left px-5 py-3 font-medium text-[11px] text-[var(--text-muted)]">用户名</th>
                    <th className="text-left px-5 py-3 font-medium text-[11px] text-[var(--text-muted)]">昵称</th>
                    <th className="text-left px-5 py-3 font-medium text-[11px] text-[var(--text-muted)]">工号</th>
                    <th className="text-left px-5 py-3 font-medium text-[11px] text-[var(--text-muted)]">部门</th>
                    <th className="text-left px-5 py-3 font-medium text-[11px] text-[var(--text-muted)]">角色</th>
                    <th className="text-left px-5 py-3 font-medium text-[11px] text-[var(--text-muted)]">注册时间</th>
                    <th className="text-left px-5 py-3 font-medium text-[11px] text-[var(--text-muted)]">操作</th>
                  </tr></thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id} className="border-b border-[var(--border)] last:border-0 hover:bg-gray-50">
                        <td className="px-5 py-3 font-medium text-[var(--text-primary)]">{u.username}</td>
                        <td className="px-5 py-3 text-[var(--text-secondary)]">{u.nickname || '-'}</td>
                        <td className="px-5 py-3 text-[var(--text-secondary)]">{(u as any).employee_id || '-'}</td>
                        <td className="px-5 py-3 text-[var(--text-secondary)]">{(u as any).department || '-'}</td>
                        <td className="px-5 py-3">
                          {u.id === auth.user?.id ? (
                            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${roleBadgeClass(u.role)}`}>
                              {ROLES.find(r => r.value === u.role)?.label || u.role}
                            </span>
                          ) : (
                            <select
                              value={u.role}
                              disabled={updating === u.id}
                              onChange={e => setPendingRole({ userId: u.id, role: e.target.value })}
                              className={`text-[11px] font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer disabled:opacity-50 ${roleBadgeClass(u.role)}`}
                            >
                              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                          )}
                        </td>
                        <td className="px-5 py-3 text-[11px] text-[var(--text-muted)]">{formatDate(u.created_at)}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setPendingResetAvatar(u)}
                              disabled={resetting === u.id}
                              title="重置头像"
                              className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-amber-500 hover:bg-amber-50 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-[var(--text-muted)] disabled:hover:bg-transparent transition-colors"
                            >
                              <ImageOff className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setPendingResetNickname(u)}
                              disabled={resetting === u.id}
                              title="重置昵称"
                              className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-violet-500 hover:bg-violet-50 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-[var(--text-muted)] disabled:hover:bg-transparent transition-colors"
                            >
                              <UserX className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setPendingDelete(u)}
                              disabled={u.role === 'admin' || u.id === auth.user?.id || deleting === u.id}
                              title={u.role === 'admin' ? '无法删除管理员' : u.id === auth.user?.id ? '无法删除自己' : '删除用户'}
                              className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-[var(--text-muted)] disabled:hover:bg-transparent transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={pendingRole !== null}
        title="确认修改角色"
        message={`确定要将该用户的角色更改为「${ROLES.find(r => r.value === pendingRole?.role)?.label || pendingRole?.role}」吗？`}
        confirmText="确认修改"
        cancelText="取消"
        danger
        onConfirm={() => { if (pendingRole) changeRole(pendingRole.userId, pendingRole.role); setPendingRole(null); }}
        onCancel={() => setPendingRole(null)}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        title="确认删除用户"
        message={`确定要删除用户「${pendingDelete?.username}」吗？此操作不可撤销。`}
        confirmText="确认删除"
        cancelText="取消"
        danger
        onConfirm={() => { if (pendingDelete) deleteUser(pendingDelete.id); setPendingDelete(null); }}
        onCancel={() => setPendingDelete(null)}
      />
      <ConfirmDialog
        open={pendingResetAvatar !== null}
        title="确认重置头像"
        message={`确定要重置用户「${pendingResetAvatar?.username}」的头像吗？`}
        confirmText="确认重置"
        cancelText="取消"
        danger
        onConfirm={() => { if (pendingResetAvatar) resetAvatar(pendingResetAvatar.id); setPendingResetAvatar(null); }}
        onCancel={() => setPendingResetAvatar(null)}
      />
      <ConfirmDialog
        open={pendingResetNickname !== null}
        title="确认重置昵称"
        message={`确定要重置用户「${pendingResetNickname?.username}」的昵称吗？`}
        confirmText="确认重置"
        cancelText="取消"
        danger
        onConfirm={() => { if (pendingResetNickname) resetNickname(pendingResetNickname.id); setPendingResetNickname(null); }}
        onCancel={() => setPendingResetNickname(null)}
      />
    </div>
  );
}
