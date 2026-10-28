#!/bin/sh
set -e

apply_schema() {
  echo "Applying database schema..."
  if npx prisma db push --skip-generate; then
    return 0
  fi
  echo "WARN: prisma db push failed (exit $?). Retrying once after 5s..."
  sleep 5
  npx prisma db push --skip-generate
}

if [ "${SKIP_DB_PUSH:-false}" = "true" ]; then
  echo "Skipping Prisma db push (SKIP_DB_PUSH=true)."
else
  apply_schema
fi

if [ "${RUN_SEED}" = "true" ]; then
  echo "Seeding database..."
  npx ts-node --transpile-only prisma/seed.ts || echo "WARN: seed skipped or failed"
fi

exec node dist/main.js
