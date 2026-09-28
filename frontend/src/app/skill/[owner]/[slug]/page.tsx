'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import type { Skill, SkillVersion, Comment, InstallTarget, SkillAnalysis } from '@/lib/types';
import TopBar from '@/components/TopBar';
import Sidebar from '@/components/Sidebar';
import { Download, Copy, Check, X, File, Folder, FolderOpen, FileText, FileCode, Star, TerminalSquare, ShieldCheck, Loader2, AlertTriangle, RotateCcw } from 'lucide-react';
import { formatDate } from '@/utils';
import SkillIcon from '@/components/SkillIcon';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import UserHoverCard from '@/components/UserHoverCard';
import CommentItem from '@/components/CommentItem';
import AlertDialog from '@/components/AlertDialog';
import SkillTrustBadges from '@/components/SkillTrustBadges';
import MarkdownContent from '@/components/MarkdownContent';
import { findDocumentationPath } from '@/utils/markdown.mjs';

interface ZipFile {
  path: string;
  size: number;
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['md', 'txt', 'rst'].includes(ext)) return FileText;
  if (['py', 'js', 'ts', 'tsx', 'jsx', 'sh', 'yaml', 'yml', 'json', 'xml', 'html', 'css'].includes(ext)) return FileCode;
  return File;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function trustValueLabel(type: 'review' | 'security' | 'documentation', value?: string | null) {
  const maps = {
    review: {
      approved: '已审核',
      pending: '待审核',
      rejected: '已驳回',
      no_version: '暂无版本',
    },
    security: {
      passed: '基础检查通过',
      pending: '待审核检查',
      warning: '需要复核',
      not_checked: '未检查',
    },
    documentation: {
      complete: '说明完整',
      needs_work: '建议补充',
      missing: '缺少说明',
    },
  };
  return maps[type][value as keyof typeof maps[typeof type]] || value || '-';
}

function buildTree(files: ZipFile[]) {
  const root: any = { name: '', children: {}, files: [] };
  for (const f of files) {
    const parts = f.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node.children[parts[i]]) {
        node.children[parts[i]] = { name: parts[i], children: {}, files: [] };
      }
      node = node.children[parts[i]];
    }
    node.files.push({ ...f, name: parts[parts.length - 1] });
  }
  return root;
}

function FileTree({ node, selectedPath, onSelect, depth = 0 }: {
  node: any;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);

  const dirs = Object.values(node.children).sort((a: any, b: any) => a.name.localeCompare(b.name));
  const files = (node.files || []).sort((a: any, b: any) => a.name.localeCompare(b.name));

  return (
    <>
      {dirs.map((dir: any) => (
        <div key={dir.name}>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 w-full text-left text-[13px] py-1 px-1 rounded hover:bg-gray-50 text-[var(--text-secondary)]"
            style={{ paddingLeft: depth * 16 + 4 }}
          >
            {expanded ? <FolderOpen className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" /> : <Folder className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
            <span className="truncate">{dir.name}/</span>
          </button>
          {expanded && (
            <FileTree node={dir} selectedPath={selectedPath} onSelect={onSelect} depth={depth + 1} />
          )}
        </div>
      ))}
      {files.map((f: any) => {
        const Icon = getFileIcon(f.name);
        const isActive = f.path === selectedPath;
        return (
          <button
            key={f.path}
            onClick={() => onSelect(f.path)}
            className={`flex items-center gap-1.5 w-full text-left text-[13px] py-1 px-1 rounded ${isActive ? 'bg-blue-50 text-[var(--primary)] font-medium' : 'text-[var(--text-secondary)] hover:bg-gray-50'}`}
            style={{ paddingLeft: depth * 16 + 4 }}
          >
            <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`} />
            <span className="truncate flex-1">{f.name}</span>
            <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">{formatSize(f.size)}</span>
          </button>
        );
      })}
    </>
  );
}

export default function SkillDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const ownerParam = params.owner as string;
  const owner = ownerParam === '_' ? undefined : ownerParam;
  const auth = useAuth();
  const { addToast } = useToast();
  const [skill, setSkill] = useState<Skill | null>(null);
  const [versions, setVersions] = useState<SkillVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [showCliDialog, setShowCliDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<SkillAnalysis | null>(null);
  const [retryingAnalysis, setRetryingAnalysis] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [copiedCommand, setCopiedCommand] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [installScope, setInstallScope] = useState<'global' | 'project' | 'zip'>('global');
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentTotal, setCommentTotal] = useState(0);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [installTargets, setInstallTargets] = useState<InstallTarget[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<InstallTarget | null>(null);
  const [useCustom, setUseCustom] = useState(false);
  const [customPath, setCustomPath] = useState('');

  // File Explorer state
  const [zipFiles, setZipFiles] = useState<ZipFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  const latestVersion = versions.find(v => v.id === skill?.latest_version_id)
    || versions.find(v => v.status === 'approved')
    || versions[0];
  const activeVersion = versions.find(v => v.id === selectedVersionId) || latestVersion;
  const documentationPath = findDocumentationPath(zipFiles);

  // Helper to build API params with optional owner
  function apiParams(extra?: Record<string, unknown>) {
    const p: Record<string, unknown> = { ...extra };
    if (owner) p.owner = owner;
    return p;
  }

  // The full owner/slug display for install command
  const installSlug = skill ? (skill.owner_name ? `${skill.owner_name}/${skill.slug}` : skill.slug) : slug;

  useEffect(() => {
    api.get('/skills/install-targets').then(res => setInstallTargets(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!skill || !auth.isLoggedIn) return;
    api.get(`/bookmarks/check/${skill.slug}`, { params: apiParams() })
      .then(({ data }) => setIsFavorite(data.bookmarked))
      .catch(() => setIsFavorite(false));
  }, [skill]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [skillRes, versionsRes] = await Promise.all([
          api.get(`/skills/by-slug/${slug}`, { params: apiParams() }),
          api.get(`/skills/by-slug/${slug}/versions`, { params: apiParams({ page_size: 100 }) }),
        ]);
        const loadedVersions: SkillVersion[] = versionsRes.data.items || versionsRes.data;
        const defaultVersion = loadedVersions.find(v => v.id === skillRes.data.latest_version_id)
          || loadedVersions.find(v => v.status === 'approved')
          || loadedVersions[0];
        setSkill(skillRes.data);
        setVersions(loadedVersions);
        setSelectedVersionId(current => (
          current && loadedVersions.some(v => v.id === current) ? current : defaultVersion?.id || null
        ));
      } catch (e) { console.error('Failed to load skill:', e); setSkill(null); }
      finally { setLoading(false); }
    }
    if (slug) load();
  }, [slug, ownerParam]);

  async function loadComments() {
    try {
      const res = await api.get(`/skills/by-slug/${slug}/comments`, { params: apiParams() });
      setComments(res.data.items || res.data);
      setCommentTotal(res.data.total || (res.data.items || res.data).length);
    } catch (e) { console.error('Failed to load comments:', e); }
  }

  useEffect(() => {
    if (slug) loadComments();
  }, [slug, ownerParam]);

  async function loadFiles() {
    if (!activeVersion) return;
    if (zipFiles.length > 0) {
      if (!selectedFile) {
        const defaultPath = findDocumentationPath(zipFiles);
        if (defaultPath) selectFile(defaultPath);
      }
      return;
    }
    try {
      const { data } = await api.get(`/skills/by-slug/${slug}/versions/${activeVersion.version}/files`, { params: apiParams() });
      const files: ZipFile[] = data.files || [];
      setZipFiles(files);
      const defaultPath = findDocumentationPath(files);
      if (defaultPath) selectFile(defaultPath);
    } catch (e) { console.error('Failed to load files:', e); }
  }


  async function selectFile(path: string) {
    if (!activeVersion) return;
    setSelectedFile(path);
    setFileLoading(true);
    try {
      const { data } = await api.get(`/skills/by-slug/${slug}/versions/${activeVersion.version}/files/content`, { params: apiParams({ path }) });
      setFileContent(typeof data === 'string' ? data : new TextDecoder().decode(data));
    } catch (e) { console.error('Failed to load file:', e); setFileContent(null); }
    finally { setFileLoading(false); }
  }

  useEffect(() => {
    let cancelled = false;
    setZipFiles([]);
    setSelectedFile(null);
    setFileContent(null);
    setAnalysis(null);

    if (!activeVersion) return () => { cancelled = true; };

    api.get(`/skills/by-slug/${slug}/versions/${activeVersion.version}/files`, { params: apiParams() })
      .then(({ data }) => {
        if (!cancelled) setZipFiles(data.files || []);
      })
      .catch(() => {
        if (!cancelled) setZipFiles([]);
      });

    return () => { cancelled = true; };
  }, [activeVersion?.id, slug, ownerParam]);

  useEffect(() => {
    if (activeTab !== 'files' || selectedFile || zipFiles.length === 0) return;
    const defaultPath = findDocumentationPath(zipFiles);
    if (defaultPath) selectFile(defaultPath);
  }, [activeTab, selectedFile, zipFiles, activeVersion?.id]);

  async function submitComment() {
    if (!commentText.trim()) return;
    setSubmittingComment(true);
    try {
      await api.post(`/skills/by-slug/${slug}/comments`, { content: commentText }, { params: apiParams() });
      setCommentText('');
      await loadComments();
    } catch (e) { console.error('Failed to submit comment:', e); }
    finally { setSubmittingComment(false); }
  }

  const [rejectingVersion, setRejectingVersion] = useState<SkillVersion | null>(null);
  const [rejectReasonText, setRejectReasonText] = useState('');

  async function approveVersion(v: SkillVersion) {
    try {
      await api.post(`/skills/by-slug/${slug}/versions/${v.version}/approve`, null, { params: apiParams() });
      addToast('版本已批准', 'success');
      // Reload versions
      const { data } = await api.get(`/skills/by-slug/${slug}/versions`, { params: apiParams({ page_size: 100 }) });
      setVersions(data.items || data);
    } catch { addToast('批准失败', 'error'); }
  }

  async function rejectVersion(v: SkillVersion) {
    try {
      await api.post(`/skills/by-slug/${slug}/versions/${v.version}/reject`, { reason: rejectReasonText.trim() || undefined }, { params: apiParams() });
      addToast('版本已拒绝', 'success');
      setRejectingVersion(null);
      setRejectReasonText('');
      const { data } = await api.get(`/skills/by-slug/${slug}/versions`, { params: apiParams({ page_size: 100 }) });
      setVersions(data.items || data);
    } catch { addToast('拒绝失败', 'error'); }
  }

  async function downloadVersion(v: SkillVersion) {
    try {
      const { data, headers } = await api.get(
        `/skills/by-slug/${slug}/versions/${v.version}/download`,
        { params: apiParams(), responseType: 'blob' },
      );
      const contentType = typeof headers['content-type'] === 'string' ? headers['content-type'] : 'application/zip';
      const url = URL.createObjectURL(new Blob([data], { type: contentType }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${slug}-${v.version}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      addToast('下载版本失败', 'error');
    }
  }

  function viewVersion(v: SkillVersion, tab: 'overview' | 'files' = 'overview') {
    setSelectedVersionId(v.id);
    setActiveTab(tab);
  }

  function openPackageFile(path: string) {
    setActiveTab('files');
    selectFile(path);
  }

  async function copyCommand(command: string) {
    let copied = false;

    if (window.isSecureContext && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(command);
        copied = true;
      } catch {
        copied = false;
      }
    }

    if (!copied) {
      const textarea = document.createElement('textarea');
      textarea.value = command;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '-9999px';
      textarea.style.left = '-9999px';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      } finally {
        document.body.removeChild(textarea);
      }
    }

    if (!copied) {
      addToast('复制命令失败，请手动复制', 'error');
      return;
    }

    setCopiedCommand(command);
    addToast('已复制安装命令', 'success');
    setTimeout(() => setCopiedCommand(''), 2000);
  }

  async function toggleFavorite() {
    if (!skill || !auth.isLoggedIn) { setShowLoginDialog(true); return; }
    try {
      if (isFavorite) {
        await api.delete(`/bookmarks/${skill.slug}`, { params: apiParams() });
        setIsFavorite(false);
        addToast('已取消收藏', 'success');
      } else {
        await api.post(`/bookmarks/${skill.slug}`, {}, { params: apiParams() });
        setIsFavorite(true);
        addToast('已收藏', 'success');
      }
    } catch { addToast('操作失败', 'error'); }
  }

  function installCommand(targetName: string, project = false) {
    return `snh install ${installSlug} --target ${targetName}${project ? ' --project' : ''}`;
  }

  function buildCommand(): string {
    if (!skill) return '';
    const base = `snh install ${installSlug}`;
    if (useCustom) {
      if (!customPath) return base;
      const parts = [base, `--path "${customPath}"`];
      if (installScope === 'project') parts.push('--project');
      return parts.join(' ');
    }
    if (!selectedTarget) return base;
    const parts = [base, `--target ${selectedTarget.name}`];
    if (installScope === 'project') parts.push('--project');
    return parts.join(' ');
  }

  function canInstall(): boolean {
    if (useCustom) return !!customPath.trim();
    if (!selectedTarget) return false;
    if (installScope === 'project' && !selectedTarget.project_path) return false;
    return true;
  }

  function launchCliInstall(url: string) {
    window.location.href = url;
    addToast('正在尝试唤起 SNH CLI，如无反应请点击“无法唤起？”查看安装步骤', 'info');
  }

  function handleSidebarInstall() {
    if (useCustom) {
      const token = localStorage.getItem('token');
      if (!token) { setShowLoginDialog(true); return; }
      const server = window.location.origin;
      const ownerName = skill?.owner_name || '';
      const slugOnly = skill?.slug || slug;
      const url = `snh://install?token=${encodeURIComponent(token)}&owner=${encodeURIComponent(ownerName)}&slug=${encodeURIComponent(slugOnly)}&server=${encodeURIComponent(server)}&project=${installScope === 'project' ? '1' : '0'}&path=${encodeURIComponent(customPath)}`;
      launchCliInstall(url);
    } else if (selectedTarget) {
      handleInstall(selectedTarget.name, installScope === 'project');
    }
  }

  function handleInstall(targetName: string, project = false) {
    const token = localStorage.getItem('token');
    if (!token) {
      setShowLoginDialog(true);
      return;
    }
    const server = window.location.origin;
    const ownerName = skill?.owner_name || '';
    const slugOnly = skill?.slug || slug;
    const url = `snh://install?token=${encodeURIComponent(token)}&owner=${encodeURIComponent(ownerName)}&slug=${encodeURIComponent(slugOnly)}&target=${encodeURIComponent(targetName)}&server=${encodeURIComponent(server)}&project=${project ? '1' : '0'}`;
    launchCliInstall(url);
  }

  const zipDownloadUrl = activeVersion
    ? `/api/skills/by-slug/${slug}/versions/${activeVersion.version}/download${owner ? `?owner=${encodeURIComponent(owner)}` : ''}`
    : '#';
  const zipRootName = skill?.slug || slug;

  const analysisPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analysisVersionRef = useRef(activeVersion?.version);
  analysisVersionRef.current = activeVersion?.version;

  const fetchAnalysis = useCallback(() => {
    if (!activeVersion?.version || !slug) return;
    const requestedVersion = activeVersion.version;
    api.get(`/skills/by-slug/${slug}/versions/${requestedVersion}/analysis`, { params: apiParams() })
      .then(({ data }) => {
        if (analysisVersionRef.current !== requestedVersion) return;
        // Backend now returns a single analysis record (or null).
        // Accept either shape defensively in case of cache/mixed versions.
        const current: SkillAnalysis | null = Array.isArray(data)
          ? (data.find((a: SkillAnalysis) => a.status === 'completed') || data[0] || null)
          : (data || null);
        setAnalysis(current);
        // Stop polling when done
        if (current && (current.status === 'completed' || current.status === 'failed')) {
          if (analysisPollRef.current) { clearInterval(analysisPollRef.current); analysisPollRef.current = null; }
        }
      })
      .catch(() => {});
  }, [activeVersion?.version, slug, ownerParam]);

  const retryAnalysis = useCallback(() => {
    if (!activeVersion?.version || !slug) return;
    setRetryingAnalysis(true);
    api.post(`/admin/analysis/by-slug/${slug}/versions/${activeVersion.version}/analyze`, {}, { params: apiParams() })
      .then(() => {
        // Switch to pending state and let the poller pick up the new run
        setAnalysis((prev) => prev ? { ...prev, status: 'pending', error_message: null } : prev);
        fetchAnalysis();
      })
      .catch(() => { /* auth/toast layer handles surfacing */ })
      .finally(() => setRetryingAnalysis(false));
  }, [activeVersion?.version, slug, ownerParam, fetchAnalysis]);

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  // Poll while analysis is in progress
  useEffect(() => {
    if (analysis && (analysis.status === 'pending' || analysis.status === 'processing')) {
      if (!analysisPollRef.current) {
        analysisPollRef.current = setInterval(fetchAnalysis, 5000);
      }
    }
    return () => { if (analysisPollRef.current) { clearInterval(analysisPollRef.current); analysisPollRef.current = null; } };
  }, [analysis?.status, fetchAnalysis]);


  const tabs = [
    { key: 'overview', label: '概览' },
    { key: 'install', label: '安装' },
    { key: 'files', label: '文件' },
    { key: 'versions', label: '版本', count: versions.length || null },
    { key: 'comments', label: '评论', count: commentTotal || null },
  ];

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    if (key === 'files') loadFiles();
    if (key === 'comments') loadComments();
  };

  const isMarkdown = selectedFile && /\.(md|markdown|txt)$/i.test(selectedFile);
  const ownerDisplayName = skill?.owner_nickname || skill?.owner_name || '-';
  const ownerIdentity = skill?.owner_name && skill.owner_nickname && skill.owner_nickname !== skill.owner_name
    ? `@${skill.owner_name}`
    : '';

  if (loading) return <div className="flex h-screen"><Sidebar /><div className="flex-1 flex items-center justify-center text-[var(--text-muted)]">加载中...</div></div>;
  if (!skill) return <div className="flex h-screen"><Sidebar /><div className="flex-1 flex items-center justify-center text-[var(--text-muted)]">技能不存在</div></div>;

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-6 flex flex-col gap-0">
            <div className="flex items-center gap-1.5 text-[13px] mb-4">
              <Link href="/" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]">首页</Link>
              <span className="text-[var(--text-muted)]">/</span>
              <Link href="/market" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]">技能市场</Link>
              <span className="text-[var(--text-muted)]">/</span>
              <span className="text-[var(--text-primary)] font-medium">{skill.name}</span>
            </div>

            <div className="page-hero rounded-xl p-6 flex flex-col gap-5 lg:flex-row lg:justify-between lg:items-start mb-5">
              <div className="flex gap-4 items-start">
                <SkillIcon skill={skill} index={0} size="lg" />
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2.5">
                    <h1 className="text-[22px] font-bold text-[var(--text-primary)]">{skill.name}</h1>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${skill.visibility === 'public' ? 'bg-green-100 text-[var(--green-tag)]' : 'bg-amber-100 text-amber-700'}`}>
                      {skill.visibility === 'public' ? '公开' : '私有'}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)]">
                    by <span className="font-medium text-[var(--primary)]">{ownerDisplayName}</span>
                    {ownerIdentity && <span className="ml-1 text-[12px] text-[var(--text-muted)]">{ownerIdentity}</span>}
                  </p>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed max-w-[600px]">{skill.description || '暂无描述'}</p>
                  <div className="flex gap-2 mt-1">
                    {(skill.tags || []).map(tag => (
                      <span key={tag} className="bg-[var(--tag-bg)] text-[var(--text-secondary)] text-xs px-2.5 py-1 rounded">{tag}</span>
                    ))}
                  </div>
                  <SkillTrustBadges trust={skill.trust} />
                  <div className="flex gap-4 mt-1 text-xs text-[var(--text-muted)]">
                    <span>创建于 {formatDate(skill.created_at)}</span>
                    <span>{skill.download_count || 0} 次安装</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                <button
                  type="button"
                  onClick={() => handleTabChange('install')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[var(--primary-dark)]"
                >
                  <Download className="w-3.5 h-3.5" />
                  安装
                </button>
                <button
                  type="button"
                  onClick={toggleFavorite}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-[13px] font-medium transition-colors ${isFavorite ? 'border-amber-200 bg-amber-100 text-amber-700' : 'border-[var(--border)] bg-white text-[var(--text-secondary)] hover:bg-gray-50'}`}
                >
                  <Star className={`w-3.5 h-3.5 ${isFavorite ? 'fill-current' : ''}`} />
                  {isFavorite ? '已收藏' : '收藏'}
                </button>
                <div className="flex min-w-[120px] flex-col rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-right">
                  <span className="text-[18px] font-bold text-[var(--text-primary)]">{skill.download_count || 0}</span>
                  <span className="text-[11px] text-[var(--text-muted)]">次安装</span>
                </div>
              </div>
            </div>

            <div className="flex border-b border-[var(--border)] mb-6">
              {tabs.map(tab => (
                <button key={tab.key} onClick={() => handleTabChange(tab.key)} className="flex flex-col items-center px-4 py-3">
                  <span className={`text-sm ${activeTab === tab.key ? 'text-[var(--primary)] font-semibold' : 'text-[var(--text-secondary)]'}`}>
                    {tab.label}{tab.count ? `(${tab.count})` : ''}
                  </span>
                  {activeTab === tab.key && <div className="w-10 h-0.5 bg-[var(--primary)] mt-2" />}
                </button>
              ))}
            </div>

            <div className="flex-1 flex flex-col gap-6">
                {activeTab === 'overview' && (
                  <div>
                    {activeVersion && (
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card-subtle)] px-4 py-3">
                        <div>
                          <p className="text-[11px] text-[var(--text-muted)]">当前查看版本</p>
                          <p className="text-[13px] font-semibold text-[var(--text-primary)]">
                            v{activeVersion.version}
                            {latestVersion && activeVersion.id !== latestVersion.id && (
                              <span className="ml-2 font-normal text-amber-600">历史版本</span>
                            )}
                          </p>
                        </div>
                        {latestVersion && activeVersion.id !== latestVersion.id && (
                          <button
                            type="button"
                            onClick={() => viewVersion(latestVersion)}
                            className="text-[12px] font-medium text-[var(--primary)] hover:underline"
                          >
                            返回最新版本
                          </button>
                        )}
                      </div>
                    )}
                    {skill.trust && activeVersion?.id === latestVersion?.id && (
                      <div className="surface-card mb-5 rounded-xl p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-[var(--primary)]">
                              <ShieldCheck className="h-4 w-4" />
                            </div>
                            <div>
                              <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">内部可信状态</h2>
                              <p className="text-[12px] text-[var(--text-muted)]">基于审核状态、基础安全检查和说明文档自动生成</p>
                            </div>
                          </div>
                          <SkillTrustBadges trust={skill.trust} />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="rounded-lg bg-[var(--bg-card-subtle)] px-3 py-2">
                            <p className="text-[11px] text-[var(--text-muted)]">审核</p>
                            <p className="mt-0.5 text-[13px] font-medium text-[var(--text-primary)]">{trustValueLabel('review', skill.trust.review_status)}</p>
                          </div>
                          <div className="rounded-lg bg-[var(--bg-card-subtle)] px-3 py-2">
                            <p className="text-[11px] text-[var(--text-muted)]">安全</p>
                            <p className="mt-0.5 text-[13px] font-medium text-[var(--text-primary)]">{trustValueLabel('security', skill.trust.security_status)}</p>
                          </div>
                          <div className="rounded-lg bg-[var(--bg-card-subtle)] px-3 py-2">
                            <p className="text-[11px] text-[var(--text-muted)]">说明</p>
                            <p className="mt-0.5 text-[13px] font-medium text-[var(--text-primary)]">{trustValueLabel('documentation', skill.trust.documentation_status)}</p>
                          </div>
                        </div>
                        {skill.trust.warnings.length > 0 && (
                          <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-700">
                            {skill.trust.warnings.join('；')}
                          </div>
                        )}
                      </div>
                    )}
                    {/* AI Analysis Card — shown above README */}
                    {analysis && analysis.status === 'completed' && (
                      <div className="surface-card mb-5 rounded-xl p-5">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                            </div>
                            <div>
                              <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">AI 分析</h2>
                              <p className="text-[11px] text-[var(--text-muted)]">AI 分析，仅供参考</p>
                            </div>
                          </div>
                          {analysis.quality_score != null && (
                            <div className="flex items-center gap-1.5 bg-purple-50 px-3 py-1.5 rounded-lg">
                              <span className="text-[12px] text-purple-600 font-medium">质量评分</span>
                              <span className="text-[18px] text-purple-700 font-bold">{analysis.quality_score}</span>
                              <span className="text-[11px] text-purple-400">/10</span>
                            </div>
                          )}
                        </div>
                        {analysis.summary && (
                          <div className="mb-4">
                            <p className="text-[12px] font-medium text-[var(--text-muted)] mb-1">一句话描述</p>
                            <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">{analysis.summary}</p>
                          </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {analysis.usage_guide && (
                            <div className="rounded-lg bg-[var(--bg-card-subtle)] px-4 py-3">
                              <p className="text-[12px] font-medium text-[var(--text-muted)] mb-1">如何使用</p>
                              <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-line">{analysis.usage_guide}</p>
                            </div>
                          )}
                          {analysis.use_cases && (
                            <div className="rounded-lg bg-[var(--bg-card-subtle)] px-4 py-3">
                              <p className="text-[12px] font-medium text-[var(--text-muted)] mb-1">适用场景</p>
                              <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-line">{analysis.use_cases}</p>
                            </div>
                          )}
                          {analysis.effects && (
                            <div className="rounded-lg bg-[var(--bg-card-subtle)] px-4 py-3">
                              <p className="text-[12px] font-medium text-[var(--text-muted)] mb-1">预期效果</p>
                              <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-line">{analysis.effects}</p>
                            </div>
                          )}
                          {analysis.warnings && (
                            <div className="rounded-lg bg-amber-50 px-4 py-3">
                              <p className="text-[12px] font-medium text-amber-600 mb-1">注意事项</p>
                              <p className="text-[13px] text-amber-700 leading-relaxed whitespace-pre-line">{analysis.warnings}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {/* Analysis progress indicator */}
                    {analysis && (analysis.status === 'pending' || analysis.status === 'processing') && (
                      <div className="surface-card mb-5 rounded-xl p-5">
                        <div className="flex items-center gap-3">
                          <Loader2 className="h-5 w-5 text-purple-500 animate-spin" />
                          <div>
                            <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">AI 分析中</h2>
                            <p className="text-[11px] text-[var(--text-muted)]">
                              {analysis.status === 'pending' ? '排队中，请稍候...' : '正在分析，请稍候...'}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 h-1.5 bg-purple-100 rounded-full overflow-hidden">
                          <div className="h-full bg-purple-500 rounded-full animate-pulse" style={{ width: analysis.status === 'processing' ? '60%' : '20%' }} />
                        </div>
                      </div>
                    )}
                    {analysis && analysis.status === 'failed' && (
                      <div className="surface-card mb-5 rounded-xl p-5 border border-amber-200">
                        <div className="flex items-center gap-3">
                          <AlertTriangle className="h-5 w-5 text-amber-500" />
                          <div className="flex-1">
                            <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">AI 分析未成功</h2>
                            <p className="text-[11px] text-[var(--text-muted)]">{analysis.error_message || '分析过程中发生错误，请稍后重试'}</p>
                          </div>
                          {auth.isAdmin && (
                            <button
                              onClick={retryAnalysis}
                              disabled={retryingAnalysis}
                              className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--primary)] border border-[var(--primary)] px-3 py-1.5 rounded-lg hover:bg-purple-50 transition-colors disabled:opacity-50"
                            >
                              <RotateCcw className={`h-3.5 w-3.5 ${retryingAnalysis ? 'animate-spin' : ''}`} />
                              {retryingAnalysis ? '提交中...' : '重新分析'}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    <p className="mb-3 text-sm font-medium text-[var(--text-muted)]">说明文档</p>
                    {activeVersion?.readme ? (
                      <MarkdownContent
                        content={activeVersion.readme}
                        skillSlug={slug}
                        version={activeVersion.version}
                        owner={owner}
                        basePath={documentationPath}
                        onOpenFile={openPackageFile}
                      />
                    ) : (
                      <p className="text-sm text-[var(--text-secondary)]">该版本暂无说明文档</p>
                    )}
                  </div>
                )}

                {activeTab === 'files' && (
                  <div className="flex gap-4 min-h-[400px]">
                    {/* File tree */}
                    <div className="w-[260px] border border-[var(--border)] rounded-lg bg-white overflow-y-auto flex-shrink-0 p-2 shadow-sm">
                      <FileTree node={buildTree(zipFiles)} selectedPath={selectedFile} onSelect={selectFile} />
                    </div>
                    {/* File content */}
                    <div className="flex-1 border border-[var(--border)] rounded-lg bg-white overflow-auto shadow-sm">
                      {selectedFile ? (
                        <>
                          <div className="px-4 py-2.5 border-b border-[var(--border)] bg-gray-50 flex items-center gap-2">
                            {(() => { const I = getFileIcon(selectedFile); return <I className="w-3.5 h-3.5 text-[var(--text-muted)]" />; })()}
                            <span className="text-[13px] font-medium text-[var(--text-primary)]">{selectedFile}</span>
                          </div>
                          <div className="p-4">
                            {fileLoading ? (
                              <p className="text-[13px] text-[var(--text-muted)]">加载中...</p>
                            ) : isMarkdown && fileContent && activeVersion ? (
                              <MarkdownContent
                                content={fileContent}
                                skillSlug={slug}
                                version={activeVersion.version}
                                owner={owner}
                                basePath={selectedFile}
                                onOpenFile={selectFile}
                              />
                            ) : fileContent ? (
                              <pre className="text-[13px] text-[var(--text-secondary)] font-mono whitespace-pre-wrap break-words leading-relaxed">{fileContent}</pre>
                            ) : (
                              <p className="text-[13px] text-[var(--text-muted)]">无法加载文件内容</p>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center justify-center h-full text-[13px] text-[var(--text-muted)]">选择一个文件查看内容</div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'versions' && (
                  <div>
                    <h2 className="text-base font-semibold text-[var(--text-primary)] mb-3">版本历史</h2>
                    <div className="flex flex-col gap-3">
                      {versions.map(v => (
                        <div key={v.id} className={`surface-card rounded-[10px] p-4 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start ${activeVersion?.id === v.id ? 'ring-1 ring-[var(--primary)]' : ''}`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-[var(--text-primary)]">{v.version}</span>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded ${v.status === 'approved' ? 'bg-green-100 text-[var(--green-tag)]' : v.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                {v.status === 'approved' ? '已发布' : v.status === 'pending' ? '待审批' : '已拒绝'}
                              </span>
                            </div>
                            {v.changelog && <p className="text-xs mt-1 text-[var(--text-muted)]">{v.changelog}</p>}
                            {v.rejection_reason && <p className="text-xs mt-1 text-red-600">拒绝原因：{v.rejection_reason}</p>}
                          </div>
                          <div className="flex flex-wrap items-center gap-3 shrink-0">
                            <span className="text-xs text-[var(--text-muted)]">{formatDate(v.created_at)}</span>
                            <button onClick={() => viewVersion(v)} className="flex items-center gap-1 text-[12px] font-medium text-[var(--primary)] hover:underline">
                              <FileText className="h-3.5 w-3.5" />查看内容
                            </button>
                            <button onClick={() => viewVersion(v, 'files')} className="flex items-center gap-1 text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--primary)]">
                              <FolderOpen className="h-3.5 w-3.5" />浏览文件
                            </button>
                            <button onClick={() => downloadVersion(v)} className="flex items-center gap-1 text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--primary)]">
                              <Download className="h-3.5 w-3.5" />下载
                            </button>
                            {auth.isAdmin && v.status === 'pending' && (
                              <>
                                <button onClick={() => approveVersion(v)} className="flex items-center gap-1 text-[12px] text-green-600 hover:text-green-800 font-medium">
                                  <Check className="w-3.5 h-3.5" />通过
                                </button>
                                <button onClick={() => { setRejectingVersion(v); setRejectReasonText(''); }} className="flex items-center gap-1 text-[12px] text-red-600 hover:text-red-800 font-medium">
                                  <X className="w-3.5 h-3.5" />拒绝
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'install' && (
                  <div className={installScope === 'zip' ? 'flex flex-col gap-6' : 'grid gap-6 lg:grid-cols-[minmax(0,800px)_minmax(320px,1fr)] lg:items-start'}>
                    <div className="surface-card rounded-xl p-6 flex flex-col gap-5 max-w-[800px] w-full">
                      <div className="flex items-center justify-between">
                        <h2 className="text-[18px] font-semibold text-[var(--text-primary)]">安装此技能</h2>
                        <TerminalSquare className="w-5 h-5 text-[var(--text-muted)]" />
                      </div>
                      <div>
                        <span className="text-[12px] font-medium text-[var(--text-muted)] uppercase tracking-wider">安装范围</span>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <button type="button" onClick={() => setInstallScope('global')}
                            className={`rounded-lg px-4 py-2 text-[13px] font-medium border transition-colors ${installScope === 'global' ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'bg-white text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--primary)]/40'}`}>
                            全局安装
                          </button>
                          <button type="button" onClick={() => setInstallScope('project')}
                            className={`rounded-lg px-4 py-2 text-[13px] font-medium border transition-colors ${installScope === 'project' ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'bg-white text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--primary)]/40'}`}>
                            项目安装
                          </button>
                          <button type="button" onClick={() => setInstallScope('zip')}
                            className={`rounded-lg px-4 py-2 text-[13px] font-medium border transition-colors ${installScope === 'zip' ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'bg-white text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--primary)]/40'}`}>
                            Zip包安装
                          </button>
                        </div>
                        <p className="mt-2 text-[13px] text-[var(--text-muted)] leading-relaxed">
                          {installScope === 'global'
                            ? '安装到用户主目录，所有项目共享使用。'
                            : installScope === 'project'
                              ? '安装到当前项目目录下，需要在项目文件夹中执行命令。'
                          : '下载 Skill Zip 包后手动解压到目标 Agent 的技能目录，适合无法使用 SNH CLI 的环境。'}
                        </p>
                      </div>
                      {installScope !== 'zip' && (
                        <div className="grid gap-2 sm:grid-cols-3">
                          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card-subtle)] px-3 py-3">
                            <div className="flex items-center gap-2">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[11px] font-semibold text-white">1</span>
                              <span className="text-[13px] font-semibold text-[var(--text-primary)]">选择 Agent</span>
                            </div>
                            <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--text-muted)]">选择目标工具或填写自定义目录。</p>
                          </div>
                          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card-subtle)] px-3 py-3">
                            <div className="flex items-center gap-2">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[11px] font-semibold text-white">2</span>
                              <span className="text-[13px] font-semibold text-[var(--text-primary)]">{installScope === 'project' ? '复制命令' : '确认命令'}</span>
                            </div>
                            <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--text-muted)]">{installScope === 'project' ? '复制下方命令到项目终端执行。' : '检查生成的 SNH 安装命令。'}</p>
                          </div>
                          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card-subtle)] px-3 py-3">
                            <div className="flex items-center gap-2">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[11px] font-semibold text-white">3</span>
                              <span className="text-[13px] font-semibold text-[var(--text-primary)]">{installScope === 'project' ? '终端执行' : '一键安装'}</span>
                            </div>
                            <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--text-muted)]">{installScope === 'project' ? '在目标项目文件夹中打开终端粘贴执行。' : '点击按钮唤起本地 SNH CLI。'}</p>
                          </div>
                        </div>
                      )}
                      {installScope === 'zip' ? (
                        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                          <div className="flex flex-col gap-5">
                            <div className="relative pl-10">
                              <span className="absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--bg-card-subtle)] text-[12px] font-semibold text-[var(--text-secondary)]">1</span>
                              <div className="absolute left-3 top-7 bottom-[-20px] w-px bg-[var(--border)]" />
                              <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">下载</h3>
                              <p className="mt-1 text-[13px] text-[var(--text-muted)]">从 Skill Hub 获取当前查看的 v{activeVersion?.version || '-'} 源码包。</p>
                              {activeVersion ? (
                                <a href={zipDownloadUrl} download className="mt-3 inline-flex items-center gap-2 rounded-md bg-black px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-gray-800">
                                  <Download className="w-4 h-4" />
                                  下载Zip安装包
                                </a>
                              ) : (
                                <button type="button" disabled className="mt-3 inline-flex items-center gap-2 rounded-md bg-gray-200 px-4 py-2 text-[13px] font-semibold text-gray-500">
                                  <Download className="w-4 h-4" />
                                  暂无可下载版本
                                </button>
                              )}
                            </div>
                            <div className="relative pl-10">
                              <span className="absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--bg-card-subtle)] text-[12px] font-semibold text-[var(--text-secondary)]">2</span>
                              <div className="absolute left-3 top-7 bottom-[-20px] w-px bg-[var(--border)]" />
                              <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">解压</h3>
                              <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">将 Skill Zip 包解压到你选定的开发文件夹中。请保持内部目录结构，可参考右侧目录树进行解压。</p>
                            </div>
                            <div className="relative pl-10">
                              <span className="absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--bg-card-subtle)] text-[12px] font-semibold text-[var(--text-secondary)]">3</span>
                              <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">运行</h3>
                              <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">把 Skill 目录放到对应 agent 的 skill 目录下。如果后续可使用本地 SNH CLI，仍建议回到全局安装或项目安装完成一键安装。</p>
                            </div>
                          </div>
                          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card-subtle)] overflow-hidden">
                            <div className="border-b border-[var(--border)] px-4 py-2 text-[13px] font-semibold text-[var(--text-primary)]">目录树</div>
                            <div className="max-h-[260px] overflow-auto px-4 py-3 font-mono text-[12px] leading-6 text-[var(--text-secondary)]">
                              <div className="flex items-center gap-2"><Folder className="w-3.5 h-3.5 text-amber-500" />Skill-Nexus-Hub/</div>
                              <div className="ml-5 flex items-center gap-2"><Folder className="w-3.5 h-3.5 text-blue-500" />assets/</div>
                              <div className="ml-10 flex items-center gap-2"><FileText className="w-3.5 h-3.5 text-[var(--text-muted)]" />ERRORS.md</div>
                              <div className="ml-10 flex items-center gap-2"><FileText className="w-3.5 h-3.5 text-[var(--text-muted)]" />FEATURE_REQUESTS.md</div>
                              <div className="ml-10 flex items-center gap-2"><FileText className="w-3.5 h-3.5 text-[var(--text-muted)]" />LEARNINGS.md</div>
                              <div className="ml-10 flex items-center gap-2"><FileText className="w-3.5 h-3.5 text-[var(--text-muted)]" />SKILL-TEMPLATE.md</div>
                              <div className="ml-5 flex items-center gap-2"><Folder className="w-3.5 h-3.5 text-blue-500" />skills/</div>
                              <div className="ml-10 flex items-center gap-2"><Folder className="w-3.5 h-3.5 text-blue-500" />{zipRootName}/</div>
                              <div className="ml-14 flex items-center gap-2"><FileText className="w-3.5 h-3.5 text-[var(--text-muted)]" />SKILL.md</div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div>
                            <span className="text-[12px] font-medium text-[var(--text-muted)] uppercase tracking-wider">目标 Agent</span>
                            <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">选择你要安装到哪个 AI 工具中。</p>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {installTargets.map(t => {
                                const disabled = installScope === 'project' && !t.project_path;
                                const active = !useCustom && selectedTarget?.id === t.id;
                                return (
                                  <button key={t.id} type="button" disabled={disabled} title={disabled ? '未配置项目路径' : undefined}
                                    onClick={() => { setSelectedTarget(t); setUseCustom(false); }}
                                    className={`rounded-lg px-4 py-2 text-[13px] font-medium border transition-colors ${active ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : disabled ? 'bg-white text-[var(--text-muted)] border-[var(--border)] cursor-not-allowed opacity-40' : 'bg-white text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--primary)]/40'}`}>
                                    {t.display_name}
                                  </button>
                                );
                              })}
                              <button type="button" onClick={() => { setUseCustom(true); setSelectedTarget(null); }}
                                className={`rounded-lg px-4 py-2 text-[13px] font-medium border transition-colors ${useCustom ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'bg-white text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--primary)]/40'}`}>
                                自定义
                              </button>
                            </div>
                            {useCustom && (
                              <input value={customPath} onChange={e => setCustomPath(e.target.value)}
                                placeholder="Skills 目录路径，如 ~/.cursor/skills"
                                className="mt-3 w-full max-w-md rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]" />
                            )}
                          </div>
                          {installScope === 'project' && !useCustom && selectedTarget && (
                            <p className="text-[13px] text-amber-600 bg-amber-50 rounded-lg px-3 py-2 leading-relaxed">
                              请先在项目文件夹中打开终端，再执行以下命令。
                            </p>
                          )}
                          <div className="cli-block flex items-center gap-3 rounded-lg p-3">
                            <code className="min-w-0 flex-1 text-[13px] font-mono break-all">{buildCommand()}</code>
                            <button type="button" onClick={() => copyCommand(buildCommand())} className="cli-block-muted transition-colors flex-shrink-0">
                              {copiedCommand === buildCommand() ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                          {installScope === 'project' ? (
                            <button type="button" onClick={() => copyCommand(buildCommand())} disabled={!selectedTarget}
                              className="w-full max-w-xs inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-6 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-[var(--primary-dark)] disabled:cursor-not-allowed disabled:opacity-40">
                              {copiedCommand === buildCommand() ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                              {copiedCommand === buildCommand() ? '已复制' : '复制命令'}
                            </button>
                          ) : (
                            <div className="flex w-full max-w-xs flex-col items-stretch gap-2">
                              <button type="button" onClick={handleSidebarInstall} disabled={!canInstall()}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-6 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-[var(--primary-dark)] disabled:cursor-not-allowed disabled:opacity-40">
                                <Download className="w-4 h-4" />
                                一键安装
                              </button>
                              <button type="button" onClick={() => setShowCliDialog(true)}
                                className="text-center text-[12px] font-medium text-[var(--text-muted)] hover:text-[var(--primary)]">
                                无法唤起？
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {installScope !== 'zip' && installTargets.length > 0 && (
                      <div className="min-w-0">
                        <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-3">安装路径参考</h3>
                        <div className="table-shell rounded-xl overflow-x-auto">
                          <table className="w-full text-[13px]">
                            <thead>
                              <tr className="border-b border-[var(--border)] bg-[var(--bg-card-subtle)]">
                                <th className="text-left py-3 px-4 font-medium text-[var(--text-muted)]">Agent</th>
                                <th className="text-left py-3 px-4 font-medium text-[var(--text-muted)]">全局路径</th>
                                <th className="text-left py-3 px-4 font-medium text-[var(--text-muted)]">项目路径</th>
                              </tr>
                            </thead>
                            <tbody>
                              {installTargets.map(t => (
                                <tr key={t.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-card-subtle)]">
                                  <td className="py-3 px-4 font-medium text-[var(--text-primary)]">{t.display_name}</td>
                                  <td className="py-3 px-4"><code className="text-[12px] font-mono text-[var(--text-secondary)] bg-[var(--tag-bg)] px-2 py-0.5 rounded">{t.global_path}</code></td>
                                  <td className="py-3 px-4"><code className="text-[12px] font-mono text-[var(--text-secondary)] bg-[var(--tag-bg)] px-2 py-0.5 rounded">{t.project_path || '-'}</code></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'comments' && (
                  <div>
                    <h2 className="text-[18px] font-semibold text-[var(--text-primary)] mb-4">评论 ({commentTotal})</h2>

                    {auth.isLoggedIn && (
                      <div className="flex gap-3 mb-6">
                        <textarea value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="写下你的评论..." rows={3}
                          className="flex-1 border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none resize-none bg-white focus:border-[var(--primary)]" />
                        <button onClick={submitComment} disabled={!commentText.trim() || submittingComment} className="px-4 py-2 bg-[var(--primary)] text-white text-[13px] rounded-lg font-medium disabled:opacity-40 self-end">{submittingComment ? '发送中...' : '发送'}</button>
                      </div>
                    )}

                    <div className="flex flex-col gap-4">
                      {comments.map(c => (
                        <CommentItem
                          key={c.id}
                          comment={c}
                          slug={slug}
                          owner={owner}
                          onRefresh={loadComments}
                          onToast={addToast}
                        />
                      ))}
                      {comments.length === 0 && <p className="text-[13px] text-[var(--text-muted)] text-center py-8">暂无评论</p>}
                    </div>
                  </div>
                )}
              </div>
          </div>
        </div>
      </div>

      <AlertDialog
        open={showLoginDialog}
        title="请先登录"
        message="登录后即可一键安装技能到本地 Agent 工具"
        onClose={() => setShowLoginDialog(false)}
        actions={
          <>
            <button onClick={() => setShowLoginDialog(false)} className="px-4 py-2 text-[13px] rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-gray-50">取消</button>
            <button onClick={() => { setShowLoginDialog(false); router.push('/login'); }} className="px-4 py-2 text-[13px] rounded-lg bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary-dark)]">去登录</button>
          </>
        }
      />

      <AlertDialog
        open={showCliDialog}
        title="无法唤起 SNH CLI？"
        onClose={() => setShowCliDialog(false)}
      >
        <div className="mt-3 text-[13px] text-[var(--text-secondary)] space-y-2">
          <p>一键安装依赖浏览器唤起本地 SNH CLI。如果点击后没有反应，请按下面步骤检查：</p>
          <div className="cli-block rounded-md p-3 font-mono text-xs leading-relaxed">
            1. 点击页面右上角「下载客户端」按钮，下载压缩包<br/>
            2. 解压后双击运行 snh.exe，自动安装到系统 PATH<br/>
            3. 关闭并重新打开浏览器，再点击「一键安装」<br/>
            4. 如果浏览器弹出外部应用确认框，请选择允许打开 SNH CLI
          </div>
        </div>
      </AlertDialog>

      {/* Version reject reason dialog */}
      {rejectingVersion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setRejectingVersion(null); setRejectReasonText(''); }} />
          <div className="relative z-10 bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-3">拒绝版本 {rejectingVersion.version}</h3>
            <p className="text-[13px] text-[var(--text-secondary)] mb-3">可以填写拒绝原因。</p>
            <textarea
              value={rejectReasonText}
              onChange={e => setRejectReasonText(e.target.value)}
              placeholder="拒绝原因（可选）..."
              rows={3}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none resize-none mb-4 focus:border-[var(--primary)]"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setRejectingVersion(null); setRejectReasonText(''); }} className="px-4 py-2 text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">取消</button>
              <button onClick={() => rejectVersion(rejectingVersion)} className="px-4 py-2 text-[13px] bg-red-600 text-white rounded-md font-medium hover:bg-red-700">拒绝</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
