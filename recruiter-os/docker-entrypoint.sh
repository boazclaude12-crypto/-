#!/bin/sh
set -e

# Managed hosts (Railway, Render, Fly) attach the data volume as root, which would
# leave the unprivileged app user unable to create the database. Take ownership once
# here — after the mount exists, which a Dockerfile RUN cannot do — then drop back
# to that user for the process itself.
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/data
  chown -R node:node /app/data
  exec su-exec node "$@"
fi

exec "$@"
