# OpenSpec — change flow for new capabilities

This repo plans non-trivial work as **change folders**, not one-off documents.

For a new capability or a complex cross-cutting change, create
`openspec/changes/<change-name>/` containing:

- `proposal.md` — what is being built and why (problem, scope, out of scope)
- `design.md` — how: approach, decisions, trade-offs considered
- `tasks.md` — a checklist of implementation steps

Copy the stubs from [`changes/_template/`](changes/_template/) to start.

A change **ships** when its tasks are done AND the durable knowledge is folded into
the standing docs: canonical reference docs in `docs/reference/` updated, ADRs
written for any architectural decisions. Then the change folder is **deleted** — its
long-lived knowledge lives in `docs/reference/` and `docs/adr/`, and git history is
the record of how it got there.

Small bug fixes and single-point changes do not need a change folder — see the
decision tree in [../AGENTS.md](../AGENTS.md).

## Currently active changes

None.
