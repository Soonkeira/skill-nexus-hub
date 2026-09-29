# ADR-0002: Next.js App Router frontend with middleware-based auth guard

Status: Accepted
Date: 2026-09

## Context

The web console needs authenticated views (marketplace, skill detail, publish, admin
console) and must deploy as one self-hosted unit on intranet servers, without a
separate SPA static-server setup.

## Decision

Use Next.js (App Router) with TypeScript and Tailwind CSS v4 for the web console.
Route protection is enforced in `frontend/src/middleware.ts`: unauthenticated
visitors to protected paths are redirected. The app builds with Next.js standalone
output into a single deployable, proxied behind the frontend container so the whole
stack is reachable on one port (9527).

## Consequences

- One deployable serves UI and API routing through one port, which suits the
  intranet, no-domain deployment mode.
- TypeScript strict mode plus `npx tsc --noEmit` in CI catches contract drift
  between the frontend API types and backend responses.
- Route protection lives in middleware, which is a guard for UX, not a security
  boundary — the backend independently enforces auth on every API route.
- App Router and middleware behavior are pinned by the Next.js major version;
  upgrades need to re-verify both.
