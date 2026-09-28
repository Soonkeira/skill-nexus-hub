#!/usr/bin/env bash
# Local CI — mirrors what the CI pipeline runs. Use before pushing.
# Usage: bash scripts/ci.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "===> [1/4] Backend: ruff lint (optional, non-fatal if ruff missing) =="
if command -v ruff >/dev/null 2>&1; then
  ruff check backend/app || echo "  ruff issues found (non-fatal in this script)"
else
  echo "  ruff not installed; skipping lint"
fi

echo "===> [2/4] Backend: pytest =="
cd backend
python -m pytest -q || { echo "Backend tests failed"; exit 1; }
cd "$ROOT_DIR"

echo "===> [3/4] Frontend: install deps (if needed) =="
if [ ! -d frontend/node_modules ]; then
  (cd frontend && npm ci)
fi

echo "===> [4/4] Frontend: type-check + build =="
cd frontend
npx tsc --noEmit || { echo "Type-check failed"; exit 1; }
npm run build || { echo "Build failed"; exit 1; }
cd "$ROOT_DIR"

echo ""
echo "All CI steps passed."
