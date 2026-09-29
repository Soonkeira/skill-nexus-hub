# Initial open-source audit (2026-09)

**Audit date**: 2026-09-28

**Scope**: adversarial full review of the entire repository before the public
open-source release — READMEs (EN/ZH), CONTRIBUTING, docs, docker-compose, scripts,
CI workflows, backend, frontend, CLI. Register baseline: commit `90eb704`.

**Resolution note**: findings AUD-001..021 were fixed in commit
[`7e9ae0e`](https://github.com/Soonkeira/skill-nexus-hub/commit/7e9ae0e)
(git-squash `fix: resolve initial OSS audit findings AUD-001..021`). Three were fixed
differently than the register suggested:

- **AUD-010** — fixed CLI-side: `snh://install` now accepts an optional `path=`
  parameter (custom-direction install) instead of adding `target=custom` in the
  frontend URL.
- **AUD-006** — install scripts default the server to `http://localhost:9527`
  (matching the compose-exposed port) rather than requiring an explicit URL.
- **AUD-012** — the dead `/api/versions` rate-limit prefix rule was replaced by a
  matching rule on `/api/skills/by-slug`.

Assessed and consciously deferred (not bugs we intend to fix now):

- **AUD-015** — the slider captcha is advisory (self-attested), acting as friction
  after failed logins; the global rate limiter remains the backstop.
- **AUD-016** — rate limits are per worker process (4x with `WEB_CONCURRENCY=4`);
  accepted as soft caps for a self-hosted intranet tool.
- **AUD-017** — `DownloadLog.source` stays `"web"`; CLI install records live in the
  local `installed.json`, so CLI download analytics are deliberately not built.
- **AUD-018** — the stray home-hero demo HTML was resolved by the documentation
  reorganization of 2026-09 (moved into `docs/demos/`), not by this commit.
- **AUD-020** — publish upload timeout stays at 30s; non-blocking, revisit if
  large-package uploads on weak links become an actual complaint.
- **AUD-022** — issue/PR templates deferred; CONTRIBUTING describes the expected
  issue forms in prose, and templates can be added when issue traffic justifies them.

The register body below is quoted verbatim from the working audit register (kept
out-of-band of the public repo), except that references to the repository's former
working-directory name were scrubbed so this tracked file keeps the tree free of
legacy identifiers. The `状态机` line reflects the register's state at audit time,
before remediation.

---

# FINDINGS 登记表 — Skill Nexus Hub (initial open-source audit 2026-09)

- 基线 HEAD: `90eb704` (main) · 最近 full 审计: **2026-09-29** · 模式: full(开源前对抗式整体审查)
- 审查范围: 全仓(README×2 / CONTRIBUTING / docs / docker-compose / scripts / ci.yml / backend / frontend / cli)
- 验证: backend pytest 142 passed (69.7s, Windows 本机) · cli pytest 26 passed · frontend node:test 42 passed (需在 `frontend/` 目录运行) · 全文档相对链接逐条解析通过 · 改名残留 grep 0 命中
- 项目画像要点(代 PROJECT-PROFILE): Next.js 16.2.7 standalone + rewrite `/api→backend:8000`,宿主仅暴露 9527→3000;backend FastAPI(ENV/SECRET_KEY 守卫在 config.py:31);CLI Typer+httpx trust_env=False,`snh://` 协议仅 Windows;迁移 24 个成链;无 tag/Releases;不报告项(用户已知)均未列入:本地未跟踪目录、旧内部工作目录名、docs/screenshots 空、本地 .env、CoC GitHub 通道、DSN 统一 skill_nexus_hub

## 覆盖表

| 维度 | 检查范围 | 方式/命令 | 结论 | 发现数 |
|---|---|---|---|---|
| 1 文档-代码一致性 | README/ZH 逐条命令表、端口、env 表、创建管理员、协议、技术栈;CONTRIBUTING 指引 | 逐行对照 cli/main.py、config.py、compose、cli.py、Dockerfile;pytest 实跑 | 多项漂移 | AUD-003/005/006/009/014/016/017 |
| 2 改名完整性 | 旧内部名/master/路径残留、名称一致性、脚本-DB 名、注册显示名 | 改名残留 grep、grep master、scripts 通读 | 除 master 死配置外干净 | AUD-008/021 |
| 3 CI 健康度 | ci.yml 全步骤、conftest 兼容 | 通读 + pytest 实跑 | ruff/缓存如实;两个测试集未入 CI;codegen job 名不副实 | AUD-007/021 |
| 4 安全与配置 | compose 暴露面、SECRET/ENV 校验、CORS、限流、captcha、加密存储、路径穿越 | 通读 config/main.py/middleware/services;pytest | compose 缺 ENV/CORS 转发;tar 解压无上限;captcha 自证式 | AUD-004/011/012/015 |
| 5 业务闭环 | clone→up→注册→发布→安装 全链路、CLI 分发、tag/模板 | 逐文件走查分发链路 | CLI 二进制分发三路全断(文档级阻塞) | AUD-001/002/003/006/010 |
| 6 多智能体残留 | 文档互链、已删文件引用、dev-history 矛盾、scripts 路径 | python 链接解析脚本 + grep 已删文件名 | 互链全通过;残留见下 | AUD-008/018 |
| 7 代码抽查 | versions.py/file_storage/skills-lock | 精读 + 实跑上传/下载相关测试 | upload/approve 状态机小裂缝 | AUD-013/019/020 |

## 发现清单

| ID | 严重级 | 位置 | 问题 | 修复建议 |
|---|---|---|---|---|
| AUD-001 | P1 | README.md:107(README.zh-CN.md:107) | CLI 安装首选路径指向 GitHub Releases,该页面存在但无任何 Release、无 tag——外部用户第一条安装路径即断 | 打 tag v0.1.0 并在宣布推广前发布二进制 Release(Windows/Linux/macOS 三份,命名对齐 PLATFORM_FILES);需决策:是否先撤掉该 bullet 直至 Release 就绪 |
| AUD-002 | P1 | cli/install.sh:21; cli/install.bat:16; backend/app/api/cli_download.py:47-58 | 两个安装脚本把 `/api/cli/download` 返回的 **ZIP 包**(binary+snh.conf)原样写成可执行文件(`snh`/`snh.exe`)再 chmod/改名,产物不可运行,预配置 snh.conf 也留在压缩包里 | 脚本内解压(unzip / PowerShell Expand-Archive)再取 binary 与 snh.conf 放同目录;或后端加 raw-binary 端点供脚本用 |
| AUD-003 | P1 | scripts/… 文档缺口: docs/deployment-ubuntu.md:229-237 + README.md:103-109 | 部署指南检查单要求"CLI 下载端点有二进制",但全库没有任何文档说明管理员如何构建(PyInstaller)并把 `snh.exe/snh-linux/snh-macos` 放进 `data/cli/`(compose 挂载 `./data/cli` 且只有 .gitkeep → 上线即 404) | 在 deployment-ubuntu.md 增加"构建 CLI 并放入 data/cli"小节(build.py → dist/ → 复制三平台产物),或在 CI 中产出并随发布上传 |
| AUD-004 | P1 | docker-compose.yml:20-26; backend/app/config.py:31-32; docs/deployment-ubuntu.md:83-84 | compose 未把 `ENV`/`CORS_ORIGINS` 传入 backend 容器(仅 DATABASE_URL/SECRET_KEY/TRUSTED_PROXIES/DATA_DIR/WEB_CONCURRENCY):ENV 守卫(生产必改 SECRET_KEY 的 SystemExit)在容器部署下永不触发,部署指南让写的 ENV=production/CORS_ORIGINS 均失效 | compose backend 环境块补 `ENV: ${ENV:-dev}`、`CORS_ORIGINS: ${CORS_ORIGINS:-}`;README env 表同步(补 ENV 行) |
| AUD-005 | P1 | CONTRIBUTING.md:18 与 59 | "pip install -r requirements.txt 后 python -m pytest"照做必失败:pytest/pytest-asyncio/aiosqlite/httpx 只在 requirements-dev.txt | 两条指引改为 `pip install -r requirements-dev.txt` |
| AUD-006 | P1 | cli/install.sh:9; cli/install.bat:9-10 | 安装脚本默认 `SERVER_URL=http://localhost:8000`,而 compose 部署只暴露 9527(backend 未端口映射)——按 README 流程执行必然连接失败;`SKILL_HUB_SERVER` 变量在 README/docs 零记载 | 默认改 `http://localhost:9527`(或必须显式传入),README 补 SKILL_HUB_SERVER 说明 |
| AUD-007 | P2 | .github/workflows/ci.yml(全部) | CI 完全不跑 cli/tests(26 用例)与 frontend node tests(42 用例),CONTRIBUTING 也不教如何跑后者(`npm run test:ui`);两个已存在的测试集零 CI 保障 | ci.yml 增加 cli pytest job;frontend job 追加 `npm run test:ui`(注意须在 frontend/ 目录下运行) |
| AUD-008 | P2 | skills-lock.json:1-8 | 开发者个人环境残留:锁定的是第三方技能 design-taste-frontend(Leonxlnx/taste-skill),与本项目运行无关,全库零引用,对开源读者纯属噪音 | 从仓库删除(本地文件 .gitignore 处理) |
| AUD-009 | P2 | README.md:130(README.zh-CN.md:130); cli/snh/commands/publish.py:10-30 | `snh publish` 描述为"Publish the skill in the current directory",实际签名是 `publish <slug> --version x.y.z --file <zip>`,不读当前目录;且命令表缺 init/scan/version/uninstall-cli(实际注册 15 个命令,表只列 11 个) | 表中 publish 行改为真实签名描述,补 scan(本地扫描)与 uninstall-cli 行 |
| AUD-010 | P2 | frontend/src/app/skill/[owner]/[slug]/page.tsx:441; cli/snh/main.py:213-218,194 | "自定义路径"一键安装契约断裂:前端 useCustom 分支发 `snh://install?...&path=...` 且不带 `target`,CLI 要求 slug 且 target 缺一即 SystemExit("Missing required parameters (slug, target)"),且 CLI 的 install 分支从不读取 `path` 参数(只有 scan 读) | CLI install 分支支持 target 缺省时改用 path 参数(映射为 custom_path 安装),或前端 URL 补 `target=custom` |
| AUD-011 | P2 | backend/app/services/skill_yaml.py:124-150; backend/app/api/versions.py:128-135 | normalize_to_zip 对 .md/.tar.gz 展开写入 ZIP 时无解压总量上限(50MB 压缩包可膨胀到 GB 级),100MB 防炸弹检查发生在 parse_skill_yaml(即 normalize 之后),内存峰值可被单请求打爆 | normalize_to_zip 内对展开体积设置硬上限(如 100MB)并先扫描 tar 成员大小 |
| AUD-012 | P2 | backend/app/middleware/rate_limit.py:14 | PATH_LIMITS 规则 `("/api/versions", None, 20, 60)` 是死规则:真实路径为 `/api/skills/by-slug/<slug>/versions`,前缀永不匹配,版本上传/下载实际只有全局 100/min 兜底 | 改为可匹配的前缀(如 `/api/skills/by-slug` + `versions` 判断)或删除该规则并如实记录 |
| AUD-013 | P2 | backend/app/api/versions.py:214-219,294-297 | approve_version 无条件把 skill.latest_version_id 指向被审批版本(重复审批旧版本会回退"最新版"指针);reject_version 对已 approve 版本也可执行且不清 latest 指针 → 详情页可能挂着已拒版本 | approve/reject 后重算 latest(取最近 approved),并限制仅 pending 状态可审 |
| AUD-014 | P2 | docs/protocol-snh.md:208,223 | 章节编号重复(两个 "### 8.");且注册表路径写 HKEY_CLASSES_ROOT 而代码实际写 HKCU\SOFTWARE\Classes;URL 格式缺 `project`/`path` 参数与 scan/publish-local 命令;伪代码 save_token(token) 直存 JWT 与现实的换 token 流程不符 | 修编号、同步注册表路径与 URL 参数;顶部注明"实现以 cli/snh/main.py 为准" |
| AUD-015 | P3 | backend/app/services/captcha.py:1-70; backend/app/api/auth.py:154-162 | 滑块验证为纯前端自证:任意 captcha_id POST /api/auth/captcha/verify 即标 verified,无服务端谜题——脚本可 GET→POST 两步绕过,属 3 次失败后的减速带而非安全边界(全局限流仍兜底) | 在代码注释与 README 明示其定位,或加真实挑战;不视为漏洞(有 10/min 限流兜底) |
| AUD-016 | P3 | README.md:189; backend/Dockerfile:8-11; compose WEB_CONCURRENCY=4 | README 的限流数值为单 worker 语义,4 worker 下实际上限×4(Dockerfile 已注明但 README 未提) | README 安全小节补一句"限流按 worker 进程独立计数" |
| AUD-017 | P3 | backend/app/api/versions.py:341-346 | DownloadLog.source 恒为 "web",CLI 安装与网页下载不可区分;README 声称的"install records"仅存 CLI 本地 installed.json | 非阻塞;如需 CLI 统计,下载端点按 UA/来源参数打标(需决策是否扩展) |
| AUD-018 | P3 | docs/home-hero-background-redesign-demo.html | 设计草稿 HTML 散在 docs 根目录(与 docs/demos/ 平行遗留),未在任何文档中引用 | 移入 docs/demos/ 或删除 |
| AUD-019 | P3 | backend/requirements.txt:13-14; frontend/package.json | openai/anthropic 未固定版本(其余全部 ==),构建可复现性弱;frontend 缺 engines 字段,CONTRIBUTING 声称 Node 20 但无强制 | 固定 openai/anthropic 版本;package.json 加 `"engines": {"node": ">=20"}` |
| AUD-020 | P3 | cli/snh/client.py:60 | post() 固定 timeout=30s,publish 50MB zip 弱网易超时且无重试提示 | publish 上传路径放宽超时(如 300s)或做一次重试 |
| AUD-021 | P3 | .github/workflows/ci.yml:5,7 | branches 触发器包含 master(仓库无此分支,死配置);与 CONTRIBUTING 的 master 指引为同源问题(注意:CONTRIBUTING.md:26,60 的 master 指引并入 AUD-005 批次修) | 顺手改为 `branches: [main]` |
| AUD-022 | P3 | .github/(无 ISSUE_TEMPLATE/PR 模板) | 无 issue/PR 模板,与 CONTRIBUTING "use one of the following forms" 的表单承诺不完全落地 | 低优先级;若要承诺表单就补两个模板 |

## 批次建议

```
Batch A(文件互不重叠,可并行): AUD-002+AUD-006(cli/install.sh+install.bat 一批), AUD-005+AUD-021(CONTRIBUTING+ci.yml 一批), AUD-010(cli/snh/main.py + skill 页面), AUD-011(skill_yaml.py), AUD-008(删 skills-lock.json), AUD-013(versions.py)
Batch B(依赖/需决策): AUD-001(tag+Release 流程,依赖 AUD-002/003 的产物命名), AUD-003(部署文档,依赖二进制产出方案), AUD-004(compose+README env 表联动), AUD-007(ci.yml 加 job;与 AUD-021 同文件,排在 Batch A 之后), AUD-009(README 命令表;与 AUD-010 修复联动)
低优先/随手批: AUD-015..AUD-020、AUD-022
```

状态机:全部 `待修`。复验时按编号读取本表 + 运行针对性测试。
