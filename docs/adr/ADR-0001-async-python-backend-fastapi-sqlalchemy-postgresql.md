# ADR-0001: Async Python backend with FastAPI, SQLAlchemy 2.0, and PostgreSQL 16

Status: Accepted
Date: 2026-09

## Context

The backend serves file uploads/downloads for skill packages, admin review flows, and a
public API consumed by a browser app and a CLI. The team's strongest skills are in
Python, and the deployment target is self-hosted intranet servers (Docker Compose).

## Decision

Build the backend on FastAPI with Uvicorn (async), SQLAlchemy 2.0 typed ORM (async
engine + `AsyncSession`), and PostgreSQL 16, with Alembic for schema migrations.
FastAPI gives Pydantic-validated request/response schemas and OpenAPI for free;
the async stack keeps file streaming and concurrent uploads efficient; SQLAlchemy 2.0
provides a typed, refactor-safe ORM layer; Alembic keeps the schema evolution
reproducible across upgrades (the schema history is a linear migration chain).

## Consequences

- All database access is async (`aiosqlite` in tests, `asyncpg` in production), which
  is consistent but forces async-aware tooling throughout.
- Self-hosters run one extra container (PostgreSQL) compared to an embedded database.
- The typed ORM plus Pydantic schemas split domain logic the same way the API surface
  does, so new endpoints follow a repeatable pattern.
