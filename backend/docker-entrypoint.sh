#!/bin/sh
set -e

if [ "${SKIP_DB_PUSH:-false}" = "true" ]; then
  echo "Skipping Prisma db push (SKIP_DB_PUSH=true)."
else
  echo "Applying database schema..."
  npx prisma db push --skip-generate
fi

if [ "${RUN_SEED}" = "true" ]; then
  echo "Seeding database..."
  npx ts-node --transpile-only prisma/seed.ts || echo "WARN: seed skipped or failed"
fi

exec node dist/main.js
