# AGENTS.md

Skill Nexus Hub is an open-source, self-hosted marketplace for AI Agent skills (Next.js frontend, FastAPI backend, `snh` Typer CLI). Start from [README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

These rules apply to human contributors and AI agents alike.

## Documentation governance

Before creating ANY document, work through this decision tree:

- **Small bug / UI tweak / single-point fix** → NO new document. Update existing docs only if user-facing behavior changed.
- **New capability / complex cross-cutting change** → `openspec/changes/<change-name>/` (proposal → design → tasks; see [openspec/README.md](openspec/README.md)). Merge/delete the change folder once shipped and its content is folded into reference docs.
- **Current long-lived facts changed** → update the EXISTING canonical doc under `docs/reference/`; create a new one only if no suitable topic exists.
- **Major architectural decision** → `docs/adr/ADR-NNNN-short-title.md`, numbered sequentially, never renumbered.
- **Ops procedure / deployment / troubleshooting** → `docs/runbooks/`.
- **One-off audit / test / acceptance evidence** → `docs/audit/YYYY-MM/`.
- **Outdated design** → `docs/archive/`.

Hard rules:

- NEVER create new `.md` files directly in the `docs/` root — only the map file [docs/README.md](docs/README.md) lives there.
- Prefer EDITING the existing canonical document over writing a new summary/final/report variant.
- One topic = one document, updated in place. No `<topic>-v2.md`, no `<topic>-final.md`, no `<topic>-实施结果.md`.
- ADRs are append-only: an ADR is marked Accepted/Superseded-by-ADR-XXXX, never edited to change a decision.

## Build & test

Verified commands (run inside the noted directory):

- Backend: `pip install -r requirements-dev.txt && python -m pytest -q` (in `backend/`)
- CLI: `python -m pytest -q` (in `cli/`; install with `pip install ./cli pytest` first for a dev env)
- Frontend: `npm ci`, then `npx tsc --noEmit`, `node --test tests/*.test.mjs`, `npm run build` (in `frontend/`)
- CLI binary build: `python build.py` (in `cli/`, PyInstaller)

`bash scripts/ci.sh` runs the CI-equivalent steps locally.

## Repo conventions

- Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`); feature branches off `main` named `feature/<short-name>`.
- The brand is **Skill Nexus Hub** (S·N·H). The `snh` identifiers are frozen — never rename the CLI (`snh`), the `snh://` URL protocol, the `snh_` API token prefix, or the `~/.snh` config dir.
- Database name is `skill_nexus_hub` (compose, scripts, and defaults are aligned — keep them that way).
- [README.md](README.md) (English) and [README.zh-CN.md](README.zh-CN.md) must stay section-by-section in sync; edit both together.
- No secrets, credentials, or local paths in commits or docs.
