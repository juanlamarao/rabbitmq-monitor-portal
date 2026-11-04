#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -lt 1 ]; then echo "Uso: $0 <namespace> [porta-local=3307]"; exit 2; fi
NS="$1"
PORT="${2:-3307}"
echo "Contexto: $(kubectl config current-context)"
kubectl -n "$NS" get svc rabbitmq-monitor-mysql
printf 'Acessar 127.0.0.1:%s (Ctrl+C encerra)\n' "$PORT"
kubectl -n "$NS" port-forward svc/rabbitmq-monitor-mysql "${PORT}:3306"
