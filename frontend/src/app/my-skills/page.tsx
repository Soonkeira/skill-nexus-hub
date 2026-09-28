'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Skill } from '@/lib/types';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import Link from 'next/link';
import { Download, Plus, FolderOpen, Pencil, Trash2, Eye, EyeOff, Upload } from 'lucide-react';
import SkillIcon from '@/components/SkillIcon';
import ConfirmDialog from '@/components/ConfirmDialog';
import AlertDialog from '@/components/AlertDialog';
import Pagination from '@/components/Pagination';
import { SKILL_ICON_PRESETS, getLucideIcon } from '@/lib/icon-presets';


export default function MySkillsPage() {
  const auth = useAuth();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;
  const totalPages = Math.ceil(total / pageSize);

  // Edit dialog state
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', tags: '', visibility: 'public', icon: '' });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Delete dialog state
  const [deletingSkill, setDeletingSkill] = useState<Skill | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Error dialog
  const [errorMsg, setErrorMsg] = useState('');

  function loadSkills() {
    setLoading(true);
    api.get('/skills/my', { params: { page, page_size: pageSize } })
      .then(({ data }) => { setSkills(data.items); setTotal(data.total); })
      .catch(() => setSkills([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (auth.user) loadSkills();
  }, [auth.user, page]);

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
      const payload: Record<string, unknown> = {
        name: editForm.name.trim(),
        description: editForm.description.trim() || null,
        tags: tags.length > 0 ? tags : null,
        visibility: editForm.visibility,
        icon_path: editForm.icon || null,
      };
      await api.put(`/skills/by-slug/${editingSkill.slug}`, payload, { params: editingSkill.owner_name ? { owner: editingSkill.owner_name } : {} });
      setEditingSkill(null);
      loadSkills();
    } catch (e: any) {
      setEditError(e.response?.data?.detail || '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deletingSkill) return;
    setDeleting(true);
    try {
      await api.delete(`/skills/by-slug/${deletingSkill.slug}`, {
        params: deletingSkill.owner_name ? { owner: deletingSkill.owner_name } : {},
      });
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
    <div className="app-shell flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-6 flex flex-col gap-5">
            <div className="page-hero rounded-xl p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 text-[12px] text-[var(--primary)] font-medium bg-blue-50 px-2.5 py-1 rounded-md">
                  <FolderOpen className="w-3.5 h-3.5" />
                  个人维护台
                </div>
                <h1 className="text-[22px] font-bold text-[var(--text-primary)] mt-3">我的技能</h1>
                <p className="text-[13px] text-[var(--text-muted)] mt-1">管理你发布的技能，编辑信息或删除。</p>
              </div>
              {auth.isLoggedIn && (
                <Link href="/publish"
                  className="flex items-center gap-1.5 text-[13px] font-medium text-white px-4 py-2 rounded-md bg-[var(--primary)] transition-all hover:shadow-md">
                  <Plus className="w-3.5 h-3.5" />
                  发布技能
                </Link>
              )}
            </div>

            {loading ? (
              <div className="text-center py-16 text-[13px] text-[var(--text-muted)]">加载中...</div>
            ) : skills.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {skills.map((skill, i) => (
                  <div key={skill.id}
                    style={{ '--stagger-index': i % 20 } as React.CSSProperties}
                    className="surface-card rounded-[10px] p-5 flex flex-col gap-3 border border-[var(--border)] hover:border-[var(--primary)]/30 transition-colors stagger-in skill-card-hover">
                    <div className="flex items-start justify-between">
                      <div className="skill-icon-wrap"><SkillIcon skill={skill} index={i} /></div>
                      <div className="flex gap-1">
                        <Link
                          href={`/publish?slug=${encodeURIComponent(skill.slug)}&owner=${encodeURIComponent(skill.owner_name || '')}&mode=version`}
                          title="上传新版本"
                          className="w-7 h-7 rounded-md hover:bg-blue-50 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"
                        >
                          <Upload className="w-3.5 h-3.5" />
                        </Link>
                        <button onClick={() => openEdit(skill)} className="w-7 h-7 rounded-md hover:bg-gray-100 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeletingSkill(skill)} className="w-7 h-7 rounded-md hover:bg-red-50 flex items-center justify-center text-[var(--text-muted)] hover:text-red-500 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <Link href={`/skill/${skill.owner_name || '_'}/${skill.slug}`}>
                      <h3 className="text-[15px] font-semibold text-[var(--text-primary)] hover:text-[var(--primary)]">{skill.name}</h3>
                    </Link>
                    <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed line-clamp-2">{skill.description || '暂无描述'}</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {(skill.tags || []).slice(0, 3).map(tag => (
                        <span key={tag} className="bg-[var(--tag-bg)] text-[var(--text-secondary)] text-[11px] px-2 py-0.5 rounded">{tag}</span>
                      ))}
                    </div>
                    <div className="flex items-center justify-between mt-auto pt-1">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-[var(--text-muted)]">{skill.versions?.[0]?.version || '无版本'}</span>
                        <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]"><Download className="w-3 h-3" />{skill.download_count || 0}</span>
                      </div>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded flex items-center gap-0.5 ${skill.visibility === 'public' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-[var(--text-muted)]'}`}>
                        {skill.visibility === 'public' ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        {skill.visibility === 'public' ? '公开' : '私有'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="surface-card border-dashed rounded-[10px] text-center py-16 flex flex-col items-center gap-3">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--bg-page)] flex items-center justify-center">
                  <Plus className="w-7 h-7 text-[var(--text-muted)]" />
                </div>
                <p className="text-[15px] font-medium text-[var(--text-primary)]">暂无技能</p>
                <p className="text-[13px] mt-1.5 text-[var(--text-muted)]">点击上方按钮发布你的第一个技能</p>
              </div>
            )}
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </div>
      </div>

      {/* Edit Dialog */}
      {editingSkill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setEditingSkill(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative surface-card rounded-xl p-6 w-[500px] max-h-[85vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-[16px] font-semibold text-[var(--text-primary)] mb-4">编辑技能</h3>
            {editError && <p className="text-[13px] text-red-500 mb-3">{editError}</p>}
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-[12px] font-medium text-[var(--text-muted)] mb-2 block">图标</label>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-[var(--primary)] flex items-center justify-center overflow-hidden">
                    {(() => {
                      const IconComponent = getLucideIcon(editForm.icon);
                      if (editForm.icon && (editForm.icon.startsWith('http') || editForm.icon.startsWith('data:'))) {
                        return <img src={editForm.icon} alt="icon" className="w-full h-full object-cover" />;
                      }
                      if (IconComponent) return <IconComponent size={20} className="text-white" strokeWidth={2} />;
                      if (editForm.icon) return <span className="text-lg">{editForm.icon}</span>;
                      return <span className="text-white text-lg font-bold">{editingSkill.name.charAt(0)}</span>;
                    })()}
                  </div>
                  <button type="button" onClick={() => setEditForm({ ...editForm, icon: '' })} className="text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">清除</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SKILL_ICON_PRESETS.map((preset) => {
                    const PresetIcon = preset.icon;
                    return (
                      <button
                        key={preset.key}
                        type="button"
                        onClick={() => setEditForm({ ...editForm, icon: preset.key })}
                        className={`flex h-8 w-8 items-center justify-center rounded-lg border-2 transition-all hover:scale-105 ${editForm.icon === preset.key ? 'border-[var(--primary)] bg-blue-50' : 'border-[var(--border)] bg-[var(--bg-page)] hover:border-gray-300'}`}
                      >
                        <PresetIcon size={16} className={editForm.icon === preset.key ? 'text-[var(--primary)]' : 'text-[var(--text-secondary)]'} />
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2">
                  <input
                    value={editForm.icon}
                    onChange={e => setEditForm({ ...editForm, icon: e.target.value })}
                    placeholder="或输入自定义 URL / emoji"
                    className="focus-ring w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--primary)] bg-[var(--bg-page)]"
                  />
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

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deletingSkill !== null}
        title="删除技能"
        message={`确定要删除「${deletingSkill?.name}」吗？此操作不可恢复，所有版本和数据将被永久删除。`}
        confirmText="删除"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeletingSkill(null)}
      />

      {/* Error Dialog */}
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
