#!/usr/bin/env bash
set -euo pipefail
cd /workspace/Assessment-Reports
command -v pdftoppm >/dev/null || { echo "Install Poppler (poppler-utils) for PDF regression checks." >&2; exit 1; }
node scripts/init-env.mjs
npm ci --ignore-scripts
npm run generate
docker compose up -d --wait
docker compose exec -T postgres psql -U assessment_owner -d assessment -v ON_ERROR_STOP=1 < scripts/db-init.sql
npm run db:migrate
npm run db:seed
npm run build
