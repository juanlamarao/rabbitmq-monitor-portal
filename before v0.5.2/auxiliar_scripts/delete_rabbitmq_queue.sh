#!/usr/bin/env sh

set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_DIR="$(dirname "${SCRIPT_DIR}")"
exec "${PROJECT_DIR}/infra/rabbitmq/delete-queue.sh" "$@"
