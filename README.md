# Skill Nexus Hub

An open-source, self-hosted marketplace for AI Agent skills — publish, search, install, version, and collaborate.

[![CI](https://github.com/Soonkeira/skill-nexus-hub/actions/workflows/ci.yml/badge.svg)](https://github.com/Soonkeira/skill-nexus-hub/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

English | [简体中文](README.zh-CN.md)

## Why

AI Agent skills tend to live in scattered places — personal machines, project folders, chat histories. Without a shared home, teams run into the same problems over and over:

- **Skill islands**: a skill that works well for one person stays invisible to everyone else.
- **Duplicated work**: without a shared library, several people end up building similar skills.
- **No versioning**: skill files change silently; nobody can tell which version they are running, or what changed.
- **Stale copies**: after a skill improves, copies in other projects keep running the old version until someone remembers to update them.
- **No quality bar**: without review and feedback, skill quality is hit-or-miss.

Skill Nexus Hub is a central marketplace that fixes this: one place to publish, discover, install, and version skills, with review, collaboration, and a CLI — think npm/PyPI, but for Agent skills.

## Features

- **Marketplace**: browse and search public skills, filter by tag, keyword, or author; skill detail pages with README rendering, version history, and comments; favorites.
- **Versioning**: multiple versions per skill with changelogs; full version history, traceable and downloadable.
- **Review flow**: admin review of new versions — pending → approved / rejected (with rejection reason).
- **Collaboration**: collaborator roles per skill — owner / editor / viewer.
- **One-click install**: via the `snh` CLI (`snh install <name>`) or directly from the browser — the web UI hands off to the local CLI through the `snh://` custom URL protocol.
- **Install targets**: global or project-level installation into each Agent's skills directory (Claude Code, Cursor, Codex, Windsurf, OpenClaw and more); install records and download stats.
- **Accounts & tokens**: register/login with JWT; profile (nickname, department, avatar); password change; API tokens with optional expiry for CLI authentication.
- **Admin console**: user management, skill review, comments, feedback, audit logs, and a stats dashboard.
- **Feedback system**: bug reports, usage questions, and feature suggestions, with admin replies and status tracking (pending → processing → resolved / closed).

### Web console pages

| Path | Purpose | Access |
|---|---|---|
| `/` | Home / dashboard | logged-in users |
| `/market` | Skill marketplace | logged-in users |
| `/skill/[owner]/[slug]` | Skill detail (overview, install, files, versions, comments) | logged-in users |
| `/publish` | Publish a skill | logged-in users |
| `/my-skills` | My skills | logged-in users |
| `/favorites` | My favorites | logged-in users |
| `/local-skills` | Local skill scan & upload | logged-in users |
| `/feedback` | Submit feedback | logged-in users |
| `/my-feedback` | My feedback | logged-in users |
| `/profile` | Profile settings | logged-in users |
| `/profile/[username]` | User home page | logged-in users |
| `/stats` | Statistics | logged-in users |
| `/pending` | Pending review queue | admin |
| `/admin/users` | User management | admin |
| `/admin/skills` | Skill management | admin |
| `/admin/comments` | Comment management | admin |
| `/admin/feedback` | Feedback management | admin |
| `/admin/audit-logs` | Audit logs | admin |
| `/login` | Login | public |
| `/register` | Register | public |

<!-- TODO: add screenshots after public deployment -->

| Planned screenshot | Content |
|---|---|
| `docs/screenshots/market.png` | Marketplace listing and search |
| `docs/screenshots/skill-detail.png` | Skill detail page with install buttons |
| `docs/screenshots/admin.png` | Admin console |

## Quick Start (Docker Compose)

Prerequisites: Docker with the compose plugin.

```bash
git clone https://github.com/Soonkeira/skill-nexus-hub.git
cd skill-nexus-hub
cp .env.example .env
# Edit .env and set DB_PASSWORD and SECRET_KEY (generate with: openssl rand -hex 32)
docker compose build
docker compose run --rm backend alembic upgrade head   # database migrations
docker compose up -d
```

Then open `http://localhost:9527` (three services: `frontend` on host port **9527**, `backend`, `postgres`).

Create the first admin account:

```bash
docker compose exec backend python -m app.cli
```

The script prompts for a username and password and creates a user with the admin role. (Alternative: register a normal account on the website, then promote it — see [docs/deployment-ubuntu.md](docs/deployment-ubuntu.md).)

Environment variables (from `.env.example`):

| Variable | Purpose |
|---|---|
| `DB_PASSWORD` | PostgreSQL password |
| `SECRET_KEY` | JWT signing secret — must be changed in production |
| `ENV` | `dev` or `production`; with `production` the backend refuses to start while `SECRET_KEY` is unchanged (fail-fast guard) |
| `CORS_ORIGINS` | Allowed browser origins (comma-separated) |
| `TRUSTED_PROXIES` | Trusted proxy IPs, when behind a reverse proxy |
| `WEB_CONCURRENCY` | Uvicorn workers (default 4) |

For a full intranet deployment walkthrough on Ubuntu, see [docs/deployment-ubuntu.md](docs/deployment-ubuntu.md).

## CLI (`snh`)

Install the CLI:

- **Recommended**: download a prebuilt binary from [GitHub Releases](https://github.com/Soonkeira/skill-nexus-hub/releases) (`snh.exe` / `snh-linux` / `snh-macos`) and put it on your `PATH`, or
- from your running hub instance — `cli/install.sh` (Linux/macOS) and `cli/install.bat` (Windows) fetch a ZIP from the server's `/api/cli/download/<platform>` endpoint and extract the binary plus a preconfigured `snh.conf` (default server `http://localhost:9527`; set the `SKILL_HUB_SERVER` environment variable to override), or
- build from source: `cd cli && python build.py` (PyInstaller, single-file executable) or `pip install ./cli` for a development install.

Point it at your hub and log in:

```bash
snh init -s http://<your-host>:9527   # configure the server URL (bundled downloads come preconfigured)
snh login
```

Command reference:

| Command | Description |
|---|---|
| `snh init -s <server-url>` | Configure the hub server URL |
| `snh login` | Log in (interactive) |
| `snh logout` | Log out |
| `snh whoami` | Show current login |
| `snh search <keyword>` | Search skills |
| `snh info <skill-name>` | Show skill details |
| `snh install <name>` | Install a skill (choose a target interactively, or use `--target` / `--project` / `--path`) |
| `snh update <name>` / `snh update --all` | Update installed skill(s) to the latest version |
| `snh list` | List installed skills |
| `snh uninstall <name>` | Uninstall a skill |
| `snh publish <slug> --version <x.y.z> --file <zip>` | Publish a new version (`--changelog` optional) |
| `snh versions [name]` | Show a skill's version history, or list installed skills when omitted |
| `snh scan` | Scan local skill directories (`--upload` to submit results, `--path` for extra directories) |
| `snh version` | Show the CLI version |
| `snh uninstall-cli` | Uninstall the CLI, its config, and the `snh://` protocol handler from this computer |

Browser one-click install: the web app can launch the local `snh` executable through the custom `snh://` URL protocol, so clicking "Install" on a skill page installs it without touching the terminal. The CLI exchanges the browser session token for a long-lived API token, then downloads and unpacks the skill into the chosen Agent's directory. Details, URL format, and limitations are documented in [docs/protocol-snh.md](docs/protocol-snh.md).

## Tech stack

### Frontend

| Component | Technology |
|---|---|
| Framework | Next.js (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Icons | Lucide React |
| HTTP client | Axios |

### Backend

| Component | Technology |
|---|---|
| Web framework | FastAPI |
| Runtime | Uvicorn (async) |
| Database | PostgreSQL 16 |
| ORM | SQLAlchemy 2.0 (async) |
| Migrations | Alembic |
| Auth | JWT (python-jose) + bcrypt |
| Deployment | Docker |

### CLI

| Component | Technology |
|---|---|
| Framework | Typer |
| HTTP client | httpx |
| Terminal output | Rich |
| Packaging | PyInstaller (single-file executable) |
| Protocol | `snh://` custom URL scheme for browser one-click install |

## Project layout

```
skill-nexus-hub/
├── frontend/          # Next.js web app
├── backend/           # FastAPI service, SQLAlchemy models, Alembic migrations
├── cli/               # snh CLI (Typer) + PyInstaller build
├── docs/              # deployment guide, snh:// protocol design, dev history
├── scripts/           # backup.sh / restore.sh / setup-cron.sh / ci.sh
├── docker-compose.yml
├── .env.example
└── README.md
```

## Security

- **Auth**: JWT tokens, 7-day validity.
- **Passwords**: bcrypt hashing.
- **API tokens**: stored as SHA-256 hashes; plaintext shown only once at creation; up to 10 tokens per user.
- **Rate limiting** (per IP + path): login 10/min, register 5/min, 100/min global.
- **Security headers**: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, and others.
- **Route protection**: frontend middleware redirects unauthenticated visitors.
- **CORS**: allowlist only.

## Documentation

- [docs/deployment-ubuntu.md](docs/deployment-ubuntu.md) — Ubuntu (intranet, IP + port) deployment guide
- [docs/protocol-snh.md](docs/protocol-snh.md) — `snh://` browser-to-CLI install protocol
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to contribute
- [docs/dev-history/](docs/dev-history/) — historical internal design documents

## Roadmap

- i18n for the web UI and CLI
- Signing and verification for published skill packages
- More Agent install targets
- Protocol registration for macOS / Linux (browser one-click install currently targets Windows)

## License

Released under the [MIT License](LICENSE). Contributions are welcome and are licensed under MIT as well.
