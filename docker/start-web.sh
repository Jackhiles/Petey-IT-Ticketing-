#!/bin/sh
# Apply pending database migrations, then start the web server.
set -e
cd /app/packages/db
node_modules/.bin/prisma migrate deploy
cd /app/apps/web
exec node_modules/.bin/next start -p "${PORT:-3000}"
