'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Boxes, Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react';
import AuthShowcase from '@/components/AuthShowcase';
import AlertDialog from '@/components/AlertDialog';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';

type FieldErrors = {
  username?: string;
  nickname?: string;
  employee_id?: string;
  password?: string;
  confirmPassword?: string;
};

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [department, setDepartment] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const auth = useAuth();
  const router = useRouter();

  function validate() {
    const nextErrors: FieldErrors = {};
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
      nextErrors.username = '用户名需 3-32 位字母、数字或下划线';
    }
    if (nickname.length > 32) nextErrors.nickname = '昵称不能超过 32 个字符';
    if (password.length < 8) nextErrors.password = '密码至少 8 位';
    else if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) nextErrors.password = '密码需同时包含字母和数字';
    if (!confirmPassword) nextErrors.confirmPassword = '请再次输入密码';
    else if (password !== confirmPassword) nextErrors.confirmPassword = '两次输入的密码不一致';

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const btn = (e.target as HTMLElement).querySelector('button[type="submit"]');
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'ripple-ring';
      const size = Math.max(rect.width, rect.height);
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (rect.width / 2 - size / 2) + 'px';
      ripple.style.top = (rect.height / 2 - size / 2) + 'px';
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    }
    setError('');
    if (!validate()) return;

    setLoading(true);
    try {
      await api.post('/auth/register', {
        username: username.trim(),
        password,
        nickname: nickname.trim() || undefined,
        employee_id: employeeId.trim() || undefined,
        department: department.trim() || undefined,
      });
      await auth.login(username.trim(), password);
      const redirectPath = localStorage.getItem('redirect_after_login');
      if (redirectPath) {
        localStorage.removeItem('redirect_after_login');
        router.push(redirectPath);
      } else {
        router.push('/');
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || '注册失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  function clearFieldError(field: keyof FieldErrors) {
    if (fieldErrors[field]) setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function getPwdStrength() {
    if (!password) return { level: 0, label: '未输入', color: 'var(--text-muted)' };
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;
    if (score <= 2) return { level: 1, label: '强度较弱', color: '#EF4444' };
    if (score <= 4) return { level: 2, label: '强度适中', color: '#F59E0B' };
    return { level: 3, label: '强度较高', color: '#10B981' };
  }

  const strength = getPwdStrength();

  return (
    <div className="auth-canvas min-h-screen p-4 sm:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-32px)] max-w-[1180px] grid-cols-1 gap-5 lg:grid-cols-[520px_1fr]">
        <AuthShowcase mode="register" />

        <main className="flex items-center justify-center px-2 py-8 sm:px-6">
          <div className="w-full max-w-[470px]">
            <div className="mb-10 flex items-center gap-2.5 lg:hidden">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
                <Boxes className="h-5 w-5 text-[var(--primary)]" />
              </div>
              <span className="text-[15px] font-semibold text-[var(--text-primary)]">Skill Nexus Hub</span>
            </div>

            <div className="surface-card rounded-xl p-6 sm:p-7">
              <div className="mb-6">
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">Create account</p>
                <h2 className="mt-2 text-[26px] font-bold tracking-tight text-[var(--text-primary)]">创建账号</h2>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-muted)]">
                  申请内部技能平台账号，用于浏览、安装和协作。
                </p>
              </div>

              <AlertDialog
                open={!!error}
                title="操作失败"
                message={error}
                icon="warning"
                onClose={() => setError('')}
              />

              <form onSubmit={handleSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="form-stagger sm:col-span-2" style={{ animationDelay: '0.3s' }}>
                  <label className="mb-1.5 block text-[13px] font-medium text-[var(--text-primary)]" htmlFor="username">用户名</label>
                  <div className="relative">
                    <UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                      id="username"
                      value={username}
                      onChange={(e) => { setUsername(e.target.value); clearFieldError('username'); }}
                      type="text"
                      placeholder="登录账号，注册后不可修改"
                      aria-invalid={Boolean(fieldErrors.username)}
                      aria-describedby={fieldErrors.username ? 'username-error' : 'username-help'}
                      className={`w-full rounded-lg border bg-[var(--bg-page)] px-9 py-2.5 text-[13px] text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:bg-white focus:ring-2 focus:ring-blue-50 ${fieldErrors.username ? 'border-red-300 bg-red-50/40' : 'border-[var(--border)]'}`}
                    />
                  </div>
                  {fieldErrors.username ? (
                    <p id="username-error" className="mt-1.5 text-[12px] text-red-600">{fieldErrors.username}</p>
                  ) : (
                    <p id="username-help" className="mt-1.5 text-[11px] text-[var(--text-muted)]">3-32 位，仅含字母、数字和下划线</p>
                  )}
                </div>

                <div className="form-stagger" style={{ animationDelay: '0.4s' }}>
                  <label className="mb-1.5 block text-[13px] font-medium text-[var(--text-primary)]" htmlFor="nickname">昵称</label>
                  <input
                    id="nickname"
                    value={nickname}
                    onChange={(e) => { setNickname(e.target.value); clearFieldError('nickname'); }}
                    type="text"
                    placeholder="显示名称"
                    aria-invalid={Boolean(fieldErrors.nickname)}
                    aria-describedby={fieldErrors.nickname ? 'nickname-error' : undefined}
                    className={`w-full rounded-lg border bg-[var(--bg-page)] px-3.5 py-2.5 text-[13px] text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:bg-white focus:ring-2 focus:ring-blue-50 ${fieldErrors.nickname ? 'border-red-300 bg-red-50/40' : 'border-[var(--border)]'}`}
                  />
                  {fieldErrors.nickname && <p id="nickname-error" className="mt-1.5 text-[12px] text-red-600">{fieldErrors.nickname}</p>}
                </div>

                <div className="form-stagger" style={{ animationDelay: '0.5s' }}>
                  <label className="mb-1.5 block text-[13px] font-medium text-[var(--text-primary)]" htmlFor="employee_id">工号</label>
                  <input
                    id="employee_id"
                    value={employeeId}
                    onChange={(e) => { setEmployeeId(e.target.value); clearFieldError('employee_id'); }}
                    type="text"
                    placeholder="选填"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-page)] px-3.5 py-2.5 text-[13px] text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:bg-white focus:ring-2 focus:ring-blue-50"
                  />
                </div>

                <div className="form-stagger sm:col-span-2" style={{ animationDelay: '0.6s' }}>
                  <label className="mb-1.5 block text-[13px] font-medium text-[var(--text-primary)]" htmlFor="department">部门</label>
                  <input
                    id="department"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    type="text"
                    placeholder="选填，建议填写所在部门"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-page)] px-3.5 py-2.5 text-[13px] text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:bg-white focus:ring-2 focus:ring-blue-50"
                  />
                </div>

                <div className="form-stagger sm:col-span-2" style={{ animationDelay: '0.7s' }}>
                  <label className="mb-1.5 block text-[13px] font-medium text-[var(--text-primary)]" htmlFor="password">密码</label>
                  <div className="relative">
                    <LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                      id="password"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); clearFieldError('password'); }}
                      type={showPwd ? 'text' : 'password'}
                      placeholder="请输入密码"
                      aria-invalid={Boolean(fieldErrors.password)}
                      aria-describedby={fieldErrors.password ? 'password-error' : 'password-strength'}
                      className={`w-full rounded-lg border bg-[var(--bg-page)] px-9 py-2.5 pr-11 text-[13px] text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:bg-white focus:ring-2 focus:ring-blue-50 ${fieldErrors.password ? 'border-red-300 bg-red-50/40' : 'border-[var(--border)]'}`}
                    />
                    <button
                      type="button"
                      aria-label={showPwd ? '隐藏密码' : '显示密码'}
                      onClick={() => setShowPwd(!showPwd)}
                      className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-white hover:text-[var(--text-secondary)]"
                    >
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {fieldErrors.password ? (
                    <p id="password-error" className="mt-1.5 text-[12px] text-red-600">{fieldErrors.password}</p>
                  ) : (
                    <div id="password-strength" className="mt-2 flex items-center gap-2">
                      <div className="flex flex-1 gap-1">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="h-1 flex-1 rounded-full transition-colors" style={{ backgroundColor: i <= strength.level ? strength.color : 'var(--border)' }} />
                        ))}
                      </div>
                      <span className="text-[11px] font-medium" style={{ color: strength.color }}>{strength.label}</span>
                    </div>
                  )}
                </div>

                <div className="form-stagger sm:col-span-2" style={{ animationDelay: '0.8s' }}>
                  <label className="mb-1.5 block text-[13px] font-medium text-[var(--text-primary)]" htmlFor="confirmPassword">确认密码</label>
                  <div className="relative">
                    <LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                      id="confirmPassword"
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); clearFieldError('confirmPassword'); }}
                      type={showConfirmPwd ? 'text' : 'password'}
                      placeholder="再次输入密码"
                      aria-invalid={Boolean(fieldErrors.confirmPassword)}
                      aria-describedby={fieldErrors.confirmPassword ? 'confirm-password-error' : undefined}
                      className={`w-full rounded-lg border bg-[var(--bg-page)] px-9 py-2.5 pr-11 text-[13px] text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:bg-white focus:ring-2 focus:ring-blue-50 ${fieldErrors.confirmPassword ? 'border-red-300 bg-red-50/40' : 'border-[var(--border)]'}`}
                    />
                    <button
                      type="button"
                      aria-label={showConfirmPwd ? '隐藏确认密码' : '显示确认密码'}
                      onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                      className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-white hover:text-[var(--text-secondary)]"
                    >
                      {showConfirmPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {fieldErrors.confirmPassword && <p id="confirm-password-error" className="mt-1.5 text-[12px] text-red-600">{fieldErrors.confirmPassword}</p>}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-ripple mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--primary)] py-2.5 text-[13px] font-semibold text-white transition-all hover:bg-[var(--primary-dark)] hover:shadow-[var(--shadow-soft)] disabled:opacity-50 sm:col-span-2"
                >
                  {loading ? '注册中...' : <>注册 <ArrowRight className="h-3.5 w-3.5" /></>}
                </button>
              </form>

              <p className="mt-6 text-center text-[13px] text-[var(--text-muted)]">
                已有账号？<Link href="/login" className="font-semibold text-[var(--primary)]">登录</Link>
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
