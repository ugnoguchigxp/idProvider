#!/usr/bin/env bash
set -euo pipefail

TARGET=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --to)
      TARGET="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [ -z "${TARGET}" ]; then
  echo "Usage: $0 --to <online|standby>" >&2
  exit 1
fi

if [ "${TARGET}" != "online" ] && [ "${TARGET}" != "standby" ]; then
  echo "Invalid target '${TARGET}'. Expected 'online' or 'standby'." >&2
  exit 1
fi

if [ -z "${DEPLOY_USER:-}" ] || [ -z "${ONLINE_HOST:-}" ]; then
  echo "DEPLOY_USER and ONLINE_HOST are required." >&2
  exit 1
fi

SWITCH_TRAFFIC_COMMAND="${SWITCH_TRAFFIC_COMMAND:-}"
if [ -z "${SWITCH_TRAFFIC_COMMAND}" ]; then
  echo "SWITCH_TRAFFIC_COMMAND is required. Example: /usr/local/bin/switch_upstream ${TARGET}" >&2
  exit 1
fi

ssh "${DEPLOY_USER}@${ONLINE_HOST}" "set -euo pipefail; ${SWITCH_TRAFFIC_COMMAND} ${TARGET}"
