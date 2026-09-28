'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';
import type { ApiToken, LocalSkillReport, DeviceInfo } from '@/lib/types';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import AlertDialog from '@/components/AlertDialog';
import { Camera, X, Check, KeyRound, UserCog, MonitorSmartphone, RefreshCw, Copy, ChevronDown } from 'lucide-react';
import { formatDate } from '@/utils';
import ConfirmDialog from '@/components/ConfirmDialog';
import { AVATAR_PRESETS, getLucideIcon } from '@/lib/icon-presets';

const AVATAR_COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EC4899',
  '#06B6D4', '#EF4444', '#6366F1', '#F97316', '#14B8A6',
];

export default function ProfilePage() {
  const auth = useAuth();
  const [editNickname, setEditNickname] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarDataUrl, setAvatarDataUrl] = useState<string>('');
  const [selectedAvatarKey, setSelectedAvatarKey] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState(AVATAR_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [profileError, setProfileError] = useState('');
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [createdToken, setCreatedToken] = useState('');
  const [creating, setCreating] = useState(false);
  const [showPwdForm, setShowPwdForm] = useState(true);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<string | null>(null);
  const [localSkills, setLocalSkills] = useState<LocalSkillReport[]>([]);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('all');
  const [showScanHint, setShowScanHint] = useState(false);
  const [copied, setCopied] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);

  useEffect(() => {
    if (auth.user) {
      setEditNickname(auth.user.nickname || '');
      setEditDepartment(auth.user.department || '');
      if (auth.user.avatar_url) {
        setAvatarPreview(auth.user.avatar_url);
        setAvatarDataUrl(auth.user.avatar_url);
      }
    }
    api.get('/tokens').then(({ data }) => setTokens(Array.isArray(data) ? data : (data as any).items || [])).catch(() => {});
  }, [auth.user]);

  async function loadLocalSkills() {
    setLocalLoading(true);
    try {
      const [skillsRes, devicesRes] = await Promise.all([
        api.get('/local-skills'),
        api.get('/local-skills/devices'),
      ]);
      setLocalSkills(skillsRes.data || []);
      setDevices(devicesRes.data || []);
    } catch { /* not scanned yet */ }
    finally { setLocalLoading(false); }
  }

  useEffect(() => { loadLocalSkills(); }, []);

  function handleAvatarChange(file: File) {
    setSelectedAvatarKey(null);
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target?.result as string;
      setAvatarPreview(dataUrl);
      setAvatarDataUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  function selectAvatar(key: string) {
    setSelectedAvatarKey(key);
    setAvatarPreview(null);
    setAvatarDataUrl(key);
  }

  async function saveProfile() {
    setSaving(true); setProfileMsg(''); setProfileError('');
    try {
      const { data } = await api.put('/auth/profile', {
        nickname: editNickname || undefined,
        avatar_url: avatarDataUrl || null,
        department: editDepartment || null,
      });
      await auth.fetchUser();
      setProfileMsg('保存成功');
      setTimeout(() => setProfileMsg(''), 3000);
    } catch (e) { console.error('Failed to save profile:', e); setProfileError('保存失败'); }
    finally { setSaving(false); }
  }

  async function createToken(expiresInDays?: number) {
    setCreating(true);
    try {
      const { data } = await api.post('/tokens', {
        name: newTokenName,
        expires_in_days: expiresInDays || undefined,
      });
      setCreatedToken(data.token); setNewTokenName(''); setShowCreate(false);
      const { data: tData } = await api.get('/tokens');
      setTokens(Array.isArray(tData) ? tData : (tData as any).items || []);
    } catch (e) { console.error('Failed to create token:', e); }
    finally { setCreating(false); }
  }

  async function revokeToken(id: string) {
    await api.delete(`/tokens/${id}`);
    setTokens(tokens.filter(t => t.id !== id));
  }

  async function changePassword() {
    setPwdMsg(''); setPwdError('');
    if (!oldPwd || !newPwd || !confirmPwd) {
      setPwdError('请填写所有密码字段');
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdError('两次输入的新密码不一致');
      return;
    }
    if (newPwd.length < 6) {
      setPwdError('新密码至少6位');
      return;
    }
    setPwdSaving(true);
    try {
      await api.put('/auth/password', { old_password: oldPwd, new_password: newPwd });
      setPwdMsg('密码修改成功');
      setOldPwd(''); setNewPwd(''); setConfirmPwd('');
      setTimeout(() => { setPwdMsg(''); setShowPwdForm(false); }, 2000);
    } catch (e: any) {
      const detail = e?.response?.data?.detail || '密码修改失败';
      setPwdError(detail);
    } finally {
      setPwdSaving(false);
    }
  }

  const displayName = auth.user?.nickname || auth.user?.username || '...';
  const initial = displayName.charAt(0).toUpperCase();

  if (auth.authLoading || !auth.user) return <div className="flex h-screen"><Sidebar /><div className="flex-1 flex items-center justify-center text-[var(--text-muted)]">加载中...</div></div>;

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-6 flex flex-col gap-5">
            <div className="page-hero rounded-xl p-6">
              <div className="inline-flex items-center gap-2 text-[12px] text-[var(--primary)] font-medium bg-blue-50 px-2.5 py-1 rounded-md">
                <UserCog className="w-3.5 h-3.5" />
                账号与 CLI
              </div>
              <h1 className="text-[22px] font-bold text-[var(--text-primary)] mt-3">个人中心</h1>
              <p className="text-[13px] text-[var(--text-muted)] mt-1">维护个人资料、部门信息、登录密码和 API 令牌。</p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {/* Edit Profile */}
              <div className="surface-card rounded-[10px] p-5 flex flex-col gap-4">
                <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">编辑资料</h2>
              {profileMsg && <p className="text-[13px] p-3 rounded-lg bg-green-50 text-green-700">{profileMsg}</p>}

              {/* Avatar */}
              <div>
                <label className="block text-[13px] font-medium mb-2 text-[var(--text-secondary)]">头像</label>
                <div className="flex items-start gap-5">
                  {/* Preview */}
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center"
                      style={{ backgroundColor: selectedColor }}>
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
                      ) : selectedAvatarKey && getLucideIcon(selectedAvatarKey) ? (
                        (() => { const AvatarIcon = getLucideIcon(selectedAvatarKey)!; return <AvatarIcon size={32} className="text-white" strokeWidth={2} />; })()
                      ) : (
                        <span className="text-white text-2xl font-semibold">{initial}</span>
                      )}
                    </div>
                    {/* Color picker */}
                    <div className="flex gap-1 flex-wrap justify-center">
                      {AVATAR_COLORS.map(c => (
                        <button key={c} type="button" onClick={() => setSelectedColor(c)}
                          className={`w-4 h-4 rounded-full border-2 transition-transform ${selectedColor === c ? 'border-gray-800 scale-125' : 'border-transparent hover:scale-110'}`}
                          style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </div>
                  {/* Presets + Upload */}
                  <div className="flex-1">
                    <p className="text-[12px] text-[var(--text-muted)] mb-2">选择一个简洁头像</p>
                    <div className="flex gap-1.5 flex-wrap mb-3">
                      {AVATAR_PRESETS.map(preset => {
                        const PresetIcon = preset.icon;
                        return (
                          <button key={preset.key} type="button" onClick={() => selectAvatar(preset.key)}
                            className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all hover:scale-110 ${selectedAvatarKey === preset.key ? 'border-[var(--primary)] bg-blue-50' : 'border-[var(--border)] bg-white hover:border-gray-300'}`}>
                            <PresetIcon size={16} className={selectedAvatarKey === preset.key ? 'text-[var(--primary)]' : 'text-[var(--text-secondary)]'} />
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => document.getElementById('avatar-input')?.click()}
                        className="flex items-center gap-1.5 text-[13px] text-[var(--primary)] font-medium hover:underline">
                        <Camera className="w-3.5 h-3.5" />
                        上传自定义头像
                      </button>
                      {(avatarPreview || selectedAvatarKey) && (
                        <button type="button" onClick={() => { setAvatarPreview(null); setSelectedAvatarKey(null); setAvatarDataUrl(''); }}
                          className="flex items-center gap-1 text-[12px] text-[var(--text-muted)] hover:text-red-500">
                          <X className="w-3 h-3" /> 移除
                        </button>
                      )}
                    </div>
                    <input id="avatar-input" type="file" accept="image/*" onChange={e => e.target.files?.[0] && handleAvatarChange(e.target.files[0])} className="hidden" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-medium mb-1.5 text-[var(--text-secondary)]">昵称</label>
                <input value={editNickname} onChange={e => setEditNickname(e.target.value)} type="text" placeholder="设置一个显示名称"
                  className="w-full border border-[var(--border)] rounded-lg px-3.5 py-2.5 text-[13px] text-[var(--text-primary)] outline-none bg-white placeholder:text-[var(--text-muted)] transition-all focus:border-[var(--primary)] focus:ring-2 focus:ring-blue-50" />
              </div>
              <div>
                <label className="block text-[13px] font-medium mb-1.5 text-[var(--text-secondary)]">部门</label>
                <input value={editDepartment} onChange={e => setEditDepartment(e.target.value)} type="text" placeholder="填写所在部门"
                  className="w-full border border-[var(--border)] rounded-lg px-3.5 py-2.5 text-[13px] text-[var(--text-primary)] outline-none bg-white placeholder:text-[var(--text-muted)] transition-all focus:border-[var(--primary)] focus:ring-2 focus:ring-blue-50" />
              </div>


              <button onClick={saveProfile} disabled={saving}
                className="bg-[var(--primary)] text-white px-5 py-2.5 rounded-lg text-[13px] font-medium hover:bg-[var(--primary-dark)] transition-colors disabled:opacity-50 w-fit">
                {saving ? '保存中...' : '保存'}
              </button>
            </div>

              {/* Change Password */}
              <div className="surface-card rounded-[10px] p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">修改密码</h2>
                <button onClick={() => setShowPwdForm(!showPwdForm)}
                  className="flex items-center gap-1.5 text-[13px] text-[var(--primary)] font-medium hover:underline">
                  <KeyRound className="w-3.5 h-3.5" />
                  {showPwdForm ? '收起' : '修改密码'}
                </button>
              </div>
              {showPwdForm && (
                <>
                  {pwdMsg && <p className="text-[13px] p-3 rounded-lg bg-green-50 text-green-700">{pwdMsg}</p>}
                  <div className="flex flex-col gap-3">
                    <div>
                      <label className="block text-[13px] font-medium mb-1.5 text-[var(--text-secondary)]">旧密码</label>
                      <input value={oldPwd} onChange={e => setOldPwd(e.target.value)} type="password" placeholder="输入当前密码"
                        className="w-full border border-[var(--border)] rounded-lg px-3.5 py-2.5 text-[13px] text-[var(--text-primary)] outline-none bg-white placeholder:text-[var(--text-muted)] transition-all focus:border-[var(--primary)] focus:ring-2 focus:ring-blue-50" />
                    </div>
                    <div>
                      <label className="block text-[13px] font-medium mb-1.5 text-[var(--text-secondary)]">新密码</label>
                      <input value={newPwd} onChange={e => setNewPwd(e.target.value)} type="password" placeholder="至少6位"
                        className="w-full border border-[var(--border)] rounded-lg px-3.5 py-2.5 text-[13px] text-[var(--text-primary)] outline-none bg-white placeholder:text-[var(--text-muted)] transition-all focus:border-[var(--primary)] focus:ring-2 focus:ring-blue-50" />
                    </div>
                    <div>
                      <label className="block text-[13px] font-medium mb-1.5 text-[var(--text-secondary)]">确认新密码</label>
                      <input value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} type="password" placeholder="再次输入新密码"
                        className="w-full border border-[var(--border)] rounded-lg px-3.5 py-2.5 text-[13px] text-[var(--text-primary)] outline-none bg-white placeholder:text-[var(--text-muted)] transition-all focus:border-[var(--primary)] focus:ring-2 focus:ring-blue-50" />
                    </div>
                  </div>
                  <button onClick={changePassword} disabled={pwdSaving}
                    className="bg-[var(--primary)] text-white px-5 py-2.5 rounded-lg text-[13px] font-medium hover:bg-[var(--primary-dark)] transition-colors disabled:opacity-50 w-fit">
                    {pwdSaving ? '提交中...' : '确认修改'}
                  </button>
                </>
              )}
              </div>
            </div>

            {/* API Tokens */}
            <div className="surface-card rounded-[10px] p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">API 令牌</h2>
                <button onClick={() => setShowCreate(true)} className="bg-[var(--primary)] text-white px-4 py-2 rounded-lg text-[13px] font-medium hover:bg-[var(--primary-dark)] transition-colors">+ 创建令牌</button>
              </div>
              {showCreate && (
                <div className="border border-[var(--border)] rounded-lg p-4 mb-4 bg-[var(--bg-page)]">
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-2">
                      <input value={newTokenName} onChange={e => setNewTokenName(e.target.value)} type="text" placeholder="令牌名称"
                        className="flex-1 bg-white border border-[var(--border)] rounded-lg px-3.5 py-2 text-[13px] outline-none" />
                      <select id="token-expiry" defaultValue="30"
                        className="bg-white border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] outline-none text-[var(--text-secondary)]">
                        <option value="30">30 天</option>
                        <option value="90">90 天</option>
                        <option value="365">1 年</option>
                        <option value="">永不过期</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => {
                        const expiryEl = document.getElementById('token-expiry') as HTMLSelectElement;
                        const days = expiryEl?.value ? parseInt(expiryEl.value) : undefined;
                        createToken(days);
                      }} disabled={creating || !newTokenName} className="bg-[var(--primary)] text-white px-4 py-2 rounded-lg text-[13px] font-medium disabled:opacity-50">{creating ? '创建中...' : '创建'}</button>
                      <button onClick={() => { setShowCreate(false); setNewTokenName(''); }} className="bg-white border border-[var(--border)] text-[13px] px-3 py-2 rounded-lg text-[var(--text-secondary)]">取消</button>
                    </div>
                  </div>
                </div>
              )}
              {createdToken && (
                <div className="border border-green-200 bg-green-50 rounded-lg p-4 mb-4">
                  <p className="text-[13px] font-medium text-green-800 mb-1">令牌创建成功</p>
                  <p className="text-[11px] text-green-600 mb-2">请立即复制，之后将无法再次查看</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-[13px] font-mono break-all select-all">{createdToken}</code>
                    <button onClick={() => { navigator.clipboard.writeText(createdToken); }} className="bg-green-600 text-white px-3 py-2 rounded-lg text-[12px] font-medium">复制</button>
                  </div>
                </div>
              )}
              {tokens.length > 0 ? (
                <table className="w-full text-[13px]">
                  <thead><tr className="border-b border-[var(--border)]">
                    <th className="text-left px-4 py-3 font-medium text-[11px] text-[var(--text-muted)]">令牌名称</th>
                    <th className="text-left px-4 py-3 font-medium text-[11px] text-[var(--text-muted)]">前缀</th>
                    <th className="text-left px-4 py-3 font-medium text-[11px] text-[var(--text-muted)]">过期时间</th>
                    <th className="text-left px-4 py-3 font-medium text-[11px] text-[var(--text-muted)]">创建时间</th>
                    <th className="text-left px-4 py-3 font-medium text-[11px] text-[var(--text-muted)]">操作</th>
                  </tr></thead>
                  <tbody>
                    {tokens.map(t => (
                      <tr key={t.id} className="border-b border-[var(--border)] last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{t.name}</td>
                        <td className="px-4 py-3 font-mono text-[11px] text-[var(--text-muted)]">{t.token_prefix}</td>
                        <td className="px-4 py-3 text-[11px] text-[var(--text-muted)]">{t.expires_at ? formatDate(t.expires_at) : '永不过期'}</td>
                        <td className="px-4 py-3 text-[11px] text-[var(--text-muted)]">{formatDate(t.created_at)}</td>
                        <td className="px-4 py-3"><button onClick={() => setPendingRevoke(t.id)} className="text-red-600 hover:text-red-800 text-[12px]">撤销</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="text-[13px] text-[var(--text-muted)] py-4">暂无 API 令牌</p>}
            </div>

            {/* Local Skills */}
            <div className="surface-card rounded-[10px] p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">本地技能</h2>
                  <span className="text-[11px] bg-blue-50 text-[var(--primary)] px-2 py-0.5 rounded-md font-medium">
                    {selectedDevice === 'all' ? localSkills.length : localSkills.filter(s => s.device_id === selectedDevice).length} 项
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {devices.length > 0 && (
                    <div className="relative">
                      <select value={selectedDevice} onChange={e => setSelectedDevice(e.target.value)}
                        className="appearance-none bg-white border border-[var(--border)] rounded-lg pl-3 pr-8 py-1.5 text-[12px] text-[var(--text-secondary)] outline-none cursor-pointer">
                        <option value="all">全部设备</option>
                        {devices.map(d => (
                          <option key={d.device_id} value={d.device_id}>
                            {d.device_name || d.device_id.slice(0, 8)}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" />
                    </div>
                  )}
                  <button onClick={loadLocalSkills} disabled={localLoading}
                    className="flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors disabled:opacity-50">
                    <RefreshCw className={`w-3.5 h-3.5 ${localLoading ? 'animate-spin' : ''}`} />
                    刷新
                  </button>
                  <button onClick={() => setShowScanHint(true)}
                    className="bg-[var(--primary)] text-white px-4 py-2 rounded-lg text-[13px] font-medium hover:bg-[var(--primary-dark)] transition-colors">
                    扫描本地 Skill
                  </button>
                </div>
              </div>

              {localSkills.length > 0 ? (
                <table className="w-full text-[13px]">
                  <thead><tr className="border-b border-[var(--border)]">
                    <th className="text-left px-4 py-3 font-medium text-[11px] text-[var(--text-muted)]">技能名称</th>
                    <th className="text-left px-4 py-3 font-medium text-[11px] text-[var(--text-muted)]">Slug</th>
                    <th className="text-left px-4 py-3 font-medium text-[11px] text-[var(--text-muted)]">目标 Agent</th>
                    <th className="text-left px-4 py-3 font-medium text-[11px] text-[var(--text-muted)]">文件数</th>
                    <th className="text-left px-4 py-3 font-medium text-[11px] text-[var(--text-muted)]">大小</th>
                    <th className="text-left px-4 py-3 font-medium text-[11px] text-[var(--text-muted)]">标识</th>
                  </tr></thead>
                  <tbody>
                    {localSkills
                      .filter(s => selectedDevice === 'all' || s.device_id === selectedDevice)
                      .map(s => (
                      <tr key={s.id} className="border-b border-[var(--border)] last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{s.skill_name}</td>
                        <td className="px-4 py-3 text-[12px] text-[var(--text-muted)] font-mono">{s.skill_slug}</td>
                        <td className="px-4 py-3 text-[12px] text-[var(--text-secondary)]">{s.agent_target || '-'}</td>
                        <td className="px-4 py-3 text-[12px] text-[var(--text-secondary)]">{s.file_count}</td>
                        <td className="px-4 py-3 text-[12px] text-[var(--text-secondary)]">
                          {s.total_size < 1024 ? `${s.total_size}B`
                            : s.total_size < 1024 * 1024 ? `${(s.total_size / 1024).toFixed(1)}KB`
                            : `${(s.total_size / (1024 * 1024)).toFixed(1)}MB`}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {s.has_skill_md && <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded">MD</span>}
                            {s.has_skill_yaml && <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">YAML</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-8 text-center">
                  <MonitorSmartphone className="w-10 h-10 mx-auto text-[var(--text-muted)] mb-3" />
                  <p className="text-[13px] text-[var(--text-muted)]">尚未扫描本地技能</p>
                  <p className="text-[12px] text-[var(--text-muted)] mt-1">点击"扫描本地 Skill"开始</p>
                </div>
              )}
            </div>

            {/* Scan Hint Modal */}
            {showScanHint && (
              <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowScanHint(false)}>
                <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">扫描本地 Skill</h3>
                    <button onClick={() => setShowScanHint(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[13px] text-[var(--text-secondary)] mb-4">
                    在终端中运行以下命令扫描并上传本地技能信息：
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] mb-3">
                    扫描限制：每个 Skill 最多扫描 100 个文件、10 MB，目录深度 2 层
                  </p>
                  <div className="bg-gray-900 rounded-lg p-4 mb-4">
                    <code className="text-[13px] text-green-400 font-mono">snh scan --upload</code>
                  </div>
                  <div className="flex items-center gap-2 mb-4">
                    <button onClick={() => { navigator.clipboard.writeText('snh scan --upload'); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                      className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-[13px] px-3 py-2 rounded-lg text-[var(--text-secondary)] transition-colors">
                      <Copy className="w-3.5 h-3.5" />
                      {copied ? '已复制' : '复制命令'}
                    </button>
                  </div>
                  <div className="border-t border-[var(--border)] pt-4">
                    <p className="text-[12px] text-[var(--text-muted)] mb-3">执行完成后点击下方按钮刷新结果</p>
                    <div className="flex gap-2">
                      <button onClick={() => { setShowScanHint(false); loadLocalSkills(); }}
                        className="bg-[var(--primary)] text-white px-4 py-2 rounded-lg text-[13px] font-medium hover:bg-[var(--primary-dark)] transition-colors">
                        <Check className="w-3.5 h-3.5 inline mr-1" />
                        已扫描完成
                      </button>
                      <button onClick={() => setShowScanHint(false)}
                        className="bg-white border border-[var(--border)] text-[13px] px-3 py-2 rounded-lg text-[var(--text-secondary)]">
                        关闭
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={pendingRevoke !== null}
        title="确认撤销"
        message="撤销后使用该 Token 的请求将失败，此操作不可恢复。"
        danger
        confirmText="撤销"
        onConfirm={() => { if (pendingRevoke) { revokeToken(pendingRevoke); setPendingRevoke(null); } }}
        onCancel={() => setPendingRevoke(null)}
      />
      <AlertDialog
        open={!!profileError}
        title="操作失败"
        message={profileError}
        icon="warning"
        onClose={() => setProfileError('')}
      />
      <AlertDialog
        open={!!pwdError}
        title="操作失败"
        message={pwdError}
        icon="warning"
        onClose={() => setPwdError('')}
      />
    </div>
  );
}
