# Skill Nexus Hub

一个开源、可自托管的 AI Agent 技能（Skill）市场 —— 发布、搜索、安装、版本管理、团队协作。

[![CI](https://github.com/Soonkeira/skill-nexus-hub/actions/workflows/ci.yml/badge.svg)](https://github.com/Soonkeira/skill-nexus-hub/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

简体中文 | [English](README.md)

## 为什么需要它

AI Agent 的 Skill 往往散落在各处 —— 个人电脑、项目目录、聊天记录里。没有一个统一的家，团队就会反复遇到这些问题：

- **Skill 孤岛**：好用的 Skill 只在小范围内使用，其他人难以发现和获取。
- **重复建设**：没有统一的 Skill 库，不同成员重复开发功能相似的 Skill。
- **版本混乱**：Skill 文件缺少版本管理，无法确认当前用的是哪个版本、改了什么。
- **更新不同步**：Skill 迭代之后，其他项目里的旧副本仍停留在旧版本，直到有人想起来手动更新。
- **缺乏质量把控**：没有审核与反馈机制，Skill 质量参差不齐。

Skill Nexus Hub 就是为解决这些问题而生的集中式市场：一个统一的地方来发布、发现、安装和管理 Skill，并配套审核、协作与命令行工具 —— 可以理解为面向 Agent 技能的 npm/PyPI。

## 功能特性

- **技能市场**：浏览和搜索所有公开技能，按标签、关键词、作者筛选；技能详情页支持 README 渲染、版本历史和评论；支持收藏。
- **版本管理**：每个技能多版本发布并附带变更日志；完整版本历史，可追溯、可下载。
- **审核流程**：管理员审核新版本 —— pending → approved / rejected（附拒绝原因）。
- **协作管理**：每个技能的协作者角色 —— owner / editor / viewer。
- **一键安装**：既可以通过 CLI（`snh install <name>`），也可以在网页端一键安装 —— 网页通过 `snh://` 自定义 URL 协议唤起本地 CLI 完成安装。
- **安装目标**：支持全局安装和项目级安装，写入各 Agent 的技能目录（Claude Code、Cursor、Codex、Windsurf、OpenClaw 等）；保留安装记录与下载统计。
- **账号与令牌**：JWT 注册/登录；个人资料（昵称、部门、头像）；密码修改；用于 CLI 认证、可设置过期时间的 API Token。
- **管理后台**：用户管理、技能审核、评论管理、反馈处理、审计日志、数据统计面板。
- **反馈系统**：Bug 报告、使用问题、功能建议，管理员回复与状态跟踪（pending → processing → resolved / closed）。

### 网页面面

| 路径 | 功能 | 权限 |
|---|---|---|
| `/` | 首页 / 工作台 | 登录用户 |
| `/market` | 技能市场 | 登录用户 |
| `/skill/[owner]/[slug]` | 技能详情（概览、安装、文件、版本、评论） | 登录用户 |
| `/publish` | 发布技能 | 登录用户 |
| `/my-skills` | 我的技能 | 登录用户 |
| `/favorites` | 我的收藏 | 登录用户 |
| `/local-skills` | 本地技能扫描与上报 | 登录用户 |
| `/feedback` | 提交反馈 | 登录用户 |
| `/my-feedback` | 我的反馈 | 登录用户 |
| `/profile` | 个人中心 | 登录用户 |
| `/profile/[username]` | 用户主页 | 登录用户 |
| `/stats` | 数据统计 | 登录用户 |
| `/pending` | 待审核列表 | 管理员 |
| `/admin/users` | 用户管理 | 管理员 |
| `/admin/skills` | 技能管理 | 管理员 |
| `/admin/comments` | 评论管理 | 管理员 |
| `/admin/feedback` | 反馈管理 | 管理员 |
| `/admin/audit-logs` | 审计日志 | 管理员 |
| `/login` | 登录 | 公开 |
| `/register` | 注册 | 公开 |

<!-- TODO: add screenshots after public deployment -->

| 计划截图 | 内容 |
|---|---|
| `docs/screenshots/market.png` | 技能市场列表与搜索 |
| `docs/screenshots/skill-detail.png` | 技能详情页与安装按钮 |
| `docs/screenshots/admin.png` | 管理后台 |

## 快速开始（Docker Compose）

前提：已安装 Docker 及 compose 插件。

```bash
git clone https://github.com/Soonkeira/skill-nexus-hub.git
cd skill-nexus-hub
cp .env.example .env
# 编辑 .env，设置 DB_PASSWORD 和 SECRET_KEY（可用 openssl rand -hex 32 生成）
docker compose build
docker compose run --rm backend alembic upgrade head   # 数据库迁移
docker compose up -d
```

然后访问 `http://localhost:9527`（三个服务：`frontend` 使用宿主机端口 **9527**，`backend`，`postgres`）。

创建第一个管理员账号：

```bash
docker compose exec backend python -m app.cli
```

脚本会提示输入用户名和密码，并创建拥有 admin 角色的用户。（另一种方式：先在网页注册普通账号，再将其提权 —— 见 [docs/deployment-ubuntu.md](docs/deployment-ubuntu.md)。）

环境变量（来自 `.env.example`）：

| 变量 | 说明 |
|---|---|
| `DB_PASSWORD` | PostgreSQL 数据库密码 |
| `SECRET_KEY` | JWT 签名密钥 —— 生产环境必须修改 |
| `ENV` | `dev` 或 `production`；为 `production` 时若 `SECRET_KEY` 未修改，后端将拒绝启动（快速失败守卫） |
| `CORS_ORIGINS` | 允许的浏览器来源（逗号分隔） |
| `TRUSTED_PROXIES` | 反向代理场景下的可信代理 IP 列表 |
| `WEB_CONCURRENCY` | Uvicorn worker 数量（默认 4） |

完整的 Ubuntu 内网部署步骤见 [docs/deployment-ubuntu.md](docs/deployment-ubuntu.md)。

## 命令行工具（`snh`）

安装 CLI：

- **推荐**：从 [GitHub Releases](https://github.com/Soonkeira/skill-nexus-hub/releases) 下载预编译二进制（`snh.exe` / `snh-linux` / `snh-macos`）并加入 `PATH`，或
- 从正在运行的实例获取 —— `cli/install.sh`（Linux/macOS）和 `cli/install.bat`（Windows）会从服务端的 `/api/cli/download/<platform>` 接口下载 ZIP 并解压出二进制与预配置的 `snh.conf`（默认服务端 `http://localhost:9527`；可通过环境变量 `SKILL_HUB_SERVER` 覆盖），或
- 从源码构建：`cd cli && python build.py`（PyInstaller，单文件可执行程序），开发调试可用 `pip install ./cli`。

将 CLI 指向你的实例并登录：

```bash
snh init -s http://<your-host>:9527   # 配置服务端地址（服务端打包下载的 CLI 已预配置）
snh login
```

命令速查：

| 命令 | 说明 |
|---|---|
| `snh init -s <server-url>` | 配置服务端地址 |
| `snh login` | 登录（交互式） |
| `snh logout` | 登出 |
| `snh whoami` | 查看当前登录状态 |
| `snh search <keyword>` | 搜索技能 |
| `snh info <skill-name>` | 查看技能详情 |
| `snh install <name>` | 安装技能（交互选择目标，也可用 `--target` / `--project` / `--path`） |
| `snh update <name>` / `snh update --all` | 更新已安装技能到最新版本 |
| `snh list` | 列出已安装技能 |
| `snh uninstall <name>` | 卸载技能 |
| `snh publish <slug> --version <x.y.z> --file <zip>` | 发布新版本（可选 `--changelog`） |
| `snh versions [name]` | 查看技能版本历史；省略名称则列出已安装技能 |
| `snh scan` | 扫描本地技能目录（`--upload` 上传结果，`--path` 指定额外目录） |
| `snh version` | 显示 CLI 版本 |
| `snh uninstall-cli` | 从本机卸载 CLI、配置及 `snh://` 协议处理 |

浏览器一键安装：网页端可以通过自定义 `snh://` URL 协议唤起本地 `snh` 可执行程序，在技能详情页点击"安装"即可完成部署，无需手动敲命令。CLI 会先用浏览器会话 token 换取长期 API Token，再将技能包下载并解压到所选 Agent 的目录。URL 格式与已知限制见 [docs/protocol-snh.md](docs/protocol-snh.md)。

## 技术栈

### 前端

| 组件 | 技术 |
|---|---|
| 框架 | Next.js (App Router) |
| 语言 | TypeScript |
| 样式 | Tailwind CSS v4 |
| 图标 | Lucide React |
| HTTP 客户端 | Axios |

### 后端

| 组件 | 技术 |
|---|---|
| Web 框架 | FastAPI |
| 运行时 | Uvicorn (async) |
| 数据库 | PostgreSQL 16 |
| ORM | SQLAlchemy 2.0 (async) |
| 数据库迁移 | Alembic |
| 认证 | JWT (python-jose) + bcrypt |
| 部署 | Docker |

### CLI 工具

| 组件 | 技术 |
|---|---|
| 框架 | Typer |
| HTTP 客户端 | httpx |
| 终端输出 | Rich |
| 打包方式 | PyInstaller（单文件可执行程序） |
| 协议支持 | `snh://` 自定义协议，浏览器一键唤起安装 |

## 项目结构

```
skill-nexus-hub/
├── frontend/          # Next.js Web 应用
├── backend/           # FastAPI 服务、SQLAlchemy 模型、Alembic 迁移
├── cli/               # snh CLI（Typer）+ PyInstaller 构建
├── docs/              # 部署指南、snh:// 协议设计、开发历史文档
├── scripts/           # backup.sh / restore.sh / setup-cron.sh / ci.sh
├── docker-compose.yml
├── .env.example
└── README.md
```

## 安全设计

- **认证**：JWT Token，7 天有效期。
- **密码**：bcrypt 哈希存储。
- **API 令牌**：SHA-256 哈希存储，仅创建时可见原文，每用户最多 10 个。
- **速率限制**（按 IP + 路径分级）：登录 10/min、注册 5/min、全局 100/min。
- **安全头**：`X-Content-Type-Options`、`X-Frame-Options`、`X-XSS-Protection` 等。
- **路由保护**：前端中间件校验登录状态，未登录自动跳转。
- **CORS**：仅允许指定来源。

## 文档

- [docs/deployment-ubuntu.md](docs/deployment-ubuntu.md) — Ubuntu 内网（IP + 端口）部署指南
- [docs/protocol-snh.md](docs/protocol-snh.md) — `snh://` 浏览器到 CLI 的安装协议
- [CONTRIBUTING.md](CONTRIBUTING.md) — 如何参与贡献
- [docs/dev-history/](docs/dev-history/) — 历史内部设计文档

## Roadmap

- Web UI 与 CLI 的 i18n
- 已发布技能包的签名与校验
- 更多 Agent 安装目标
- macOS / Linux 的协议注册（浏览器一键安装目前主要面向 Windows）

## 许可证

基于 [MIT License](LICENSE) 开源，欢迎参与贡献；贡献内容同样以 MIT 许可发布。
