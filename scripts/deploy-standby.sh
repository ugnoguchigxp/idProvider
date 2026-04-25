#!/usr/bin/env bash
set -euo pipefail

if [ -z "${DEPLOY_USER:-}" ] || [ -z "${STANDBY_HOST:-}" ]; then
  echo "DEPLOY_USER and STANDBY_HOST are required." >&2
  exit 1
fi

REMOTE_DEPLOY_COMMAND="${REMOTE_DEPLOY_COMMAND:-}"
if [ -z "${REMOTE_DEPLOY_COMMAND}" ]; then
  echo "REMOTE_DEPLOY_COMMAND is required to avoid hardcoded host-specific deployment logic." >&2
  exit 1
fi

ssh "${DEPLOY_USER}@${STANDBY_HOST}" "set -euo pipefail; ${REMOTE_DEPLOY_COMMAND}"
