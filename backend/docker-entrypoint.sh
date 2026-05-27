#!/bin/sh
set -e

cd /app

echo "[entrypoint] Running migrations..."
npx knex migrate:latest

echo "[entrypoint] Migrations completed. Starting application: $*"
exec "$@"
