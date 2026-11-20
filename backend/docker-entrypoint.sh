#!/bin/sh
set -eu

UPLOAD_DIRECTORY="${UPLOAD_DIR:-/app/uploads}"
mkdir -p "$UPLOAD_DIRECTORY"
chown -R node:node "$UPLOAD_DIRECTORY"

exec gosu node "$@"
