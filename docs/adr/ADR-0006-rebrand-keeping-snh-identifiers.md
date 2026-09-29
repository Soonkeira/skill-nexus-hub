# ADR-0006: Rebrand keeping all snh identifiers

Status: Accepted
Date: 2026-09

## Context

The project was developed internally under an earlier brand. When it was prepared for
an open-source release, it needed a public name — Skill Nexus Hub (S·N·H) — and a
clean public history. Users were already running the internal build, installed as an
`snh` binary with OS-level protocol registration.

## Decision

Rename the brand to Skill Nexus Hub in all user-facing surfaces (README, UI copy,
CLI help text, registry display name), while keeping ALL `snh` technical identifiers
frozen: the CLI name `snh`, the `snh://` URL scheme, the `snh_` API token prefix, and
the `~/.snh` configuration directory. Breaking any of these would silently break
installed users — a renamed CLI binary breaks scripts and PATH entries; a renamed
URL scheme breaks every already-registered protocol handler. The public git history
was restarted as a single squashed initial commit; the pre-release internal history
is preserved out-of-band of this repository.

## Consequences

- The acronym S·N·H and the identifiers stay coherent by design, so no migration or
  re-registration is needed for existing installs.
- Internal development references (old paths, old brand) survive only in
  `docs/archive/` and local, untracked workspaces — never in tracked content.
- Any future rename would require a deprecation/migration ADR; renaming by default
  is not on the table.
