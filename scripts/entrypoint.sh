#!/bin/sh
set -eu
if [ -f /secrets/env ]; then
  set -a
  . /secrets/env
  set +a
fi
exec node server.js
