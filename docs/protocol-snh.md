# Web 一键安装 CLI 技能方案

> English note: this documents the browser one-click install protocol via the `snh://` custom URL scheme (browser wakes the local CLI to install a skill).

## 概述

实现网页端一键安装技能到本地 Agent 工具（Cursor、Claude Code、Codex 等），通过自定义协议处理器 `snh://` 打通浏览器与本地 CLI。

## 用户流程

```
用户首次下载安装 CLI（一次性）
         ↓
网页浏览技能 → 选择目标 Agent → 点击"安装到 Cursor"
         ↓
浏览器弹出确认框 → 调用本地 snh.exe
         ↓
CLI 自动执行：携带 token → 下载技能包 → 解压到目标目录
         ↓
终端窗口显示安装进度和结果
```

## 技术方案

### 1. 自定义协议注册（CLI 安装时）

安装 CLI 时写入 Windows 注册表：

```
HKEY_CLASSES_ROOT\snh
    (Default) = "URL:Skill Nexus Hub"
    URL Protocol = ""
    \shell\open\command
        (Default) = "C:\Users\...\snh.exe" "%1"
```

### 2. 协议 URL 格式

```
snh://install?token=<jwt>&owner=<username>&slug=<skill-slug>&target=<agent>&server=<url>
```

参数说明：
- `token`：网页当前用户的 JWT token（内网环境直接传递）
- `owner`：技能所有者用户名
- `slug`：技能标识符
- `target`：安装目标（cursor / claude-code / codex）
- `server`：后端服务地址（默认内网地址）

### 3. CLI 处理逻辑

`snh.exe` 启动时判断参数类型：

```python
def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else None

    if arg and arg.startswith("snh://"):
        # 协议调用模式
        handle_protocol(arg)
    else:
        # 正常 CLI 模式
        cli()
```

协议处理：

```python
def handle_protocol(url: str):
    parsed = urlparse(url)
    params = parse_qs(parsed.query)

    # install 命令
    if parsed.hostname == "install":
        token = params["token"][0]
        owner = params.get("owner", [None])[0]
        slug = params["slug"][0]
        target = params["target"][0]
        server = params.get("server", [None])[0]

        # 存储 token
        save_token(token)
        if server:
            save_server(server)

        # 执行安装
        install(slug=f"{owner}/{slug}" if owner else slug, target=target)
```

### 4. 前端 UI 改动

**技能详情页右侧安装区域：**

```
┌─────────────────────────────────┐
│  一键安装                        │
│                                  │
│  ┌─────────────────────────────┐ │
│  │  安装到 Cursor (全局)        │ │
│  └─────────────────────────────┘ │
│  ┌─────────────────────────────┐ │
│  │  安装到 Claude Code (全局)   │ │
│  └─────────────────────────────┘ │
│  ┌─────────────────────────────┐ │
│  │  安装到 Codex (全局)         │ │
│  └─────────────────────────────┘ │
│                                  │
│  ── 或复制命令手动安装 ──         │
│                                  │
│  全局安装：                       │
│  snh install zhangsan/pdf --t cursor │
│                                  │
│  项目级安装（仅当前项目生效）：     │
│  snh install zhangsan/pdf --t cursor --project │
└─────────────────────────────────┘
```

**安装路径说明：**

| 安装方式 | 说明 | 示例路径 |
|---------|------|---------|
| 全局安装（默认） | 所有项目都能使用 | `~/.cursor/skills/pdf-parser/` |
| 项目级安装（`--project`） | 仅当前项目可用 | `./.cursor/skills/pdf-parser/` |

- **网页一键安装**：固定为全局安装（网页无法感知用户本地项目目录）
- **CLI 手动安装**：用户通过 `--project` 参数选择项目级安装
- **各 Agent 实际路径**（需根据官方文档确认）：

| Agent | 全局路径 | 项目路径 |
|-------|---------|---------|
| Claude Code | `~/.claude/skills/` | `.claude/skills/` |
| Cursor | `~/.cursor/skills/` | `.cursor/skills/` |
| Codex CLI | `~/.codex/skills/` | `.codex/skills/` |
| Windsurf | `~/.windsurf/skills/` | `.windsurf/skills/` |
| OpenClaw | `~/.openclaw/skills/` | `.openclaw/skills/` |

**前端实现：**

```tsx
function handleInstall(target: string) {
  const token = localStorage.getItem('token');
  const server = window.location.origin;
  const url = `snh://install?token=${token}&owner=${skill.owner_name}&slug=${skill.slug}&target=${target}&server=${server}`;

  // 尝试打开协议
  window.location.href = url;

  // Fallback：2秒后如果协议没响应，提示安装 CLI
  setTimeout(() => {
    // 检测是否还在页面（协议打开会离开焦点）
    if (!document.hidden) {
      showToast('请先安装 SNH CLI');
    }
  }, 2000);
}
```

### 5. 认证方案

**内网环境（当前方案）：**

JWT 会过期，不能长期使用。采用「JWT 换长期 API Token」的方案：

```
网页登录 → 点击安装 → 短期 JWT 编入 URL → CLI 收到 → 调后端换长期 Token → 存储到本地
                                                              ↓
                                                       执行安装（用长期 Token）
```

**后端新增接口：**
- `POST /api/auth/cli-token` — 用当前 JWT 换一个 CLI 专用的长期 API Token
- 该 Token 不设过期时间（或设置很长，如 1 年）
- 关联到用户，可从网页端管理/撤销

**CLI 处理流程：**
1. 收到网页传来的短期 JWT
2. 调用 `/api/auth/cli-token` 换取长期 Token
3. 存储到本地 `~/.snh/config.json`
4. 后续所有 CLI 操作都使用长期 Token
5. 如果长期 Token 被撤销或失效，CLI 提示用户回到网页重新点击安装

**网页端 Token 管理（可选）：**
- 用户管理页面展示已发放的 CLI Token 列表
- 支持一键撤销某个 CLI 设备的 Token

### 6. 需要改动的文件

**CLI 端：**
- `cli/snh/main.py` — 添加协议 URL 解析入口
- `cli/snh/commands/install.py` — 支持从协议参数执行安装
- `cli/setup.py` 或安装脚本 — 注册 `snh://` 协议到系统

**前端端：**
- `frontend/src/app/skill/[owner]/[slug]/page.tsx` — 安装区域改为多按钮
- `frontend/src/components/InstallButton.tsx` — 新组件，处理协议调用
- `frontend/src/lib/api.ts` — 获取 install targets 列表

**后端：**
- 无需改动（现有 API 已支持）

### 7. 局限性

- 浏览器会弹出确认框（"是否打开 snh:// 链接？"），这是浏览器安全机制，无法绕过
- 首次安装 CLI 仍需手动下载（所有同类工具的共同限制）
- 仅 Windows 支持（macOS/Linux 需要额外的协议注册方式）
- URL 中包含 token，会被记录在浏览器历史中（内网环境可接受）

### 8. 网络环境限制

CLI 仅限内网环境使用。当用户不在内网时（连接超时、DNS 解析失败等），CLI 会显示友好提示：

```
❌ 无法连接到服务器，请确认您当前在内网环境下使用。如需外网访问，请先连接公司 VPN。
```

实现方式：CLI 的 `client.py` 中所有 HTTP 请求（`get`、`post`、`download`）统一捕获 `httpx.ConnectError`、`httpx.TimeoutException`、`httpx.NetworkError` 异常，输出中文提示后退出。

适用场景：
- 用户在家办公未连接 VPN
- 用户在公司但网络隔离
- 服务器地址配置错误

### 8. 后续扩展

- **CLI 自动更新**：安装后检查版本，提示更新
- **安装进度回调**：CLI 安装完成后通知网页（通过本地 HTTP 服务）
- **多平台支持**：macOS 使用 `.app` bundle 注册协议，Linux 使用 `.desktop` 文件
- **卸载功能**：网页端一键卸载已安装的技能
