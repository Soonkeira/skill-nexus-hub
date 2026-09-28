'use client';

import { DragEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileArchive,
  FileCheck2,
  ImagePlus,
  Info,
  PackagePlus,
  Plus,
  Upload,
  X,
} from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import AlertDialog from '@/components/AlertDialog';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { SKILL_ICON_PRESETS, getLucideIcon } from '@/lib/icon-presets';
import { formatFileSize, slugify } from '@/utils';
import { formatSkillPublishError, formatSkillUploadError, readSkillPackageMetadata } from '@/utils/skillMetadata.mjs';

const PRESET_TAGS = [
  'claude-code', 'cursor', 'codex', 'windsurf', 'openclaw',
  'code-review', 'testing', 'documentation', 'security', 'refactoring',
  'api', 'database', 'frontend', 'backend', 'devops',
  'python', 'typescript', 'rust', 'go', 'java',
];


const PRESET_COLORS = [
  '#3B82F6', '#7C3AED', '#10B981', '#F59E0B', '#EC4899',
  '#06B6D4', '#EF4444', '#6366F1', '#F97316', '#14B8A6',
];

const FILE_ACCEPT = '.zip,.tar.gz,.tgz,.md';

export default function PublishPage() {
  const auth = useAuth();
  const router = useRouter();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [selectedIconKey, setSelectedIconKey] = useState<string>('bot');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [customIcon, setCustomIcon] = useState<File | null>(null);
  const [customIconPreview, setCustomIconPreview] = useState<string | null>(null);
  const [version, setVersion] = useState('1.0.0');
  const [changelog, setChangelog] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileNotice, setFileNotice] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [existingTags, setExistingTags] = useState<string[]>([]);

  useEffect(() => {
    async function loadTags() {
      try {
        const { data } = await api.get('/skills', { params: { page: 1, page_size: 100 } });
        const tagSet = new Set<string>();
        data.items.forEach((s: any) => (s.tags || []).forEach((t: string) => tagSet.add(t)));
        setExistingTags(Array.from(tagSet).sort());
      } catch (e) {
        console.error('Failed to load tags:', e);
      }
    }
    loadTags();
  }, []);

  useEffect(() => {
    if (!auth.user || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const existingSlug = params.get('slug');
    if (!existingSlug) return;

    let cancelled = false;
    async function loadExistingSkill() {
      try {
        const owner = params.get('owner');
        const { data } = await api.get(`/skills/by-slug/${existingSlug}`, {
          params: owner ? { owner } : {},
        });
        if (cancelled) return;
        if (data.owner_id !== auth.user?.id && !auth.isAdmin) return;

        setName(data.name || existingSlug);
        setSlug(data.slug || existingSlug);
        setDescription(data.description || '');
        setTags(data.tags || []);
        if (data.icon_path) {
          if (getLucideIcon(data.icon_path)) setSelectedIconKey(data.icon_path);
          else setCustomIconPreview(data.icon_path);
        }
        setStep(params.get('mode') === 'version' ? 2 : 1);
        setFileNotice('已载入已有 Skill 信息，请选择新的版本文件上传。');
      } catch (e) {
        console.error('Failed to prefill existing skill:', e);
      }
    }
    void loadExistingSkill();
    return () => { cancelled = true; };
  }, [auth.user, auth.isAdmin]);

  const allTags = useMemo(() => [...new Set([...existingTags, ...PRESET_TAGS])].sort(), [existingTags]);
  const PreviewIcon = customIconPreview ? null : getLucideIcon(selectedIconKey);
  const iconPreview = customIconPreview || selectedIconKey || null;
  const normalizedVersion = version.trim().replace(/^v/i, '');
  const checklist = [
    { label: '基础信息完整', done: Boolean(name.trim() && slug.trim()) },
    { label: '建议添加描述和标签', done: Boolean(description.trim() && tags.length > 0) },
    { label: '版本号格式可发布', done: /^\d+\.\d+\.\d+([-.][0-9A-Za-z.-]+)?$/.test(normalizedVersion) },
    { label: '已选择 Skill 文件', done: Boolean(file) },
  ];

  function addTag(tag: string) {
    const t = tag.trim();
    if (t && !tags.includes(t) && tags.length < 8) setTags([...tags, t]);
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  function handleTagInput(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (tagInput.trim()) {
        addTag(tagInput);
        setTagInput('');
      }
    }
  }

  function handleCustomIcon(f: File) {
    setCustomIcon(f);
    setSelectedIconKey('');
    const reader = new FileReader();
    reader.onload = (e) => setCustomIconPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  }

  function selectIcon(key: string) {
    setSelectedIconKey(key);
    setCustomIcon(null);
    setCustomIconPreview(null);
  }

  async function pickSkillFile(nextFile?: File) {
    if (!nextFile) return;
    setFile(nextFile);
    setError('');
    setFileNotice('');

    try {
      const metadata = await readSkillPackageMetadata(nextFile);
      if (!metadata) {
        setFileNotice('已选择文件，提交时将由服务端校验包内的 skill.yaml 或 SKILL.md。');
        return;
      }
      if (!metadata.name) {
        setError('上传文件中的 skill.yaml 或 SKILL.md 缺少 name 字段。');
        return;
      }

      const nextSlug = metadata.name.trim();
      if (!/^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/.test(nextSlug)) {
        setError(`上传文件中的 name "${nextSlug}" 不是合法 Slug，请使用小写字母、数字和短横线。`);
        return;
      }

      setSlug(nextSlug);
      if (!name.trim()) setName(nextSlug);
      if (metadata.description && !description.trim()) setDescription(metadata.description);
      if (metadata.version) setVersion(metadata.version);
      setFileNotice(`已读取上传包元数据：name 为 "${nextSlug}"，已将 Slug 对齐。`);
    } catch {
      setError('读取上传文件失败，请确认 zip/md 文件未损坏，且包内定义文件是 UTF-8 编码。');
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    void pickSkillFile(e.dataTransfer.files?.[0]);
  }

  function validateBeforeSubmit() {
    if (!name.trim()) return '请输入技能名称';
    if (!slug.trim()) return '请输入 Slug';
    if (!/^\d+\.\d+\.\d+([-.][0-9A-Za-z.-]+)?$/.test(normalizedVersion)) return '版本号请使用 1.0.0 这样的格式，不需要 v 前缀';
    if (!file) return '请上传技能文件';
    return '';
  }

  async function validateSelectedFileMetadata() {
    if (!file) return '';

    const metadata = await readSkillPackageMetadata(file);
    if (!metadata) return '';
    if (!metadata.name) {
      return '上传文件中的 skill.yaml 或 SKILL.md 缺少 name 字段。';
    }
    if (metadata.name.trim() !== slug.trim()) {
      return formatSkillUploadError(`skill name '${metadata.name.trim()}' does not match slug '${slug.trim()}'`);
    }
    if (metadata.version && metadata.version.trim() !== normalizedVersion) {
      return formatSkillUploadError(`skill version '${metadata.version.trim()}' does not match expected '${normalizedVersion}'`);
    }
    return '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const validationError = validateBeforeSubmit();
    if (validationError) {
      setError(validationError);
      return;
    }

    const metadataError = await validateSelectedFileMetadata();
    if (metadataError) {
      setError(metadataError);
      return;
    }

    setLoading(true);
    let createdSkill = false;
    try {
      const skillPayload = {
        name: name.trim(),
        description: description.trim() || null,
        tags: tags.length > 0 ? tags : null,
        visibility: 'public',
        icon_path: customIconPreview || selectedIconKey || null,
      };
      try {
        await api.post('/skills', {
          ...skillPayload,
          slug: slug.trim(),
        });
        createdSkill = true;
      } catch (err: any) {
        if (err.response?.status === 400 && err.response?.data?.detail === 'Slug already taken') {
          const { data: existingSkill } = await api.get(`/skills/by-slug/${slug.trim()}`, {
            params: { owner: auth.user?.username },
          });
          if (existingSkill.owner_id !== auth.user?.id) {
            setError('该 Slug 已被其他人使用，请更换');
            return;
          }
          await api.put(`/skills/by-slug/${slug.trim()}`, skillPayload, {
            params: existingSkill.owner_name ? { owner: existingSkill.owner_name } : {},
          });
        } else {
          throw err;
        }
      }

      const formData = new FormData();
      formData.append('version', normalizedVersion);
      formData.append('file', file as File);
      if (changelog.trim()) formData.append('changelog', changelog.trim());

      // Pass owner to disambiguate when another user has a Skill with the same slug.
      await api.post(`/skills/by-slug/${slug.trim()}/versions`, formData, {
        params: { owner: auth.user?.username },
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      router.push('/my-skills');
    } catch (err: any) {
      let message = formatSkillPublishError(err);
      if (createdSkill) {
        try {
          await api.delete(`/skills/by-slug/${slug.trim()}`, { params: { owner: auth.user?.username } });
          message += ' 已自动清理本次创建的空技能，请修正后重新发布。';
        } catch {
          message += ' 本次创建的空技能清理失败，请在“我的技能”中删除后重试。';
        }
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function goToStep2() {
    if (!name.trim()) {
      setError('请输入技能名称');
      return;
    }
    if (!slug.trim()) {
      setError('请输入 Slug');
      return;
    }
    setError('');
    setStep(2);
  }

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-y-auto">
          <div className="flex w-full flex-col gap-5 px-6 py-6">
            <div className="flex items-center gap-1.5 text-[13px] text-[var(--text-muted)]">
              <Link href="/" className="hover:text-[var(--primary)]">首页</Link>
              <ChevronRight className="h-3.5 w-3.5" />
              <span className="text-[var(--text-primary)]">发布技能</span>
            </div>

            <div className="page-hero rounded-xl p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="mb-3 inline-flex items-center gap-2 rounded-md bg-blue-50 px-2.5 py-1 text-[12px] font-medium text-[var(--primary)]">
                    <PackagePlus className="h-3.5 w-3.5" />
                    新 Skill 发布
                  </div>
                  <h1 className="text-[24px] font-bold tracking-tight text-[var(--text-primary)]">发布新技能</h1>
                  <p className="mt-2 max-w-[680px] text-[13px] leading-relaxed text-[var(--text-secondary)]">
                    基础信息会用于市场展示和 CLI 搜索，上传文件后将进入版本审核流程。
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[12px] text-[var(--text-muted)] sm:grid-cols-4">
                  {checklist.map((item) => (
                    <div key={item.label} className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-white/80 px-2.5 py-2">
                      <Check className={`h-3.5 w-3.5 ${item.done ? 'text-emerald-600' : 'text-[var(--text-muted)]'}`} />
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <AlertDialog
              open={!!error}
              title="操作失败"
              message={error}
              icon="warning"
              onClose={() => setError('')}
            />

            <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_360px]">
              <div className="surface-card rounded-xl p-5">
                <div className="mb-5 flex items-center gap-3 border-b border-[var(--border)] pb-4">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${step === 1 ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--tag-bg)] hover:text-[var(--text-primary)]'}`}
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-white/15 text-[11px]">1</span>
                    基本信息
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${step === 2 ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--tag-bg)] hover:text-[var(--text-primary)]'}`}
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-white/15 text-[11px]">2</span>
                    上传文件
                  </button>
                </div>

                {step === 1 && (
                  <div className="flex flex-col gap-5">
                    <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
                      <p className="text-[13px] font-medium text-blue-800">先把 Skill 的名称、Slug、图标和标签整理清楚。</p>
                      <p className="mt-1 text-[12px] text-blue-700/75">Slug 会成为安装和详情页路径，建议使用短横线小写英文。</p>
                    </div>

                    <div className="grid gap-5 lg:grid-cols-[150px_1fr]">
                      <div className="flex flex-col gap-3">
                        <label className="text-[13px] font-medium text-[var(--text-primary)]">图标</label>
                        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl shadow-sm" style={{ backgroundColor: selectedColor }}>
                          {customIconPreview ? (
                            <img src={customIconPreview} alt="icon" className="h-full w-full object-cover" />
                          ) : PreviewIcon ? (
                            <PreviewIcon size={40} className="text-white" strokeWidth={2} />
                          ) : (
                            <span className="text-3xl font-bold text-white">{name ? name.charAt(0).toUpperCase() : '?'}</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {PRESET_COLORS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              aria-label={`选择颜色 ${c}`}
                              onClick={() => setSelectedColor(c)}
                              className={`h-5 w-5 rounded-full border-2 transition-transform ${selectedColor === c ? 'scale-110 border-gray-800' : 'border-transparent hover:scale-110'}`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="grid gap-4">
                        <div>
                          <label className="mb-1.5 block text-[13px] font-medium text-[var(--text-primary)]">技能名称 <span className="text-red-400">*</span></label>
                          <input
                            value={name}
                            onChange={(e) => { setName(e.target.value); setSlug(slugify(e.target.value)); }}
                            type="text"
                            placeholder="例如：PR Review Assistant"
                            className="w-full rounded-lg border border-[var(--border)] bg-white px-3.5 py-2.5 text-[13px] text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:ring-2 focus:ring-blue-50"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-[13px] font-medium text-[var(--text-primary)]">Slug <span className="text-red-400">*</span></label>
                          <input
                            value={slug}
                            onChange={(e) => setSlug(e.target.value)}
                            type="text"
                            placeholder="例如：pr-review-assistant"
                            className="w-full rounded-lg border border-[var(--border)] bg-white px-3.5 py-2.5 text-[13px] text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:ring-2 focus:ring-blue-50"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-[13px] font-medium text-[var(--text-primary)]">选择图标</label>
                      <div className="flex flex-wrap items-center gap-2">
                        {SKILL_ICON_PRESETS.map((preset) => {
                          const PresetIcon = preset.icon;
                          return (
                            <button
                              key={preset.key}
                              type="button"
                              onClick={() => selectIcon(preset.key)}
                              className={`flex h-9 w-9 items-center justify-center rounded-lg border-2 transition-all hover:scale-105 ${selectedIconKey === preset.key ? 'border-[var(--primary)] bg-blue-50' : 'border-[var(--border)] bg-[var(--bg-page)] hover:border-gray-300'}`}
                            >
                              <PresetIcon size={18} className={selectedIconKey === preset.key ? 'text-[var(--primary)]' : 'text-[var(--text-secondary)]'} />
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => document.getElementById('icon-upload')?.click()}
                          className={`flex h-9 w-9 items-center justify-center rounded-lg border-2 border-dashed bg-white transition-all hover:scale-105 ${customIconPreview ? 'border-[var(--primary)] bg-blue-50' : 'border-[var(--border)] hover:border-gray-300'}`}
                          title="上传自定义图标"
                        >
                          {customIconPreview ? <Check className="h-4 w-4 text-[var(--primary)]" /> : <ImagePlus className="h-4 w-4 text-[var(--text-muted)]" />}
                        </button>
                        <input id="icon-upload" type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && handleCustomIcon(e.target.files[0])} className="hidden" />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-[13px] font-medium text-[var(--text-primary)]">描述</label>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={4}
                        placeholder="简要描述这个技能能解决什么问题、适合什么场景..."
                        className="w-full resize-none rounded-lg border border-[var(--border)] bg-white px-3.5 py-2.5 text-[13px] text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:ring-2 focus:ring-blue-50"
                      />
                    </div>

                    <div className="relative">
                      <label className="mb-1.5 block text-[13px] font-medium text-[var(--text-primary)]">标签</label>
                      {tags.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {tags.map((tag) => (
                            <span key={tag} className="flex items-center gap-1 rounded bg-[var(--primary)] px-2 py-0.5 text-[11px] text-white">
                              {tag}
                              <button type="button" onClick={() => removeTag(tag)} className="hover:text-white/70"><X className="h-3 w-3" /></button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <input
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          onKeyDown={handleTagInput}
                          type="text"
                          placeholder="输入自定义标签后按回车"
                          className="flex-1 rounded-lg border border-[var(--border)] bg-white px-3.5 py-2.5 text-[13px] text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:ring-2 focus:ring-blue-50"
                        />
                        <button
                          type="button"
                          onClick={() => setShowTagPicker(!showTagPicker)}
                          className="flex h-10 items-center gap-1 rounded-lg border border-[var(--border)] px-3 text-[12px] text-[var(--text-muted)] transition-colors hover:bg-gray-50"
                          title="选择已有标签"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          选择
                        </button>
                      </div>

                      {showTagPicker && (
                        <div className="relative z-10 mt-2 max-h-48 overflow-y-auto rounded-lg border border-[var(--border)] bg-white p-3 shadow-lg">
                          <p className="mb-2 text-[11px] text-[var(--text-muted)]">点击选择标签，最多 8 个（已选 {tags.length}/8）</p>
                          <div className="flex flex-wrap gap-1.5">
                            {allTags.filter((t) => !tags.includes(t)).map((tag) => (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => addTag(tag)}
                                className="rounded bg-[var(--tag-bg)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-blue-50 hover:text-[var(--primary)]"
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={goToStep2}
                      className="self-end inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-5 py-2.5 text-[13px] font-medium text-white transition-all hover:bg-[var(--primary-dark)] hover:shadow-md"
                    >
                      下一步 <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {step === 2 && (
                  <div className="flex flex-col gap-5">
                    <div className="grid gap-4 md:grid-cols-[180px_1fr]">
                      <div>
                        <label className="mb-1.5 block text-[13px] font-medium text-[var(--text-primary)]">版本号 <span className="text-red-400">*</span></label>
                        <input
                          value={version}
                          onChange={(e) => setVersion(e.target.value)}
                          type="text"
                          placeholder="例如：1.0.0"
                          className="w-full rounded-lg border border-[var(--border)] bg-white px-3.5 py-2.5 text-[13px] text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:ring-2 focus:ring-blue-50"
                        />
                        <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">不需要 v 前缀，输入 v1.0.0 时会自动按 1.0.0 提交。</p>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[13px] font-medium text-[var(--text-primary)]">更新日志</label>
                        <textarea
                          value={changelog}
                          onChange={(e) => setChangelog(e.target.value)}
                          rows={3}
                          placeholder="本次版本新增、修复或调整的内容..."
                          className="w-full resize-none rounded-lg border border-[var(--border)] bg-white px-3.5 py-2.5 text-[13px] text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:ring-2 focus:ring-blue-50"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-[13px] font-medium text-[var(--text-primary)]">技能文件 <span className="text-red-400">*</span></label>
                      <div
                        className={`upload-dropzone flex cursor-pointer flex-col items-center gap-4 rounded-xl p-8 text-center transition-colors ${dragActive ? 'border-[var(--primary)] bg-blue-50' : ''}`}
                        onClick={() => document.getElementById('file-input')?.click()}
                        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                        onDragLeave={() => setDragActive(false)}
                        onDrop={onDrop}
                      >
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-[var(--primary)] shadow-sm">
                          <Upload className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="text-[14px] font-semibold text-[var(--text-primary)]">点击选择或拖拽文件到这里</p>
                          <p className="mt-1 text-[12px] text-[var(--text-muted)]">支持 .zip / .tar.gz / .tgz / .md，包内需包含 skill.yaml 或 SKILL.md</p>
                        </div>
                        {file && (
                          <div className="flex max-w-full items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                            <FileCheck2 className="h-4 w-4 shrink-0 text-[var(--primary)]" />
                            <span className="truncate text-[12px] font-medium text-[var(--primary)]">{file.name}</span>
                            <span className="text-[11px] text-[var(--text-muted)]">{formatFileSize(file.size)}</span>
                            <button type="button" onClick={(e) => { e.stopPropagation(); setFile(null); }} className="text-[var(--text-muted)] hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
                          </div>
                        )}
                      </div>
                      {fileNotice && (
                        <p className="mt-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-[12px] text-blue-700">{fileNotice}</p>
                      )}
                      <input id="file-input" type="file" accept={FILE_ACCEPT} onChange={(e) => void pickSkillFile(e.target.files?.[0])} className="hidden" />
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="inline-flex items-center gap-1 text-[13px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" /> 返回上一步
                      </button>
                      <button
                        type="submit"
                        disabled={loading}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-5 py-2.5 text-[13px] font-medium text-white transition-all hover:bg-[var(--primary-dark)] hover:shadow-md disabled:opacity-50"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        {loading ? '发布中...' : '发布技能'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <aside className="flex flex-col gap-4">
                <div className="surface-card rounded-xl p-5">
                  <p className="mb-4 text-[13px] font-semibold text-[var(--text-primary)]">市场预览</p>
                  <div className="skill-card-hover rounded-[10px] border border-[var(--border)] bg-white p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg text-2xl" style={{ backgroundColor: selectedColor }}>
                        {customIconPreview ? <img src={customIconPreview} alt="icon preview" className="h-full w-full object-cover" /> : PreviewIcon ? <PreviewIcon size={24} className="text-white" strokeWidth={2} /> : <span className="font-bold text-white">{name ? name.charAt(0).toUpperCase() : '?'}</span>}
                      </div>
                      <span className="text-[11px] text-[var(--text-muted)]">{normalizedVersion || '1.0.0'}</span>
                    </div>
                    <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{name || 'Skill 名称'}</h3>
                    <p className="mt-1 text-[12px] text-[var(--text-muted)]">{slug || 'skill-slug'}</p>
                    <p className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                      {description || '这里会显示技能描述，帮助团队成员判断是否适合安装和复用。'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(tags.length ? tags : ['codex', 'automation']).slice(0, 3).map((tag) => (
                        <span key={tag} className="rounded bg-[var(--tag-bg)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="surface-card rounded-xl p-5">
                  <p className="mb-4 text-[13px] font-semibold text-[var(--text-primary)]">发布校验</p>
                  <div className="flex flex-col gap-3">
                    {checklist.map((item) => (
                      <div key={item.label} className="flex items-center gap-2 text-[13px]">
                        <span className={`flex h-5 w-5 items-center justify-center rounded-full ${item.done ? 'bg-emerald-50 text-emerald-600' : 'bg-[var(--tag-bg)] text-[var(--text-muted)]'}`}>
                          <Check className="h-3.5 w-3.5" />
                        </span>
                        <span className={item.done ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="surface-card rounded-xl p-5">
                  <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-[var(--text-primary)]">
                    <Info className="h-4 w-4 text-[var(--primary)]" />
                    文件要求
                  </div>
                  <div className="space-y-2 text-[12px] leading-relaxed text-[var(--text-muted)]">
                    <p className="flex gap-2"><FileArchive className="mt-0.5 h-3.5 w-3.5 shrink-0" />压缩包会被后端安全解包，防止 Zip Slip 路径穿越。</p>
                    <p>单文件 Markdown 可用于快速提交，完整技能包推荐使用 .zip 或 .tar.gz。</p>
                    <p>发布成功后版本默认进入待审批，管理员通过后才会进入市场。</p>
                  </div>
                </div>
              </aside>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
