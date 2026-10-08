#!/bin/sh
# Apply pending database migrations, add starter data on a fresh install, then start the web server.
set -e
cd /app/packages/db
node_modules/.bin/prisma migrate deploy
node_modules/.bin/tsx prisma/seed.ts
cd /app/apps/web
exec node_modules/.bin/next start -p "${PORT:-3000}"
