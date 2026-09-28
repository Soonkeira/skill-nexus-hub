'use client';

import { useEffect, useRef } from 'react';
import { Boxes, CheckCircle2, Code2, GitBranch, ShieldCheck, Terminal } from 'lucide-react';

type AuthShowcaseProps = {
  mode: 'login' | 'register';
};

const LOGIN_COMMANDS = [
  '$ snh login --server skillhub.internal',
  '$ snh search code-review',
  '$ snh install code-review --target codex',
];

const FEATURE_ROWS = [
  { icon: ShieldCheck, label: '管理员审核发布', tone: 'text-emerald-300' },
  { icon: GitBranch, label: '版本留痕与回滚', tone: 'text-blue-300' },
  { icon: Code2, label: 'Web + CLI 一套入口', tone: 'text-violet-300' },
];

export default function AuthShowcase({ mode }: AuthShowcaseProps) {
  const isRegister = mode === 'register';
  const particlesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = particlesRef.current;
    if (!container) return;
    const colors = ['rgba(96,165,250,0.5)', 'rgba(147,197,253,0.3)', 'rgba(110,231,183,0.3)', 'rgba(196,181,253,0.3)'];
    for (let i = 0; i < 18; i++) {
      const p = document.createElement('div');
      const size = 2 + Math.random() * 3;
      p.style.cssText = `position:absolute;border-radius:50%;pointer-events:none;opacity:0;width:${size}px;height:${size}px;left:${Math.random() * 100}%;bottom:${-10 - Math.random() * 20}%;background:${colors[i % colors.length]};animation:particle-float ${8 + Math.random() * 12}s linear infinite;animation-delay:${Math.random() * 10}s;`;
      container.appendChild(p);
    }
    return () => { container.innerHTML = ''; };
  }, []);

  return (
    <section className="auth-showcase relative hidden min-h-[calc(100vh-48px)] overflow-hidden rounded-2xl p-8 text-white lg:flex lg:flex-col lg:justify-between">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:34px_34px] opacity-35" style={{ animation: 'grid-pulse 8s ease-in-out infinite' }} />
      <div ref={particlesRef} className="absolute inset-0 overflow-hidden pointer-events-none" />
      <div className="relative flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/10">
          <Boxes className="h-5 w-5 text-blue-200" />
        </div>
        <div>
          <p className="text-[15px] font-semibold leading-tight">Skill Nexus Hub</p>
          <p className="text-[11px] text-white/55">Agent Skill Ops</p>
        </div>
      </div>

      <div className="relative flex flex-col gap-6">
        <div className="slide-in-left" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
          <div className="mb-4 inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/10 px-2.5 py-1 text-[12px] font-medium text-white/82">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
            {isRegister ? '加入团队技能目录' : '受控发布 · 即刻安装'}
          </div>
          <h1 className="max-w-[390px] text-[36px] font-bold leading-[1.1] tracking-tight">
            {isRegister ? '申请内部技能平台账号' : '内部 Agent Skill 管理平台'}
          </h1>
          <p className="mt-4 max-w-[410px] text-[14px] leading-relaxed text-slate-200/82">
            {isRegister
              ? '注册后可以浏览团队 Skill、使用 CLI 安装，并在获得管理员授权后参与发布与维护。'
              : '统一管理团队沉淀的 AI 编程技能，让 Claude Code、Codex、Cursor 等工具复用同一套可信 Skill 源。'}
          </p>
        </div>

        <div className="slide-in-left grid gap-3" style={{ animationDelay: '0.4s', animationFillMode: 'both' }}>
          {FEATURE_ROWS.map((row) => {
            const Icon = row.icon;
            return (
              <div key={row.label} className="workflow-card flex items-center gap-3 rounded-lg px-4 py-3">
                <Icon className={`h-4 w-4 ${row.tone}`} />
                <span className="text-[13px] text-slate-100">{row.label}</span>
              </div>
            );
          })}
        </div>

        <div className="slide-in-left workflow-card rounded-xl p-4" style={{ animationDelay: '0.6s', animationFillMode: 'both' }}>
          <div className="mb-3 flex items-center gap-2 text-slate-300">
            <Terminal className="h-4 w-4" />
            <span className="text-[11px] uppercase tracking-[0.16em]">CLI workflow</span>
          </div>
          <div className="space-y-2 font-mono text-[12px] text-slate-100">
            {LOGIN_COMMANDS.map((command, i) => (
              <div key={command} className={i === LOGIN_COMMANDS.length - 1 ? 'cursor-blink' : undefined}>{command}</div>
            ))}
          </div>
        </div>
      </div>

      <p className="relative text-[11px] text-white/42">&copy; 2026 Skill Nexus Hub</p>
    </section>
  );
}
