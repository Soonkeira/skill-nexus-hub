'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, Copy, MonitorSmartphone, RefreshCw, ScanSearch, Upload, X } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import ConfirmDialog from '@/components/ConfirmDialog';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import type { DeviceInfo, InstallTarget, LocalPublishRequest, LocalSkillReport, SkillVisibility } from '@/lib/types';

const SCAN_COMMAND = 'snh scan --upload';
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;

interface PublishDraft {
  report_id: string;
  name: string;
  slug: string;
  description: string;
  version: string;
  changelog: string;
  visibility: SkillVisibility;
}

function formatSize(size: number) {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}

export default function LocalSkillsPage() {
  const auth = useAuth();
  const { addToast } = useToast();
  const [skills, setSkills] = useState<LocalSkillReport[]>([]);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [installTargets, setInstallTargets] = useState<InstallTarget[]>([]);
  const [selectedDevice, setSelectedDevice] = useState('all');
  const [customPaths, setCustomPaths] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmScan, setConfirmScan] = useState(false);
  const [waitingForScan, setWaitingForScan] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [publishDrafts, setPublishDrafts] = useState<PublishDraft[]>([]);
  const [showPublishReview, setShowPublishReview] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<LocalPublishRequest | null>(null);

  const loadLocalSkills = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [skillsRes, devicesRes, targetsRes] = await Promise.all([
        api.get('/local-skills'),
        api.get('/local-skills/devices'),
        api.get('/skills/install-targets'),
      ]);
      setSkills(skillsRes.data || []);
      setDevices(devicesRes.data || []);
      setInstallTargets(targetsRes.data || []);
      return true;
    } catch {
      if (!quiet) addToast('本地 Skill 数据加载失败', 'error');
      return false;
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadLocalSkills(); }, [loadLocalSkills]);

  useEffect(() => {
    if (!waitingForScan) return;
    let attempts = 0;
    const timer = window.setInterval(async () => {
      attempts += 1;
      await loadLocalSkills(true);
      if (attempts >= 15) {
        window.clearInterval(timer);
        setWaitingForScan(false);
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [waitingForScan, loadLocalSkills]);

  const visibleSkills = useMemo(
    () => selectedDevice === 'all' ? skills : skills.filter(skill => skill.device_id === selectedDevice),
    [skills, selectedDevice],
  );
  const selectableSkills = useMemo(
    () => visibleSkills.filter(skill => Boolean(skill.local_ref)),
    [visibleSkills],
  );
  const selectedCount = selectedIds.size;
  const allVisibleSelected = selectableSkills.length > 0 && selectableSkills.every(skill => selectedIds.has(skill.id));

  useEffect(() => {
    if (!activeRequestId) return;
    let stopped = false;
    const poll = async () => {
      try {
        const response = await api.get<LocalPublishRequest>(`/local-skills/publish-requests/${activeRequestId}`);
        if (stopped) return;
        setPublishResult(response.data);
        if (['completed', 'partial', 'failed'].includes(response.data.status)) {
          setActiveRequestId(null);
          const completed = response.data.items.filter(item => item.status === 'completed').length;
          const failed = response.data.items.filter(item => item.status === 'failed').length;
          addToast(`本地上传完成：成功 ${completed} 项，失败 ${failed} 项`, failed ? 'error' : 'success');
        }
      } catch {
        if (!stopped) setActiveRequestId(null);
      }
    };
    poll();
    const timer = window.setInterval(poll, 2000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [activeRequestId, addToast]);

  function toggleSkill(skill: LocalSkillReport) {
    if (!skill.local_ref) return;
    setSelectedIds(current => {
      const next = new Set(current);
      if (next.has(skill.id)) next.delete(skill.id);
      else if (next.size < 10) next.add(skill.id);
      else addToast('每次最多上传 10 个 Skill', 'error');
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds(current => {
      const next = new Set(current);
      if (allVisibleSelected) {
        selectableSkills.forEach(skill => next.delete(skill.id));
      } else {
        const remainingSlots = Math.max(0, 10 - next.size);
        selectableSkills
          .filter(skill => !next.has(skill.id))
          .slice(0, remainingSlots)
          .forEach(skill => next.add(skill.id));
      }
      return next;
    });
  }

  function openPublishReview() {
    const selected = skills.filter(skill => selectedIds.has(skill.id) && skill.local_ref);
    if (!selected.length) {
      addToast('请先选择要上传的本地 Skill', 'error');
      return;
    }
    setPublishDrafts(selected.map(skill => ({
      report_id: skill.id,
      name: skill.skill_name,
      slug: skill.skill_slug,
      description: '',
      version: '1.0.0',
      changelog: '从本地 Skill 扫描上传',
      visibility: 'public',
    })));
    setShowPublishReview(true);
  }

  function updateDraft(index: number, field: keyof PublishDraft, value: string) {
    setPublishDrafts(current => current.map((draft, draftIndex) => (
      draftIndex === index ? { ...draft, [field]: value } : draft
    )));
  }

  async function submitPublishRequest() {
    const invalid = publishDrafts.find(draft => (
      !draft.name.trim() || !SLUG_PATTERN.test(draft.slug) || !VERSION_PATTERN.test(draft.version)
    ));
    if (invalid) {
      addToast('请检查名称、Slug 和版本号格式', 'error');
      return;
    }
    const token = localStorage.getItem('token');
    if (!token) {
      addToast('登录状态已失效，请重新登录', 'error');
      return;
    }
    setPublishing(true);
    try {
      const response = await api.post('/local-skills/publish-requests', {
        items: publishDrafts.map(draft => ({
          ...draft,
          name: draft.name.trim(),
          description: draft.description.trim() || null,
          changelog: draft.changelog.trim() || null,
        })),
      });
      const requestId = response.data.request_id as string;
      const params = new URLSearchParams({ token, server: window.location.origin, request: requestId });
      setPublishResult(null);
      setActiveRequestId(requestId);
      setShowPublishReview(false);
      setSelectedIds(new Set());
      window.location.href = `snh://publish-local?${params.toString()}`;
      addToast('正在唤起 SNH CLI 打包并上传所选 Skill', 'info');
    } catch (error: any) {
      addToast(error.response?.data?.detail || '创建本地上传任务失败', 'error');
    } finally {
      setPublishing(false);
    }
  }

  function launchScan() {
    setConfirmScan(false);
    const token = localStorage.getItem('token');
    if (!token) {
      addToast('登录状态已失效，请重新登录', 'error');
      return;
    }
    const params = new URLSearchParams({ token, server: window.location.origin });
    parsedCustomPaths.forEach(path => params.append('path', path));
    const protocolUrl = `snh://scan?${params.toString()}`;
    window.location.href = protocolUrl;
    setWaitingForScan(true);
    addToast('正在唤起 SNH CLI 扫描，完成后列表会自动刷新', 'info');
  }

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(scanCommand);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast('复制失败，请手动复制命令', 'error');
    }
  }

  const parsedCustomPaths = useMemo(
    () => customPaths.split(/\r?\n|;/).map(path => path.trim()).filter(Boolean),
    [customPaths],
  );
  const scanCommand = useMemo(
    () => `${SCAN_COMMAND}${parsedCustomPaths.map(path => ` --path "${path.replaceAll('"', '\\"')}"`).join('')}`,
    [parsedCustomPaths],
  );

  if (auth.authLoading || !auth.user) {
    return <div className="flex h-screen"><Sidebar /><div className="flex-1 flex items-center justify-center text-[var(--text-muted)]">加载中...</div></div>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[12px] font-medium text-[var(--primary)] mb-1">本机工作区</p>
              <h1 className="text-[24px] font-semibold text-[var(--text-primary)]">本地 Skill</h1>
              <p className="text-[13px] text-[var(--text-muted)] mt-1">查看本机各 Agent 已安装的 Skill，并通过 SNH CLI 重新扫描同步。</p>
            </div>
            <button onClick={() => setConfirmScan(true)} className="inline-flex items-center gap-2 bg-[var(--primary)] text-white px-4 py-2.5 rounded-lg text-[13px] font-medium hover:bg-[var(--primary-dark)] transition-colors">
              <ScanSearch className="w-4 h-4" />
              一键扫描
            </button>
          </div>

          {waitingForScan && (
            <div className="mb-4 flex items-center gap-2 border border-blue-200 bg-blue-50 px-4 py-3 rounded-lg text-[13px] text-blue-700">
              <RefreshCw className="w-4 h-4 animate-spin" />
              正在等待 SNH CLI 完成扫描，结果将自动刷新。
            </div>
          )}

          <section className="surface-card rounded-[10px] mb-4 p-5">
            <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
              <div>
                <h2 className="text-[14px] font-semibold text-[var(--text-primary)] mb-1">扫描路径参考</h2>
                <p className="text-[12px] text-[var(--text-muted)] mb-3">一键扫描会自动检查以下 Agent 全局目录；`~` 表示当前 Windows 用户目录。</p>
                <div className="space-y-2">
                  {installTargets.map(target => (
                    <div key={target.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2">
                      <span className="text-[12px] font-medium text-[var(--text-secondary)]">{target.display_name}</span>
                      <code className="text-[11px] text-[var(--text-muted)] break-all text-right">{target.global_path}</code>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="custom-scan-paths" className="block text-[14px] font-semibold text-[var(--text-primary)] mb-1">自定义扫描路径</label>
                <p className="text-[12px] text-[var(--text-muted)] mb-3">可填写 Skill 本身目录或包含多个 Skill 的父目录；多个路径请换行或使用分号分隔。</p>
                <textarea
                  id="custom-scan-paths"
                  value={customPaths}
                  onChange={event => setCustomPaths(event.target.value)}
                  rows={5}
                  placeholder={'例如：\nC:\\my-skills\\skills\nD:\\team-skills'}
                  className="w-full resize-y rounded-lg border border-[var(--border)] bg-white px-3 py-2.5 text-[12px] font-mono text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
                />
              </div>
            </div>
          </section>

          <section className="surface-card rounded-[10px] overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <MonitorSmartphone className="w-4 h-4 text-[var(--primary)]" />
                <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">扫描结果</h2>
                <span className="text-[11px] bg-blue-50 text-[var(--primary)] px-2 py-0.5 rounded-md font-medium">{visibleSkills.length} 项</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openPublishReview}
                  disabled={selectedCount === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-2 text-[12px] font-medium text-white hover:bg-[var(--primary-dark)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Upload className="h-3.5 w-3.5" />
                  上传所选{selectedCount ? ` (${selectedCount})` : ''}
                </button>
                {devices.length > 0 && (
                  <div className="relative">
                    <select value={selectedDevice} onChange={event => setSelectedDevice(event.target.value)} className="appearance-none bg-white border border-[var(--border)] rounded-lg pl-3 pr-8 py-2 text-[12px] text-[var(--text-secondary)] outline-none cursor-pointer">
                      <option value="all">全部设备</option>
                      {devices.map(device => <option key={device.device_id} value={device.device_id}>{device.device_name || device.device_id.slice(0, 8)}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" />
                  </div>
                )}
                <button onClick={() => loadLocalSkills()} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] text-[var(--text-secondary)] hover:text-[var(--primary)] disabled:opacity-50">
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  刷新
                </button>
              </div>
            </div>

            {(activeRequestId || publishResult) && (
              <div className="border-b border-[var(--border)] bg-blue-50 px-5 py-3 text-[12px] text-[var(--text-secondary)]">
                {activeRequestId ? (
                  <span className="inline-flex items-center gap-2"><RefreshCw className="h-3.5 w-3.5 animate-spin text-[var(--primary)]" />SNH CLI 正在打包并上传，请勿关闭本地控制台。</span>
                ) : (
                  <div>
                    <span className="font-medium text-[var(--text-primary)]">最近上传结果</span>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      {publishResult?.items.map(item => (
                        <span key={item.id} className={item.status === 'failed' ? 'text-red-600' : 'text-green-700'}>
                          {item.slug}: {item.status === 'failed' ? item.error_message || '上传失败' : '已提交审核'}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {visibleSkills.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead><tr className="border-b border-[var(--border)]">
                    <th className="w-12 px-5 py-3 text-left">
                      <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="全选当前结果" className="h-4 w-4 accent-[var(--primary)]" />
                    </th>
                    {['技能名称', 'Slug', '目标 Agent', '文件数', '大小', '标识'].map(label => <th key={label} className="text-left px-5 py-3 font-medium text-[11px] text-[var(--text-muted)]">{label}</th>)}
                  </tr></thead>
                  <tbody>{visibleSkills.map(skill => (
                    <tr key={skill.id} className="border-b border-[var(--border)] last:border-0 hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(skill.id)}
                          disabled={!skill.local_ref}
                          onChange={() => toggleSkill(skill)}
                          aria-label={`选择 ${skill.skill_name}`}
                          title={skill.local_ref ? '选择上传' : '请使用最新版 SNH CLI 重新扫描'}
                          className="h-4 w-4 accent-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </td>
                      <td className="px-5 py-3 font-medium text-[var(--text-primary)]">{skill.skill_name}</td>
                      <td className="px-5 py-3 text-[12px] text-[var(--text-muted)] font-mono">{skill.skill_slug}</td>
                      <td className="px-5 py-3 text-[12px] text-[var(--text-secondary)]">{skill.agent_target || '-'}</td>
                      <td className="px-5 py-3 text-[12px] text-[var(--text-secondary)]">{skill.file_count}</td>
                      <td className="px-5 py-3 text-[12px] text-[var(--text-secondary)]">{formatSize(skill.total_size)}</td>
                      <td className="px-5 py-3"><div className="flex flex-wrap gap-1">
                        {skill.has_skill_md && <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded">MD</span>}
                        {skill.has_skill_yaml && <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">YAML</span>}
                        {!skill.local_ref && <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">需重新扫描</span>}
                      </div></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : (
              <div className="py-14 text-center px-6">
                <MonitorSmartphone className="w-10 h-10 mx-auto text-[var(--text-muted)] mb-3" />
                <p className="text-[14px] font-medium text-[var(--text-primary)]">尚未收到扫描结果</p>
                <p className="text-[12px] text-[var(--text-muted)] mt-1">点击右上角“一键扫描”，并在浏览器提示中允许打开 SNH CLI。</p>
                <button onClick={copyCommand} className="mt-4 inline-flex items-center gap-1.5 text-[12px] text-[var(--primary)] hover:underline">
                  {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? '命令已复制' : `无法唤起？复制 ${scanCommand}`}
                </button>
              </div>
            )}
          </section>
        </main>
      </div>

      <ConfirmDialog
        open={confirmScan}
        title="扫描本地 Skill"
        message={`确认后将打开本机 SNH CLI，扫描 ${installTargets.length} 个默认 Agent 目录${parsedCustomPaths.length ? `和 ${parsedCustomPaths.length} 个自定义路径` : ''}，并同步文件名称、大小等信息。不会上传文件内容。`}
        confirmText="确认并开始扫描"
        onConfirm={launchScan}
        onCancel={() => setConfirmScan(false)}
      />

      {showPublishReview && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="presentation" onClick={() => setShowPublishReview(false)}>
          <div className="absolute inset-0 bg-black/45" />
          <div className="relative flex max-h-[88vh] w-full max-w-[920px] flex-col overflow-hidden rounded-lg bg-[var(--bg-card)] shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="publish-review-title" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-5">
              <div>
                <h2 id="publish-review-title" className="text-[17px] font-semibold text-[var(--text-primary)]">确认上传信息</h2>
                <p className="mt-1 text-[12px] text-[var(--text-muted)]">确认后由本机 SNH CLI 读取目录、生成 ZIP 并上传，原始文件不会被修改。</p>
              </div>
              <button type="button" onClick={() => setShowPublishReview(false)} aria-label="关闭" className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X className="h-5 w-5" /></button>
            </div>
            <div className="overflow-y-auto px-6">
              {publishDrafts.map((draft, index) => (
                <section key={draft.report_id} className="grid gap-4 border-b border-[var(--border)] py-5 last:border-0 md:grid-cols-2">
                  <label className="text-[12px] font-medium text-[var(--text-secondary)]">技能名称
                    <input value={draft.name} onChange={event => updateDraft(index, 'name', event.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--primary)]" />
                  </label>
                  <label className="text-[12px] font-medium text-[var(--text-secondary)]">Slug
                    <input value={draft.slug} onChange={event => updateDraft(index, 'slug', event.target.value.toLowerCase())} className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 font-mono text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--primary)]" />
                  </label>
                  <label className="text-[12px] font-medium text-[var(--text-secondary)] md:col-span-2">描述
                    <textarea rows={2} value={draft.description} onChange={event => updateDraft(index, 'description', event.target.value)} className="mt-1.5 w-full resize-y rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--primary)]" />
                  </label>
                  <label className="text-[12px] font-medium text-[var(--text-secondary)]">版本号
                    <input value={draft.version} onChange={event => updateDraft(index, 'version', event.target.value)} placeholder="1.0.0" className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 font-mono text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--primary)]" />
                  </label>
                  <label className="text-[12px] font-medium text-[var(--text-secondary)]">可见范围
                    <select value={draft.visibility} onChange={event => updateDraft(index, 'visibility', event.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--primary)]">
                      <option value="public">公开</option>
                      <option value="private">私有</option>
                    </select>
                  </label>
                  <label className="text-[12px] font-medium text-[var(--text-secondary)] md:col-span-2">更新说明
                    <input value={draft.changelog} onChange={event => updateDraft(index, 'changelog', event.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--primary)]" />
                  </label>
                </section>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
              <button type="button" onClick={() => setShowPublishReview(false)} className="rounded-lg border border-[var(--border)] px-4 py-2 text-[13px] text-[var(--text-secondary)] hover:bg-gray-50">取消</button>
              <button type="button" onClick={submitPublishRequest} disabled={publishing} className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-[13px] font-medium text-white hover:bg-[var(--primary-dark)] disabled:opacity-50">
                {publishing && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                确认并唤起 SNH CLI
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
