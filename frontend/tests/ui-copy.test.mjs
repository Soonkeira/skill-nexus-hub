import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const filesToScan = [
  'src/app/layout.tsx',
  'src/app/login/page.tsx',
  'src/app/register/page.tsx',
  'src/app/page.tsx',
  'src/app/market/page.tsx',
  'src/app/skill/[owner]/[slug]/page.tsx',
  'src/components/Sidebar.tsx',
  'src/components/TopBar.tsx',
];

const mojibakeMarkers = [
  '鍙戠幇',
  '鎶€鑳',
  '鐧诲綍',
  '娉ㄥ唽',
  '鐢ㄦ埛',
  '瀵嗙爜',
  '棣栭〉',
  '涓嬭浇',
  '绠＄悊',
  '鉁',
  '鉅',
  '鈿',
  '馃',
];

test('core UI source does not contain mojibake markers', () => {
  const offenders = [];

  for (const file of filesToScan) {
    const content = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    for (const marker of mojibakeMarkers) {
      if (content.includes(marker)) offenders.push(`${file}: ${marker}`);
    }
  }

  assert.deepEqual(offenders, []);
});

test('password visibility buttons have accessible Chinese labels', () => {
  const login = readFileSync(new URL('../src/app/login/page.tsx', import.meta.url), 'utf8');
  const register = readFileSync(new URL('../src/app/register/page.tsx', import.meta.url), 'utf8');

  assert.match(login, /aria-label=\{showPwd \? '隐藏密码' : '显示密码'\}/);
  assert.match(register, /aria-label=\{showPwd \? '隐藏密码' : '显示密码'\}/);
  assert.match(register, /aria-label=\{showConfirmPwd \? '隐藏确认密码' : '显示确认密码'\}/);
});

test('auth pages use internal-platform copy and custom validation', () => {
  const login = readFileSync(new URL('../src/app/login/page.tsx', import.meta.url), 'utf8');
  const register = readFileSync(new URL('../src/app/register/page.tsx', import.meta.url), 'utf8');

  assert.match(login, /内部 Agent Skill 管理平台/);
  assert.match(register, /申请内部技能平台账号/);
  assert.doesNotMatch(login, /\srequired(?:\s|>)/);
  assert.doesNotMatch(register, /\srequired(?:\s|>)/);
  assert.match(login, /aria-invalid=\{Boolean\(fieldErrors\.username\)\}/);
  assert.match(register, /aria-invalid=\{Boolean\(fieldErrors\.username\)\}/);
});

test('logged-in pages use internal workspace copy and useful empty states', () => {
  const home = readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8');
  const market = readFileSync(new URL('../src/app/market/page.tsx', import.meta.url), 'utf8');
  const pending = readFileSync(new URL('../src/app/pending/page.tsx', import.meta.url), 'utf8');
  const stats = readFileSync(new URL('../src/app/stats/page.tsx', import.meta.url), 'utf8');
  const publish = readFileSync(new URL('../src/app/publish/page.tsx', import.meta.url), 'utf8');
  const profile = readFileSync(new URL('../src/app/profile/page.tsx', import.meta.url), 'utf8');

  assert.match(home, /Skill 工作台/);
  assert.doesNotMatch(home, /内部 Skill 工作台/);
  assert.match(home, /发布第一个 Skill/);
  assert.match(market, /还没有可安装的 Skill/);
  assert.match(pending, /等待提交审核的版本会显示在这里/);
  assert.match(stats, /统计数据来自技能下载、版本和用户活动/);
  assert.match(publish, /基础信息会用于市场展示和 CLI 搜索/);
  assert.match(profile, /选择一个简洁头像/);
});

test('home page exposes operational discovery sections', () => {
  const home = readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8');

  assert.match(home, /精选 Skill/);
  assert.match(home, /本周热门/);
  assert.match(home, /新发布/);
  assert.match(home, /高下载/);
  assert.match(home, /部门推荐/);
  assert.match(home, /sort:\s*'downloads'/);
  assert.match(home, /sort:\s*'weekly_downloads'/);
});

test('home hero and app background are light-theme adaptive', () => {
  const home = readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8');
  const globals = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');

  assert.match(globals, /\.mesh-hero[\s\S]*var\(--bg-card\)/);
  assert.match(globals, /\[data-theme="dark"\] \.mesh-hero/);
  assert.doesNotMatch(globals, /\.mesh-hero \{[\s\S]{0,120}background:\s*#0F172A/);
  assert.doesNotMatch(home, /<h1 className="[^"]*text-white/);
  assert.match(home, /text-\[var\(--text-primary\)\]/);
});

test('next proxy allows large skill package uploads', () => {
  const config = readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8');

  assert.match(config, /proxyClientMaxBodySize:\s*['"]80mb['"]/);
});

test('pending workflow is visible to users but approval controls are admin-only', () => {
  const sidebar = readFileSync(new URL('../src/components/Sidebar.tsx', import.meta.url), 'utf8');
  const pending = readFileSync(new URL('../src/app/pending/page.tsx', import.meta.url), 'utf8');

  assert.match(sidebar, /label: '待审批'/);
  assert.doesNotMatch(sidebar, /auth\.isAdmin \|\| auth\.isPublisher[\s\S]*label: '待审批'/);
  assert.match(pending, /auth\.isAdmin/);
  assert.match(pending, /auth\.isAdmin \?/);
});

test('pending review actions disambiguate duplicate slugs by owner', () => {
  const pending = readFileSync(new URL('../src/app/pending/page.tsx', import.meta.url), 'utf8');

  assert.match(pending, /owner_username: string/);
  assert.match(pending, /params: \{ owner: v\.owner_username \}/);
  assert.match(pending, /owner: v\.owner_username/);
});

test('publish fallback and admin comment links preserve skill owner identity', () => {
  const publish = readFileSync(new URL('../src/app/publish/page.tsx', import.meta.url), 'utf8');
  const comments = readFileSync(new URL('../src/app/admin/comments/page.tsx', import.meta.url), 'utf8');

  assert.match(publish, /api\.get\(`\/skills\/by-slug\/\$\{slug\.trim\(\)\}`,[\s\S]*owner: auth\.user\?\.username/);
  assert.match(comments, /owner_username: string/);
  assert.match(comments, /`\/skill\/\$\{comment\.owner_username\}\/\$\{comment\.skill_slug\}`/);
});

test('dark theme overrides common light surface utilities', () => {
  const globals = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');

  assert.match(globals, /\[data-theme="dark"\] \.bg-white/);
  assert.match(globals, /\[data-theme="dark"\] \.hover\\:bg-gray-50:hover/);
  assert.match(globals, /\[data-theme="dark"\] \.bg-blue-50/);
});

test('logged-in users can access publish calls to action', () => {
  const home = readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8');
  const mySkills = readFileSync(new URL('../src/app/my-skills/page.tsx', import.meta.url), 'utf8');
  const publish = readFileSync(new URL('../src/app/publish/page.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(home, /auth\.isPublisher \?/);
  assert.match(home, /href="\/publish"/);
  assert.match(mySkills, /auth\.isLoggedIn &&/);
  assert.doesNotMatch(publish, /!auth\.isPublisher/);
  assert.doesNotMatch(publish, /暂无发布权限/);
});

test('publish failure cleans up newly created empty skills', () => {
  const publish = readFileSync(new URL('../src/app/publish/page.tsx', import.meta.url), 'utf8');

  assert.match(publish, /let createdSkill = false/);
  assert.match(publish, /createdSkill = true/);
  assert.match(publish, /api\.delete\(`\/skills\/by-slug\/\$\{slug\.trim\(\)\}`,[\s\S]*owner: auth\.user\?\.username/);
  assert.match(publish, /已自动清理本次创建的空技能/);
});

test('my skills page exposes a version upload path', () => {
  const mySkills = readFileSync(new URL('../src/app/my-skills/page.tsx', import.meta.url), 'utf8');
  const publish = readFileSync(new URL('../src/app/publish/page.tsx', import.meta.url), 'utf8');

  assert.match(mySkills, /上传新版本/);
  assert.match(mySkills, /mode=version/);
  assert.match(mySkills, /无版本/);
  assert.match(publish, /已载入已有 Skill 信息，请选择新的版本文件上传/);
  assert.match(publish, /setStep\(params\.get\('mode'\) === 'version' \? 2 : 1\)/);
});

test('admin skills page surfaces load errors instead of silent empty data', () => {
  const adminSkills = readFileSync(new URL('../src/app/admin/skills/page.tsx', import.meta.url), 'utf8');

  assert.match(adminSkills, /加载技能数据失败/);
  assert.match(adminSkills, /setErrorMsg/);
  assert.match(adminSkills, /setTotal\(0\)/);
});

test('pending page uses authenticated API calls for list and review downloads', () => {
  const pending = readFileSync(new URL('../src/app/pending/page.tsx', import.meta.url), 'utf8');

  assert.match(pending, /api\.get\('\/pending'/);
  assert.match(pending, /responseType:\s*'blob'/);
  assert.doesNotMatch(pending, /href=\{`\/api\/skills\/by-slug\/\$\{v\.skill_slug\}\/versions\/\$\{v\.version\}\/download`\}/);
});

test('publish upload copy matches backend skill.yaml validation', () => {
  const publish = readFileSync(new URL('../src/app/publish/page.tsx', import.meta.url), 'utf8');

  assert.match(publish, /skill\.yaml/);
  assert.match(publish, /SKILL\.md/);
});

test('market empty state allows logged-in users to publish', () => {
  const market = readFileSync(new URL('../src/app/market/page.tsx', import.meta.url), 'utf8');

  assert.match(market, /auth\.isLoggedIn/);
  assert.doesNotMatch(market, /auth\.isPublisher/);
  assert.match(market, /href="\/publish"/);
});

test('top bar renders saved user avatars instead of only initials', () => {
  const topbar = readFileSync(new URL('../src/components/TopBar.tsx', import.meta.url), 'utf8');

  assert.match(topbar, /auth\.user\?\.avatar_url/);
  assert.match(topbar, /<img src=\{auth\.user\.avatar_url\}/);
});

test('top bar keeps username visible when nickname is shown', () => {
  const topbar = readFileSync(new URL('../src/components/TopBar.tsx', import.meta.url), 'utf8');

  assert.match(topbar, /shouldShowUsername/);
  assert.match(topbar, /@\{username\}/);
});

test('top bar stacking context keeps the avatar menu above page heroes', () => {
  const topbar = readFileSync(new URL('../src/components/TopBar.tsx', import.meta.url), 'utf8');

  assert.match(topbar, /<header className="[^"]*relative z-\[60\][^"]*backdrop-blur/);
  assert.match(topbar, /absolute right-0 top-full[^"]*z-50/);
});

test('global toasts render above app chrome and dialogs without overflowing mobile screens', () => {
  const toast = readFileSync(new URL('../src/lib/toast.tsx', import.meta.url), 'utf8');

  assert.match(toast, /import \{ createPortal \} from 'react-dom'/);
  assert.match(toast, /createPortal\(/);
  assert.match(toast, /document\.body/);
  assert.match(toast, /z-\[200\]/);
  assert.match(toast, /left-4 right-4/);
  assert.match(toast, /sm:left-auto/);
  assert.match(toast, /aria-live=\"polite\"/);
  assert.doesNotMatch(toast, /toast-container[^\"]*\bz-50\b/);
});

test('workspace pages use full-width content shells', () => {
  const fullWidthPages = [
    'src/app/page.tsx',
    'src/app/market/page.tsx',
    'src/app/favorites/page.tsx',
    'src/app/feedback/page.tsx',
    'src/app/my-feedback/page.tsx',
    'src/app/my-skills/page.tsx',
    'src/app/pending/page.tsx',
    'src/app/profile/page.tsx',
    'src/app/publish/page.tsx',
    'src/app/stats/page.tsx',
    'src/app/admin/audit-logs/page.tsx',
    'src/app/admin/comments/page.tsx',
    'src/app/admin/feedback/page.tsx',
    'src/app/admin/skills/page.tsx',
    'src/app/admin/users/page.tsx',
    'src/app/skill/[owner]/[slug]/page.tsx',
  ];

  for (const file of fullWidthPages) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /max-w-\[1480px\] w-full mx-auto/, file);
    assert.doesNotMatch(source, /mx-auto flex w-full max-w-\[1320px\]/, file);
  }
});

test('skill detail breadcrumb uses skill title, not nickname as path identity', () => {
  const detail = readFileSync(new URL('../src/app/skill/[owner]/[slug]/page.tsx', import.meta.url), 'utf8');

  assert.match(detail, /const ownerDisplayName =/);
  assert.match(detail, /<span className="text-\[var\(--text-primary\)\] font-medium">\{skill\.name\}<\/span>/);
  assert.doesNotMatch(detail, /\{skill\.owner_nickname \|\| skill\.owner_name\}\/\{skill\.name\}/);
});

test('skill detail offers zip package installation instructions', () => {
  const detail = readFileSync(new URL('../src/app/skill/[owner]/[slug]/page.tsx', import.meta.url), 'utf8');

  assert.match(detail, /Zip包安装/);
  assert.match(detail, /下载Zip安装包/);
  assert.match(detail, /Skill-Nexus-Hub\//);
  assert.doesNotMatch(detail, /hooks\//);
  assert.match(detail, /目录树/);
  assert.match(detail, /\/versions\/\$\{activeVersion\.version\}\/download/);
});

test('skill detail renders package markdown and lets users inspect historical versions', () => {
  const detail = readFileSync(new URL('../src/app/skill/[owner]/[slug]/page.tsx', import.meta.url), 'utf8');
  const markdown = readFileSync(new URL('../src/components/MarkdownContent.tsx', import.meta.url), 'utf8');

  assert.match(detail, /selectedVersionId/);
  assert.match(detail, /const activeVersion =/);
  assert.match(detail, /skill\?\.latest_version_id/);
  assert.match(detail, /<MarkdownContent/);
  assert.match(detail, /查看内容/);
  assert.match(detail, /浏览文件/);
  assert.match(detail, /activeVersion\.version/);
  assert.doesNotMatch(detail, /latestVersion!\.version/);
  assert.match(markdown, /data-skill-path/);
  assert.match(markdown, /markdown-alert/);
  assert.match(markdown, /resolvePackagePath/);
  assert.match(markdown, /responseType: 'blob'/);
});

test('skill detail gives cli installs a compact three-step guide', () => {
  const detail = readFileSync(new URL('../src/app/skill/[owner]/[slug]/page.tsx', import.meta.url), 'utf8');

  assert.match(detail, /选择 Agent/);
  assert.match(detail, /确认命令/);
  assert.match(detail, /一键安装/);
  assert.match(detail, /installScope !== 'zip'/);
});

test('skill detail does not auto-claim SNH CLI is missing after protocol launch', () => {
  const detail = readFileSync(new URL('../src/app/skill/[owner]/[slug]/page.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(detail, /document\.hidden[\s\S]{0,120}setShowCliDialog\(true\)/);
  assert.match(detail, /launchCliInstall/);
  assert.match(detail, /无法唤起/);
});

test('skill detail copy action has a non-secure-context fallback', () => {
  const detail = readFileSync(new URL('../src/app/skill/[owner]/[slug]/page.tsx', import.meta.url), 'utf8');

  assert.match(detail, /document\.createElement\('textarea'\)/);
  assert.match(detail, /document\.execCommand\('copy'\)/);
  assert.match(detail, /复制命令失败/);
});

test('top bar shows first-login SNH CLI onboarding once per user', () => {
  const topbar = readFileSync(new URL('../src/components/TopBar.tsx', import.meta.url), 'utf8');

  assert.match(topbar, /一键安装需要本地安装 SNH CLI 工具/);
  assert.match(topbar, /解压后双击运行 snh\.exe/);
  assert.match(topbar, /snh-cli-onboarding-dismissed/);
  assert.match(topbar, /setShowCliOnboarding\(true\)/);
});

test('local skills has a dedicated sidebar workspace with one-click scan protocol', () => {
  const sidebar = readFileSync(new URL('../src/components/Sidebar.tsx', import.meta.url), 'utf8');
  const pageUrl = new URL('../src/app/local-skills/page.tsx', import.meta.url);

  assert.match(sidebar, /label: '本地 Skill'/);
  assert.match(sidebar, /href: '\/local-skills'/);
  assert.equal(existsSync(pageUrl), true, 'local skills workspace page should exist');

  const page = readFileSync(pageUrl, 'utf8');
  assert.match(page, /snh:\/\/scan\?/);
  assert.match(page, /确认并开始扫描/);
  assert.match(page, /snh scan --upload/);
  assert.match(page, /扫描路径参考/);
  assert.match(page, /自定义扫描路径/);
  assert.match(page, /install-targets/);
  assert.match(page, /params\.append\('path'/);
  assert.match(page, /尚未收到扫描结果/);
});

test('local scan results can be selected, reviewed, and published through SNH CLI', () => {
  const page = readFileSync(new URL('../src/app/local-skills/page.tsx', import.meta.url), 'utf8');

  assert.match(page, /上传所选/);
  assert.match(page, /全选当前结果/);
  assert.match(page, /确认上传信息/);
  assert.match(page, /\/local-skills\/publish-requests/);
  assert.match(page, /snh:\/\/publish-local\?/);
  assert.match(page, /local_ref/);
  assert.match(page, /版本号/);
  assert.match(page, /可见范围/);
});

test('sidebar scrolls in short windows and LLM keys are entered directly', () => {
  const sidebar = readFileSync(new URL('../src/components/Sidebar.tsx', import.meta.url), 'utf8');
  const llm = readFileSync(new URL('../src/app/admin/llm/page.tsx', import.meta.url), 'utf8');

  assert.match(sidebar, /min-h-0 flex-1 overflow-y-auto/);
  assert.match(llm, /API Key/);
  assert.match(llm, /type="password"/);
  assert.match(llm, /payload\.api_key/);
  assert.match(llm, /api_key_configured/);
  assert.doesNotMatch(llm, /api_key_env/);
  assert.match(llm, /<AlertDialog/);
});

test('market target filters are backed by the target query parameter', () => {
  const market = readFileSync(new URL('../src/app/market/page.tsx', import.meta.url), 'utf8');

  assert.match(market, /params\.target = selectedTarget/);
  assert.match(market, /selectedTarget/);
});

test('markdown typography removes generated quote and code delimiters', () => {
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  const markdown = readFileSync(new URL('../src/components/MarkdownContent.tsx', import.meta.url), 'utf8');

  assert.match(css, /\.markdown-content blockquote p:first-of-type::before/);
  assert.match(css, /\.markdown-content code::before/);
  assert.match(css, /content: none !important/);
  assert.match(markdown, /firstParagraph\.remove\(\)/);
});
