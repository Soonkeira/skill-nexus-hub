'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Boxes, Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react';
import AuthShowcase from '@/components/AuthShowcase';
import AlertDialog from '@/components/AlertDialog';
import SliderCaptcha from '@/components/SliderCaptcha';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';

type FieldErrors = {
  username?: string;
  password?: string;
};

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaId, setCaptchaId] = useState<string | null>(null);
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.isLoggedIn && auth.user) router.push('/');
  }, [auth.isLoggedIn, auth.user, router]);

  useEffect(() => {
    api.get('/auth/captcha').then(({ data }) => {
      setCaptchaRequired(data.captcha_required);
    }).catch(() => {});
  }, []);

  function validate() {
    const nextErrors: FieldErrors = {};
    if (!username.trim()) nextErrors.username = '请输入用户名';
    if (!password) nextErrors.password = '请输入密码';
    if (captchaRequired && !captchaId) {
      setError('请先完成人机验证');
      return false;
    }
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
      await auth.login(username.trim(), password, captchaId || undefined);
      const redirectPath = localStorage.getItem('redirect_after_login');
      if (redirectPath) {
        localStorage.removeItem('redirect_after_login');
        router.push(redirectPath);
      } else {
        router.push('/');
      }
    } catch (err: any) {
      const detail = err.response?.data?.detail || '登录失败，请确认账号和密码';
      setError(detail);
      if (err.response?.status === 400 && detail.includes('人机验证')) {
        setCaptchaRequired(true);
        setCaptchaId(null);
      } else {
        setCaptchaRequired(true);
        setCaptchaId(null);
      }
    } finally {
      setLoading(false);
    }
  }

  function updateUsername(value: string) {
    setUsername(value);
    if (fieldErrors.username) setFieldErrors((prev) => ({ ...prev, username: undefined }));
  }

  function updatePassword(value: string) {
    setPassword(value);
    if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
  }

  return (
    <div className="auth-canvas min-h-screen p-4 sm:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-32px)] max-w-[1180px] grid-cols-1 gap-5 lg:grid-cols-[520px_1fr]">
        <AuthShowcase mode="login" />

        <main aria-label="内部 Agent Skill 管理平台登录" className="flex items-center justify-center px-2 py-8 sm:px-6">
          <div className="w-full max-w-[430px]">
            <div className="mb-10 flex items-center gap-2.5 lg:hidden">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
                <Boxes className="h-5 w-5 text-[var(--primary)]" />
              </div>
              <span className="text-[15px] font-semibold text-[var(--text-primary)]">Skill Nexus Hub</span>
            </div>

            <div className="surface-card rounded-xl p-6 sm:p-7">
              <div className="mb-6">
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">Sign in</p>
                <h2 className="mt-2 text-[26px] font-bold tracking-tight text-[var(--text-primary)]">欢迎回来</h2>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-muted)]">
                  登录后继续管理团队 Skill、查看审核状态和安装入口。
                </p>
              </div>

              <AlertDialog
                open={!!error}
                title="操作失败"
                message={error}
                icon="warning"
                onClose={() => setError('')}
              />

              <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
                <div className="form-stagger" style={{ animationDelay: '0.3s' }}>
                  <label className="mb-1.5 block text-[13px] font-medium text-[var(--text-primary)]" htmlFor="username">用户名</label>
                  <div className="relative">
                    <UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                      id="username"
                      value={username}
                      onChange={(e) => updateUsername(e.target.value)}
                      type="text"
                      placeholder="请输入用户名"
                      aria-invalid={Boolean(fieldErrors.username)}
                      aria-describedby={fieldErrors.username ? 'username-error' : undefined}
                      className={`focus-ring w-full rounded-lg border bg-[var(--bg-page)] px-9 py-2.5 text-[13px] text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:bg-white focus:ring-2 focus:ring-blue-50 ${fieldErrors.username ? 'border-red-300 bg-red-50/40' : 'border-[var(--border)]'}`}
                    />
                  </div>
                  {fieldErrors.username && <p id="username-error" className="mt-1.5 text-[12px] text-red-600">{fieldErrors.username}</p>}
                </div>

                <div className="form-stagger" style={{ animationDelay: '0.4s' }}>
                  <label className="mb-1.5 block text-[13px] font-medium text-[var(--text-primary)]" htmlFor="password">密码</label>
                  <div className="relative">
                    <LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                      id="password"
                      value={password}
                      onChange={(e) => updatePassword(e.target.value)}
                      type={showPwd ? 'text' : 'password'}
                      placeholder="请输入密码"
                      aria-invalid={Boolean(fieldErrors.password)}
                      aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                      className={`focus-ring w-full rounded-lg border bg-[var(--bg-page)] px-9 py-2.5 pr-11 text-[13px] text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:bg-white focus:ring-2 focus:ring-blue-50 ${fieldErrors.password ? 'border-red-300 bg-red-50/40' : 'border-[var(--border)]'}`}
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
                  {fieldErrors.password && <p id="password-error" className="mt-1.5 text-[12px] text-red-600">{fieldErrors.password}</p>}
                </div>

                {captchaRequired && (
                  <div className="form-stagger" style={{ animationDelay: '0.5s' }}>
                    <label className="mb-1.5 block text-[13px] font-medium text-[var(--text-primary)]">人机验证</label>
                    <SliderCaptcha
                      onVerified={(id) => setCaptchaId(id)}
                      onError={() => setCaptchaId(null)}
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-press btn-ripple mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--primary)] py-2.5 text-[13px] font-semibold text-white transition-all hover:bg-[var(--primary-dark)] hover:shadow-[var(--shadow-soft)] disabled:opacity-50"
                >
                  {loading ? '登录中...' : <>登录 <ArrowRight className="h-3.5 w-3.5" /></>}
                </button>
              </form>

              <p className="mt-6 text-center text-[13px] text-[var(--text-muted)]">
                还没有账号？<Link href="/register" className="font-semibold text-[var(--primary)]">申请注册</Link>
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
