'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import type { LLMProvider } from '@/lib/types';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import ConfirmDialog from '@/components/ConfirmDialog';
import AlertDialog from '@/components/AlertDialog';
import { useToast } from '@/lib/toast';
import { BrainCircuit, Plus, Trash2, TestTube2, Star, RefreshCw, X } from 'lucide-react';
import { formatDate } from '@/utils';

export default function AdminLLMPage() {
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LLMProvider | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<LLMProvider | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const toast = useToast();
  const showToast = (msg: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') => toast.addToast(msg, type);

  // Form state
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('openai');
  const [formBaseUrl, setFormBaseUrl] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formDefault, setFormDefault] = useState(false);
  const [formMaxTokens, setFormMaxTokens] = useState(4096);
  const [formTemp, setFormTemp] = useState(0.3);

  function loadProviders() {
    setLoading(true);
    api.get('/admin/llm-providers')
      .then(({ data }) => setProviders(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadProviders(); }, []);

  function resetForm() {
    setFormName(''); setFormType('openai'); setFormBaseUrl(''); setFormModel('');
    setFormApiKey(''); setFormDefault(false); setFormMaxTokens(4096); setFormTemp(0.3);
    setEditing(null); setShowForm(false);
  }

  function editProvider(p: LLMProvider) {
    setFormName(p.name); setFormType(p.provider_type); setFormBaseUrl(p.base_url);
    setFormModel(p.model_name); setFormApiKey(''); setFormDefault(p.is_default);
    setFormMaxTokens(p.max_tokens); setFormTemp(p.temperature);
    setEditing(p); setShowForm(true);
  }

  async function saveProvider() {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: formName, provider_type: formType, base_url: formBaseUrl,
        model_name: formModel, is_default: formDefault,
        max_tokens: formMaxTokens, temperature: formTemp,
      };
      if (formApiKey.trim()) payload.api_key = formApiKey.trim();
      if (editing) {
        await api.put(`/admin/llm-providers/${editing.id}`, payload);
        showToast('提供商已更新');
      } else {
        await api.post('/admin/llm-providers', payload);
        showToast('提供商已创建');
      }
      resetForm();
      loadProviders();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || '操作失败', 'error');
    } finally { setSaving(false); }
  }

  async function deleteProvider(id: string) {
    try {
      await api.delete(`/admin/llm-providers/${id}`);
      showToast('提供商已删除');
      loadProviders();
    } catch { showToast('删除失败', 'error'); }
  }

  async function testProvider(id: string) {
    setTesting(id);
    try {
      const { data } = await api.post(`/admin/llm-providers/${id}/test`);
      setTestResult({ success: data.success, message: data.message });
    } catch (error: any) {
      setTestResult({ success: false, message: error?.response?.data?.detail || '测试请求失败' });
    }
    finally { setTesting(null); }
  }

  async function backfillAnalyses() {
    setBackfilling(true);
    try {
      const { data } = await api.post('/admin/analysis/backfill');
      const n = data?.queued ?? 0;
      showToast(n > 0 ? `已排队 ${n} 个 Skill 分析,稍后在各详情页查看` : '没有需要补充分析的 Skill(全部已分析或暂无已通过版本)');
    } catch (e: any) {
      showToast(e?.response?.data?.detail || '补充分析失败', 'error');
    } finally { setBackfilling(false); }
  }

  if (loading) return <div className="flex h-screen"><Sidebar /><div className="flex-1 flex items-center justify-center text-[var(--text-muted)]">加载中...</div></div>;

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-6 flex flex-col gap-5">
            <div className="page-hero rounded-xl p-6">
              <div className="inline-flex items-center gap-2 text-[12px] text-purple-600 font-medium bg-purple-50 px-2.5 py-1 rounded-md">
                <BrainCircuit className="w-3.5 h-3.5" />
                管理员
              </div>
              <h1 className="text-[22px] font-bold text-[var(--text-primary)] mt-3">LLM 提供商配置</h1>
              <p className="text-[13px] text-[var(--text-muted)] mt-1">LLM 用于在 Skill 版本通过审核后生成摘要、使用指南、效果、最佳实践、质量评分和风险提示。API Key 在此页面配置并加密保存。分析限制：每个 Skill 最多提取 20 个文件、总计 50 MB。</p>
            </div>

            {/* Provider Form */}
            {showForm && (
              <div className="surface-card rounded-[10px] p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{editing ? '编辑提供商' : '添加提供商'}</h2>
                  <button onClick={resetForm} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[13px] font-medium mb-1.5 text-[var(--text-secondary)]">名称</label>
                    <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="如: DeepSeek v3"
                      className="w-full border border-[var(--border)] rounded-lg px-3.5 py-2.5 text-[13px] outline-none bg-white" />
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium mb-1.5 text-[var(--text-secondary)]">类型</label>
                    <select value={formType} onChange={e => setFormType(e.target.value)}
                      className="w-full border border-[var(--border)] rounded-lg px-3.5 py-2.5 text-[13px] outline-none bg-white">
                      <option value="openai">OpenAI 兼容</option>
                      <option value="anthropic">Anthropic</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium mb-1.5 text-[var(--text-secondary)]">Base URL</label>
                    <input value={formBaseUrl} onChange={e => setFormBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1"
                      className="w-full border border-[var(--border)] rounded-lg px-3.5 py-2.5 text-[13px] outline-none bg-white" />
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium mb-1.5 text-[var(--text-secondary)]">模型名称</label>
                    <input value={formModel} onChange={e => setFormModel(e.target.value)} placeholder="gpt-4o / deepseek-chat"
                      className="w-full border border-[var(--border)] rounded-lg px-3.5 py-2.5 text-[13px] outline-none bg-white" />
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium mb-1.5 text-[var(--text-secondary)]">API Key</label>
                    <input type="password" value={formApiKey} onChange={e => setFormApiKey(e.target.value)} placeholder={editing ? '留空则沿用已保存的 Key' : '请输入 API Key'} autoComplete="new-password"
                      className="w-full border border-[var(--border)] rounded-lg px-3.5 py-2.5 text-[13px] outline-none bg-white" />
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">保存后只显示配置状态，不会再次回显明文。</p>
                  </div>
                  <div className="flex items-end gap-4">
                    <div className="flex-1">
                      <label className="block text-[13px] font-medium mb-1.5 text-[var(--text-secondary)]">Max Tokens</label>
                      <input type="number" value={formMaxTokens} onChange={e => setFormMaxTokens(parseInt(e.target.value) || 4096)}
                        className="w-full border border-[var(--border)] rounded-lg px-3.5 py-2.5 text-[13px] outline-none bg-white" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[13px] font-medium mb-1.5 text-[var(--text-secondary)]">Temperature</label>
                      <input type="number" step="0.1" value={formTemp} onChange={e => setFormTemp(parseFloat(e.target.value) || 0.3)}
                        className="w-full border border-[var(--border)] rounded-lg px-3.5 py-2.5 text-[13px] outline-none bg-white" />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-4">
                  <label className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)] cursor-pointer">
                    <input type="checkbox" checked={formDefault} onChange={e => setFormDefault(e.target.checked)} className="rounded" />
                    设为默认提供商
                  </label>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={saveProvider} disabled={saving || !formName || !formBaseUrl || !formModel || (!editing && !formApiKey.trim())}
                    className="bg-[var(--primary)] text-white px-5 py-2.5 rounded-lg text-[13px] font-medium hover:bg-[var(--primary-dark)] transition-colors disabled:opacity-50">
                    {saving ? '保存中...' : '保存'}
                  </button>
                  <button onClick={resetForm}
                    className="bg-white border border-[var(--border)] text-[13px] px-3 py-2 rounded-lg text-[var(--text-secondary)]">
                    取消
                  </button>
                </div>
              </div>
            )}

            {/* Provider List */}
            <div className="surface-card rounded-[10px] p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">已配置提供商</h2>
                <div className="flex gap-2">
                  <button onClick={loadProviders} className="flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)] hover:text-[var(--primary)]">
                    <RefreshCw className="w-3.5 h-3.5" /> 刷新
                  </button>
                  <button onClick={backfillAnalyses} disabled={backfilling}
                    title="为已通过审核但尚未生成 AI 分析的 Skill 补充分析"
                    className="flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)] hover:text-[var(--primary)] disabled:opacity-50">
                    <RefreshCw className={`w-3.5 h-3.5 ${backfilling ? 'animate-spin' : ''}`} /> {backfilling ? '补充中...' : '补充缺失分析'}
                  </button>
                  <button onClick={() => { resetForm(); setShowForm(true); }}
                    className="bg-[var(--primary)] text-white px-4 py-2 rounded-lg text-[13px] font-medium hover:bg-[var(--primary-dark)] transition-colors flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> 添加提供商
                  </button>
                </div>
              </div>
              {providers.length > 0 ? (
                <table className="w-full text-[13px]">
                  <thead><tr className="border-b border-[var(--border)]">
                    <th className="text-left px-4 py-3 font-medium text-[11px] text-[var(--text-muted)]">名称</th>
                    <th className="text-left px-4 py-3 font-medium text-[11px] text-[var(--text-muted)]">类型</th>
                    <th className="text-left px-4 py-3 font-medium text-[11px] text-[var(--text-muted)]">模型</th>
                    <th className="text-left px-4 py-3 font-medium text-[11px] text-[var(--text-muted)]">API Key</th>
                    <th className="text-left px-4 py-3 font-medium text-[11px] text-[var(--text-muted)]">默认</th>
                    <th className="text-left px-4 py-3 font-medium text-[11px] text-[var(--text-muted)]">创建时间</th>
                    <th className="text-left px-4 py-3 font-medium text-[11px] text-[var(--text-muted)]">操作</th>
                  </tr></thead>
                  <tbody>
                    {providers.map(p => (
                      <tr key={p.id} className="border-b border-[var(--border)] last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{p.name}</td>
                        <td className="px-4 py-3 text-[12px]">
                          <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${p.provider_type === 'openai' ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>
                            {p.provider_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[12px] text-[var(--text-secondary)] font-mono">{p.model_name}</td>
                        <td className="px-4 py-3 text-[12px] text-[var(--text-muted)]">{p.api_key_configured ? '已配置' : '未配置'}</td>
                        <td className="px-4 py-3">
                          {p.is_default && <Star className="w-4 h-4 text-amber-500 fill-amber-500" />}
                        </td>
                        <td className="px-4 py-3 text-[11px] text-[var(--text-muted)]">{formatDate(p.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button onClick={() => editProvider(p)} className="text-[12px] text-[var(--primary)] hover:underline">编辑</button>
                            <button onClick={() => testProvider(p.id)} disabled={testing === p.id}
                              className="flex items-center gap-1 text-[12px] text-purple-600 hover:underline disabled:opacity-50">
                              <TestTube2 className="w-3 h-3" />
                              {testing === p.id ? '测试中...' : '测试'}
                            </button>
                            <button onClick={() => setPendingDelete(p)} className="text-red-600 hover:text-red-800 text-[12px]">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-8 text-center">
                  <BrainCircuit className="w-10 h-10 mx-auto text-[var(--text-muted)] mb-3" />
                  <p className="text-[13px] text-[var(--text-muted)]">暂无 LLM 提供商</p>
                  <p className="text-[12px] text-[var(--text-muted)] mt-1">点击"添加提供商"开始配置</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="确认删除"
        message={`确定要删除提供商"${pendingDelete?.name}"吗？已有分析记录的 provider_id 将被设为 NULL。`}
        danger
        confirmText="删除"
        onConfirm={() => { if (pendingDelete) { deleteProvider(pendingDelete.id); setPendingDelete(null); } }}
        onCancel={() => setPendingDelete(null)}
      />
      <AlertDialog
        open={testResult !== null}
        title={testResult?.success ? '连通测试成功' : '连通测试失败'}
        message={testResult?.message}
        icon={testResult?.success ? 'info' : 'warning'}
        onClose={() => setTestResult(null)}
      />
    </div>
  );
}
