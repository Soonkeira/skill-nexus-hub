# ADR-0003: CLI shipped as PyInstaller one-file binaries with the snh:// URL protocol

Status: Accepted
Date: 2026-09

## Context

One-click install from the browser needs a local executable that a custom URL scheme
can wake. Users should not need a Python environment, and intranet servers must serve
the installer without access to external package indexes.

## Decision

The `snh` CLI (Typer + httpx + Rich) ships as PyInstaller single-file binaries, built
per OS and named `snh.exe` / `snh-linux` / `snh-macos`. The backend serves them from
`data/cli` via `/api/cli/download/<platform>` (packaged as a ZIP with a preconfigured
`snh.conf`), and release builds publish the same three assets to GitHub Releases — a
contract between the CLI build, the backend download endpoint, and the release
pipeline. On Windows, CLI installation registers the `snh://` custom URL protocol
(`HKCU\SOFTWARE\Classes\snh`), letting the web console hand off install requests
(`snh://install?token=…&owner=…&slug=…&target=…`) directly to the local binary.

## Consequences

- Non-technical users install skills without touching a terminal; no Python runtime
  is required on user machines.
- Custom URL protocol registration is currently Windows-only; macOS (app bundles)
  and Linux (.desktop entries) registration remain future work.
- The `snh` identifiers (binary names, `snh://` scheme, `snh_` token prefix) are
  frozen because they are registered in the OS and baked into install targets.
- URL parameters currently include the browser's short-lived JWT, which the CLI
  exchanges for a long-lived API token; browser history keeps the URL.
