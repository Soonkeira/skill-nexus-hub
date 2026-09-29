# ADR-0004: Backend tests run on in-memory SQLite with type patching

Status: Accepted
Date: 2026-09

## Context

CI must run the backend test suite (160+ tests) quickly and without external
services. Real PostgreSQL in CI would slow the loop and complicate self-service
contributions, but the models use PostgreSQL-specific column types (UUID, JSONB).

## Decision

`backend/tests/conftest.py` patches column types after model import — `UUID` columns
are swapped for a `TypeDecorator` storing `String(36)`, `JSONB` for `JSON` — and the
suite runs against in-memory SQLite via `aiosqlite` with a dependency-overridden
session. An additional autouse `isolated_data_dir` fixture points
`settings.data_dir` at a per-test temp directory: the default `/data/skills` is
unwritable on Linux CI (file uploads would 500) and would pollute Windows dev
machines with a drive-relative path.

## Consequences

- The suite runs in seconds without a database service container.
- Some PostgreSQL-specific behavior is untested (native UUID indexes, JSONB
  operators, transactional DDL); migrations are validated against real PostgreSQL in
  deployment, not in the unit suite.
- SQLite does not enforce `ON DELETE SET NULL`; features relying on FK behavior must
  be checked against production PostgreSQL.
- New PostgreSQL-only column types need an entry in `_patch_types_for_sqlite()` or
  tests will fail at `create_all`.
