# Documentation map

Skill Nexus Hub keeps **one canonical document per topic**, updated in place — no
`-v2`, `-final`, or re-written variants. This map is the single entry point: it tells
you where each kind of knowledge lives. Before creating any document, run the
decision tree in [../AGENTS.md](../AGENTS.md).

## Where do I find X

| Question | Where |
|---|---|
| How the system works | [docs/reference/](reference/) and the backend/frontend/CLI source code (`backend/app`, `frontend/src`, `cli/snh`) |
| Why a decision was made | [docs/adr/](adr/) |
| How to deploy, operate, troubleshoot on Ubuntu | [docs/runbooks/deploy-ubuntu.md](runbooks/deploy-ubuntu.md) |
| Browser→CLI install protocol spec (`snh://`) | [docs/reference/protocol-snh.md](reference/protocol-snh.md) |
| What is being developed now | [openspec/changes/](../openspec/changes/) |
| Past audit / acceptance evidence | [docs/audit/](audit/) |
| Historical designs (may be outdated) | [docs/archive/](archive/) |
| Visual design demos | [docs/demos/](demos/) |
| Screenshots | [docs/screenshots/](screenshots/) |
| How to contribute | [CONTRIBUTING.md](../CONTRIBUTING.md) |
| Code of conduct | [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) |

## Rules

- Do not add loose `.md` files to `docs/` root — this map is the only file allowed there.
- Before creating any document, follow the decision tree in [../AGENTS.md](../AGENTS.md):
  most knowledge belongs in an existing canonical doc, an ADR, a runbook, or an
  `openspec/changes/` folder — not a new standalone file.
