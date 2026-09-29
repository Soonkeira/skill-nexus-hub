# ADR-0005: Skill review workflow and the latest-version pointer

Status: Accepted
Date: 2026-09

## Context

Skills are published as versions by any user; without review, broken or malicious
packages would reach every installer immediately. A skill also needs a stable
"latest" pointer so detail pages and CLI updates resolve to exactly one version.

## Decision

Every new version enters `pending` status and only becomes publicly usable when an
admin approves it (or records a rejection with a reason). `skill.latest_version_id`
is a pointer with defined semantics: it advances only when a `pending` version is
approved AND that version is the most recently created approved version of the skill
— re-approving an old version never moves the pointer backwards. When the version
currently holding the pointer is rejected, the pointer is repointed to the next most
recent approved version (or cleared when none remains); rejecting a non-latest
version leaves the pointer untouched.

## Consequences

- Users can publish safely knowing nothing becomes public until review.
- Rejected versions appear nowhere as "latest", but the skill keeps its latest
  approved version even after its newest submission is bounced.
- The pointer rule is enforced in `backend/app/api/versions.py` approve/reject flows
  and covered by `backend/tests/test_versions.py`.
- "Latest" means latest by creation time among approved versions, not by
  re-review time; a re-approved old version can never roll the pointer back.
