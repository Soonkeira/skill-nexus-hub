# Contributing to Skill Nexus Hub

Thanks for your interest in contributing! This document covers how to report issues, set up a development environment, and submit changes.

## Reporting issues

Open a GitHub Issue. Please use one of the following forms:

- **Bug report**: what you did, what you expected, what happened instead; include the relevant logs, the component (frontend / backend / CLI), and your deployment mode (Docker Compose or source).
- **Feature request**: the problem you are trying to solve and why the existing features don't cover it.

Please search existing issues before filing a new one.

## Development setup

The fastest route to a running stack is the Docker Compose Quick Start in the [README](README.md). For active development:

- **Backend** (`backend/`): Python 3.12. `pip install -r requirements.txt`, then run tests with `python -m pytest -q`. The app runs with `uvicorn app.main:app`.
- **Frontend** (`frontend/`): Node 20. `npm ci`, type-check with `npx tsc --noEmit`, build with `npm run build`.
- **CLI** (`cli/`): Python 3.10+. `pip install ./cli`, tests in `cli/tests` via `python -m pytest -q`.

`bash scripts/ci.sh` runs the same steps as CI locally (ruff lint, backend pytest, frontend type-check + build). Use it before pushing.

## Branching and commits

- Create a branch from `master`: `feature/<short-name>` (e.g. `feature/install-targets`).
- Write commit messages following [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`, `chore:`, etc. One logical change per commit.

## Code style

- **Backend**: there is no committed linter configuration yet; CI runs `ruff check` on `backend/app` (non-blocking at the moment). Keep the existing style: type hints, async SQLAlchemy usage, and consistent naming.
- **Frontend**: TypeScript `strict` mode is enabled in `tsconfig.json` — `npx tsc --noEmit` must pass. Follow the existing component and hook structure.
- **CLI**: Typer commands with Rich output; keep the existing module layout under `cli/snh/`.

## Pull requests

Checklist before opening a PR:

- [ ] Tests pass: `python -m pytest -q` in `backend/` and `cli/`.
- [ ] Frontend passes: `npx tsc --noEmit && npm run build`.
- [ ] `bash scripts/ci.sh` is green (recommended).
- [ ] New/changed behavior is covered by tests where practical.
- [ ] Documentation (README, README.zh-CN.md, `docs/`) is updated if behavior changed.
- [ ] No secrets, credentials, or local paths in the diff.
- [ ] PR title follows Conventional Commits.
- [ ] Keep the PR focused — one feature or fix per PR.

## Licensing

The project is licensed under the [MIT License](LICENSE). By contributing, you agree that your contributions will be licensed under the MIT License as well.

---

## 简体中文

欢迎为 Skill Nexus Hub 贡献代码！

- **提 Issue**：Bug 报告请附复现步骤、日志与部署方式；功能请求请先说明要解决的问题。提交前请先搜索是否已有同类 Issue。
- **开发环境**：参见 [README](README.zh-CN.md) 的 Docker Compose 快速开始；后端 `pip install -r requirements.txt` 后用 `python -m pytest -q` 跑测试；前端 `npm ci` + `npx tsc --noEmit` + `npm run build`；CLI 在 `cli/` 下 `pip install ./cli` 后跑 `python -m pytest -q`。推送前建议先跑 `bash scripts/ci.sh`。
- **分支与提交**：从 `master` 拉出 `feature/<short-name>` 分支；提交信息遵循 Conventional Commits（`feat:` / `fix:` / `docs:` / `test:` / `chore:`）。
- **代码风格**：后端暂无 lint 配置（CI 中的 ruff 检查目前不阻塞），保持现有风格；前端 TypeScript 严格模式必须通过；CLI 保持 Typer + Rich 的现有结构。
- **PR 检查项**：后端与 CLI 测试通过、前端类型检查与构建通过、文档同步更新、不包含密钥或本机路径、PR 标题遵循 Conventional Commits、每个 PR 只做一件事。
- **许可证**：项目采用 [MIT License](LICENSE)，贡献内容同样以 MIT 许可发布（无 CLA / DCO 要求）。
