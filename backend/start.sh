#!/bin/sh
set -e
npx prisma db push
npm run seed
exec node dist/src/server.js
