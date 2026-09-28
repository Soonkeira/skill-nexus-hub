'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import type { Skill } from '@/lib/types';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import Link from 'next/link';
import { Download, Search, Trash2, Eye, EyeOff, Shield, Pencil } from 'lucide-react';
import SkillIcon from '@/components/SkillIcon';
import ConfirmDialog from '@/components/ConfirmDialog';
import AlertDialog from '@/components/AlertDialog';
import Pagination from '@/components/Pagination';
import { SKILL_ICON_PRESETS, getLucideIcon } from '@/lib/icon-presets';

export default function AdminSkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const pageSize = 20;
  const totalPages = Math.ceil(total / pageSize);

  const [deletingSkill, setDeletingSkill] = useState<Skill | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Edit dialog state
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', tags: '', visibility: 'public', icon: '' });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  function loadSkills() {
    setLoading(true);
    api.get('/admin/skills', { params: { page, page_size: pageSize, q: q || undefined } })
      .then(({ data }) => { setSkills(data.items); setTotal(data.total); })
      .catch((e) => {
        setSkills([]);
        setTotal(0);
        setErrorMsg(e.response?.data?.detail || '加载技能数据失败，请稍后重试。');
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadSkills(); }, [page]);
  useEffect(() => { if (page === 1) loadSkills(); else setPage(1); }, [q]);

  function openEdit(skill: Skill) {
    setEditingSkill(skill);
    setEditForm({
      name: skill.name,
      description: skill.description || '',
      tags: (skill.tags || []).join(', '),
      visibility: skill.visibility,
      icon: skill.icon_path || '',
    });
    setEditError('');
  }

  async function saveEdit() {
    if (!editingSkill) return;
    if (!editForm.name.trim()) { setEditError('请输入技能名称'); return; }
    setSaving(true);
    setEditError('');
    try {
      const tags = editForm.tags.split(',').map(t => t.trim()).filter(Boolean);
      await api.put(`/skills/by-slug/${editingSkill.slug}`, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || null,
        tags: tags.length > 0 ? tags : null,
        visibility: editForm.visibility,
        icon_path: editForm.icon || null,
      }, { params: editingSkill.owner_name ? { owner: editingSkill.owner_name } : {} });
      setEditingSkill(null);
      loadSkills();
    } catch (e: any) {
      setEditError(e.response?.data?.detail || '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function toggleVisibility(skill: Skill) {
    const newVis = skill.visibility === 'public' ? 'private' : 'public';
    try {
      await api.put(`/skills/by-slug/${skill.slug}`, { visibility: newVis }, { params: skill.owner_name ? { owner: skill.owner_name } : {} });
      loadSkills();
    } catch (e: any) {
      setErrorMsg(e.response?.data?.detail || '操作失败');
    }
  }

  async function confirmDelete() {
    if (!deletingSkill) return;
    setDeleting(true);
    try {
      await api.delete(`/skills/by-slug/${deletingSkill.slug}`, { params: deletingSkill.owner_name ? { owner: deletingSkill.owner_name } : {} });
      setDeletingSkill(null);
      loadSkills();
    } catch (e: any) {
      setDeletingSkill(null);
      setErrorMsg(e.response?.data?.detail || '删除失败');
    } finally {
      setDeleting(false);
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
                <h1 className="text-[22px] font-bold text-[var(--text-primary)] mt-3">技能管理</h1>
                <p className="text-[13px] text-[var(--text-muted)] mt-1">管理所有用户的技能，共 {total} 个。</p>
              </div>
            </div>

            {/* Search */}
            <div className="flex items-center gap-2 surface-card border border-[var(--border)] rounded-lg h-10 px-3 w-full max-w-md">
              <Search className="w-4 h-4 text-[var(--text-muted)]" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索技能名称或描述..."
                className="bg-transparent text-[13px] text-[var(--text-primary)] outline-none w-full placeholder:text-[var(--text-muted)]" />
            </div>

            {loading ? (
              <div className="text-center py-16 text-[13px] text-[var(--text-muted)]">加载中...</div>
            ) : skills.length > 0 ? (
              <div className="table-shell rounded-xl">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--bg-card-subtle)]">
                      <th className="text-left py-3 px-4 font-medium text-[var(--text-muted)]">技能</th>
                      <th className="text-left py-3 px-4 font-medium text-[var(--text-muted)]">所有者</th>
                      <th className="text-center py-3 px-4 font-medium text-[var(--text-muted)]">可见性</th>
                      <th className="text-center py-3 px-4 font-medium text-[var(--text-muted)]">下载量</th>
                      <th className="text-left py-3 px-4 font-medium text-[var(--text-muted)]">创建时间</th>
                      <th className="text-center py-3 px-4 font-medium text-[var(--text-muted)]">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skills.map((skill, i) => (
                      <tr key={skill.id} className="border-b border-[var(--border)] last:border-0 hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <SkillIcon skill={skill} index={i} />
                            <div>
                              <Link href={`/skill/${skill.owner_name || '_'}/${skill.slug}`} className="font-medium text-[var(--text-primary)] hover:text-[var(--primary)]">{skill.name}</Link>
                              <p className="text-[11px] text-[var(--text-muted)]">{skill.slug}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-[var(--text-secondary)]">{skill.owner_nickname || skill.owner_name || '-'}</td>
                        <td className="py-3 px-4 text-center">
                          <button onClick={() => toggleVisibility(skill)}
                            className={`text-[11px] font-medium px-2 py-0.5 rounded inline-flex items-center gap-0.5 ${skill.visibility === 'public' ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-gray-100 text-[var(--text-muted)] hover:bg-gray-200'}`}>
                            {skill.visibility === 'public' ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                            {skill.visibility === 'public' ? '公开' : '私有'}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-center text-[var(--text-muted)]">
                          <span className="inline-flex items-center gap-1"><Download className="w-3 h-3" />{skill.download_count || 0}</span>
                        </td>
                        <td className="py-3 px-4 text-[var(--text-muted)]">{new Date(skill.created_at).toLocaleDateString('zh-CN')}</td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => openEdit(skill)} className="w-7 h-7 rounded-md hover:bg-blue-50 inline-flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setDeletingSkill(skill)} className="w-7 h-7 rounded-md hover:bg-red-50 inline-flex items-center justify-center text-[var(--text-muted)] hover:text-red-500 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-16 text-[13px] text-[var(--text-muted)]">暂无技能数据</div>
            )}

            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </div>
      </div>

      {/* Edit Dialog */}
      {editingSkill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setEditingSkill(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative surface-card rounded-xl p-6 w-[460px] shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-[16px] font-semibold text-[var(--text-primary)] mb-1">编辑技能</h3>
            <p className="text-[12px] text-[var(--text-muted)] mb-4">{editingSkill.name}（所有者：{editingSkill.owner_nickname || editingSkill.owner_name}）</p>
            {editError && <p className="text-[13px] text-red-500 mb-3">{editError}</p>}
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[12px] font-medium text-[var(--text-muted)] mb-2 block">图标</label>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-[var(--primary)] flex items-center justify-center text-lg">
                    {editForm.icon && getLucideIcon(editForm.icon)
                      ? (() => { const I = getLucideIcon(editForm.icon)!; return <I size={20} className="text-white" />; })()
                      : <span className="text-white font-bold">{editForm.name.charAt(0) || '?'}</span>}
                  </div>
                  <button type="button" onClick={() => setEditForm({ ...editForm, icon: '' })} className="text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">清除</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SKILL_ICON_PRESETS.map((preset) => {
                    const PIcon = preset.icon;
                    return (
                      <button key={preset.key} type="button" onClick={() => setEditForm({ ...editForm, icon: preset.key })}
                        className={`flex h-8 w-8 items-center justify-center rounded-lg border-2 transition-all hover:scale-105 ${editForm.icon === preset.key ? 'border-[var(--primary)] bg-blue-50' : 'border-[var(--border)] bg-[var(--bg-page)] hover:border-gray-300'}`}>
                        <PIcon size={16} className={editForm.icon === preset.key ? 'text-[var(--primary)]' : 'text-[var(--text-secondary)]'} />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-[12px] font-medium text-[var(--text-muted)] mb-1 block">名称</label>
                <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  className="focus-ring w-full border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--primary)] bg-[var(--bg-page)]" />
              </div>
              <div>
                <label className="text-[12px] font-medium text-[var(--text-muted)] mb-1 block">描述</label>
                <textarea value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} rows={3}
                  className="focus-ring w-full border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none resize-none focus:border-[var(--primary)] bg-[var(--bg-page)]" />
              </div>
              <div>
                <label className="text-[12px] font-medium text-[var(--text-muted)] mb-1 block">标签（逗号分隔）</label>
                <input value={editForm.tags} onChange={e => setEditForm({ ...editForm, tags: e.target.value })} placeholder="python, pdf, parser"
                  className="focus-ring w-full border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--primary)] bg-[var(--bg-page)]" />
              </div>
              <div>
                <label className="text-[12px] font-medium text-[var(--text-muted)] mb-1 block">可见性</label>
                <select value={editForm.visibility} onChange={e => setEditForm({ ...editForm, visibility: e.target.value })}
                  className="focus-ring w-full border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--primary)] bg-[var(--bg-page)]">
                  <option value="public">公开</option>
                  <option value="private">私有</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEditingSkill(null)} className="px-4 py-2 text-[13px] rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--tag-bg)]">取消</button>
              <button onClick={saveEdit} disabled={saving} className="btn-press px-4 py-2 text-[13px] rounded-lg bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary-dark)] disabled:opacity-50">{saving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deletingSkill !== null}
        title="删除技能"
        message={`确定要删除「${deletingSkill?.name}」（所有者：${deletingSkill?.owner_nickname || deletingSkill?.owner_name}）吗？此操作不可恢复。`}
        confirmText="删除"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeletingSkill(null)}
      />

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
