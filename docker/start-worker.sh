#!/bin/sh
# Start the background job worker.
set -e
cd /app/apps/worker
exec node_modules/.bin/tsx src/index.ts
