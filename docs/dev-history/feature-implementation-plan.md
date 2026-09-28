# Skill Nexus Hub — 新功能实现计划

## Context

项目已上线运行，现需新增三项功能：
1. CLI 本地技能扫描 + 网页端展示
2. LLM 驱动的 Skill 自动分析（多模型提供商适配）
3. 修复 `snh versions` 命令行为

---

## 功能一：CLI 本地技能扫描 + 网页端展示

### 设计思路

**不启动 CLI 常驻服务**。采用"前端触发 → 弹窗提示命令 → 用户在终端执行 CLI → CLI 将结果上报到服务器 → 前端刷新展示"的模式。

交互流程：
1. 用户在前端页面点击"扫描本地 Skill"按钮
2. 前端弹出对话框，显示需要执行的命令（如 `snh scan --upload`），附带一键复制
3. 用户在本地终端执行该命令
4. CLI 扫描本地 Skill 目录，将结果 POST 到后端 API，返回 scan_id
5. 前端通过 scan_id 查询扫描结果（非无限轮询，设置超时）

扫描路径：直接复用现有的安装路径（install targets）作为默认扫描路径。

### 关键设计补充

**多设备区分**：
- CLI 上报时生成并携带 `device_id`（首次执行时生成，存储在 `~/.snh/config.json`）
- 同一用户多台电脑的数据通过 device_id 隔离，不会互相覆盖

**扫描健壮性**：
- 处理路径重复（同一目录被多个 target 指向时去重）
- 处理符号链接循环（设置最大递归深度）
- 限制单次扫描的文件数量和总大小，防止异常目录导致 CLI 卡死

**扫描批次机制**：
- 数据结构采用"扫描批次（ScanBatch）+ 扫描结果（LocalSkillReport）"
- 每次上报创建一个新的 ScanBatch，包含 scan_id、device_id、扫描时间
- ScanBatch 下的结果整体替换，便于识别已被删除的本地 Skill（新批次中不出现的即为已删除）

### CLI 新增

#### `cli/snh/commands/scan.py`

- `snh scan` — 扫描所有预设路径，列出本地发现的 Skill
- `snh scan --upload` — 扫描并将结果上报到服务器，返回 scan_id

扫描逻辑：
1. 从服务器 API 获取 install targets（安装路径 = 扫描路径）
2. 对路径去重，逐个扫描子目录（最大递归深度限制）
3. 识别 Skill（通过 SKILL.md 或 skill.json 等标识文件）
4. 限制：单个 Skill 最多读取 N 个文件、总大小不超过 X MB
5. 如果 `--upload`，将结果 POST 到 `POST /api/local-skills/report`，携带 device_id

#### 修改 `cli/snh/main.py`

- 注册 `scan` 命令
- 首次运行时自动生成 device_id 并存入 config.json

### 后端新增

#### `backend/app/models/local_scan.py`

```python
class ScanBatch(Base):
    """扫描批次"""
    id, user_id, device_id,
    status(uploading/completed/failed),
    skill_count, scanned_at

class LocalSkillReport(Base):
    """扫描结果"""
    id, batch_id,  # 关联扫描批次
    skill_name, skill_slug, directory,
    agent_target(来自哪个 install target),
    files(JSONB, 文件列表), metadata_(JSONB, SKILL.md 内容等),
    detected_at
```

#### `backend/app/schemas/local_scan.py`

#### `backend/app/api/local_scan.py`

- `POST /api/local-skills/report` — 接收 CLI 上报（创建 ScanBatch + 批量写入结果），返回 scan_id
- `GET /api/local-skills/scan/{scan_id}` — 查询指定批次的扫描结果
- `GET /api/local-skills` — 获取当前用户最新的本地 Skill 列表（取最新批次）

#### 新增迁移 `backend/alembic/versions/xxx_add_local_scan.py`

### 前端修改

前端具体组件和布局在实现阶段细化，核心交互：

- "扫描本地 Skill"按钮 → 弹窗显示 `snh scan --upload` 命令 + 一键复制
- 用户终端执行后，前端通过 scan_id 查询结果（设置超时，非无限轮询）
- 展示本地 Skill 列表，支持按设备（device_id）筛选
- `frontend/src/lib/types.ts` 新增 `ScanBatch`、`LocalSkillReport` 类型

---

## 功能二：LLM 驱动的 Skill 自动分析

### 设计思路

后端新增 LLM 配置和分析模块。采用适配器模式支持多提供商。**分析为异步任务**，不阻塞上传接口。

### 关键设计补充

**API Key 安全**：
- 方案 A（推荐）：数据库只存储环境变量名称（如 `OPENAI_API_KEY`），真实密钥放在服务器 `.env` 文件中，永远不经过 API 接口
- 方案 B（如需 UI 配置密钥）：使用 Fernet 或 AES-GCM 加密存储，接口返回时脱敏（仅显示前 4 位），永远不返回原始密钥
- 具体采用哪种方案在实现时决定

**不可信输入防护**：
- Skill 文件属于不可信输入，必须防止提示词注入
- 限制参与分析的文件类型（仅 .md / .txt / .yaml / .json 等，排除二进制）
- 限制参与分析的文件数量和总大小
- 限制发送给 LLM 的总 Token 数
- 在 Prompt 中明确告知模型输入来自不可信来源

**异步任务机制**：
- 不在上传接口中同步调用模型，避免超时导致上传失败
- 分析触发时机：版本审核通过后自动创建分析任务，或管理员手动触发
- 由独立 Worker / 后台任务执行分析
- 分析结果绑定具体 Skill 版本（version_id），而非仅绑定 Skill

**质量评分说明**：
- "AI 质量评分"不能等同于安全认证或可信标识
- 前端展示时明确标注"AI 分析结果仅供参考"，与官方审核状态区分

### 新增文件

#### 1. `backend/app/models/analysis.py`

```python
class LLMProvider(Base):
    id, name, provider_type(openai/anthropic/custom),
    base_url, model_name, api_key_env(环境变量名) / api_key_encrypted(加密密钥),
    is_default, max_tokens, temperature, created_at

class SkillAnalysis(Base):
    id, skill_id, version_id, provider_id,  # 绑定具体版本
    summary,          # 技能概述
    usage_guide,      # 使用说明
    effects,          # 预期效果
    best_practices,   # 最佳实践建议
    quality_score,    # 质量评分 (1-10)，标注"仅供参考"
    warnings,         # 注意事项/风险提示
    raw_response,     # LLM 原始返回
    status(pending/processing/completed/failed),
    error_message,
    analyzed_at, created_at
```

#### 2. `backend/app/schemas/analysis.py`

- `LLMProviderCreate/Update/Response`（Response 中 api_key 脱敏）
- `SkillAnalysisResponse`（包含所有分析字段 + "仅供参考"标识）

#### 3. `backend/app/llm/__init__.py` + `base.py` — LLM 适配器基类

```python
class LLMAdapter(ABC):
    @abstractmethod
    async def analyze_skill(self, prompt: str, content: str) -> str: ...
```

#### 4. `backend/app/llm/openai_adapter.py` — OpenAI 兼容适配器

覆盖 OpenAI、国内中转、vLLM、Ollama、DeepSeek 等 OpenAI 兼容接口。

#### 5. `backend/app/llm/anthropic_adapter.py` — Anthropic 适配器

#### 6. `backend/app/llm/factory.py` — 适配器工厂

根据 provider_type 创建对应的适配器实例。

#### 7. `backend/app/llm/prompts.py` — 分析 Prompt 模板

- 明确标注输入来自不可信来源
- 引导 LLM 输出结构化 JSON 结果
- 包含注入防护提示

#### 8. `backend/app/api/analysis.py` — 分析 API 路由

- `POST /api/skills/by-slug/{slug}/versions/{version}/analyze` — 创建分析任务（异步）
- `GET /api/skills/by-slug/{slug}/versions/{version}/analysis` — 获取分析结果及状态
- `GET /api/admin/llm-providers` — 列出 LLM 配置（api_key 脱敏）
- `POST /api/admin/llm-providers` — 添加 LLM 配置
- `PUT /api/admin/llm-providers/{id}` — 更新配置
- `DELETE /api/admin/llm-providers/{id}` — 删除配置

#### 9. `backend/app/services/analysis.py` — 分析服务（异步 Worker）

核心逻辑：
1. 从 ZIP 中提取 Skill 文件内容（仅安全文件类型，限制数量和大小）
2. 截断至 Token 上限
3. 组装 Prompt（含注入防护提示）
4. 调用 LLM 适配器
5. 解析结构化结果
6. 存入数据库，绑定 version_id

### 修改文件

#### `backend/app/main.py`
- 注册 analysis_router
- 注册 admin LLM provider 路由

#### `backend/app/models/__init__.py`
- 导入新模型

#### `backend/app/config.py`
- 新增 `encryption_key` 配置项（如采用加密存储方案）

#### `backend/requirements.txt`
- 新增依赖：`openai`、`anthropic`

#### 新增迁移 `backend/alembic/versions/xxx_add_llm_and_analysis.py`

### 前端修改

#### 1. `frontend/src/lib/types.ts`
新增 `SkillAnalysis`、`LLMProvider` 类型定义。

#### 2. `frontend/src/app/skill/[owner]/[slug]/page.tsx`
在"概览"tab 中：
- 展示 LLM 分析结果卡片（概述、使用说明、效果、质量评分、注意事项）
- 质量评分旁明确标注"AI 分析，仅供参考"
- 分析状态展示（pending → processing → completed / failed）
- 管理员可手动触发"重新分析"

#### 3. `frontend/src/app/admin/llm/page.tsx` — LLM 配置管理页（管理员）
- 添加/编辑/删除 LLM 提供商配置
- 测试连通性
- 设置默认提供商
- API Key 展示为脱敏格式

---

## 功能三：修复 snh versions 命令

### 修改文件

#### `cli/snh/main.py`

- 新增 `snh version` 命令（singular），显示 CLI 版本号
- 版本号从包元数据统一读取（`import importlib.metadata; __version__ = importlib.metadata.version("snh")`），不硬编码

```python
@app.command("version")
def show_version():
    """Show SNH CLI version."""
    rprint(f"snh version {__version__}")
```

#### `cli/snh/commands/publish.py`

修改 `versions` 函数，将 slug 改为可选参数：

```python
def versions(
    slug: str = typer.Argument(None, help="Skill slug (omit to list all installed)"),
):
```

- 当 slug 有值时：保持现有行为（查询服务器上该 Skill 的所有版本）
- 当 slug 为空时：从 `load_installed()` 读取所有已安装 Skill，展示本地安装版本 + 目标 Agent + 调用 API 获取线上最新版本

#### 批量版本查询优化

查询多个 Skill 最新版本时，后端新增批量 API 避免逐条请求：

- `GET /api/skills/latest-versions?slugs=slug1,slug2,slug3` — 批量获取多个 Skill 的最新版本信息

---

## 实施顺序

1. **功能三**（最简单，改动最小）— 修复 `snh version/versions` + 批量版本 API
2. **功能二**（后端为主）— LLM 分析（模型、适配器、异步任务、迁移）
3. **功能一**（前后端+CLI 联动）— 本地扫描 + 批次机制 + 网页端展示

---

## 验证方式

1. `snh version` 输出 CLI 版本号；`snh versions` 列出所有已安装 Skill（本地版本 + 线上最新）；`snh versions <slug>` 显示指定 Skill 版本列表
2. 管理后台配置 LLM 提供商 → 发布/上传一个 Skill → 审核通过 → 异步触发分析 → 前端概览页查看分析结果（含"仅供参考"标注）
3. 前端点击"扫描本地 Skill" → 弹窗显示 `snh scan --upload` → 本地终端执行 → 通过 scan_id 查询结果 → 前端展示（支持按设备筛选）
4. `cd frontend && npx next build` 确认前端构建通过
5. `docker compose build backend` 确认后端构建通过（在项目根目录执行）
