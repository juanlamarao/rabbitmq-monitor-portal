#!/usr/bin/env sh

set -eu

QUEUE_NAME="${1:-}"
VHOST="${2:-/}"
RABBITMQ_API_URL="${RABBITMQ_API_URL:-http://localhost:15672/api}"
RABBITMQ_USER="${RABBITMQ_USER:-guest}"
RABBITMQ_PASS="${RABBITMQ_PASS:-guest}"

if [ -z "${QUEUE_NAME}" ]; then
  echo "Uso: $0 <nome-da-fila> [vhost]" >&2
  echo "Exemplo: $0 demo.orders.created /" >&2
  exit 1
fi

urlencode() {
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"
  else
    # Fallback simples para o vhost default. Para nomes com caracteres especiais,
    # prefira executar em um host que possua python3.
    printf '%s' "$1" | sed 's#/#%2F#g; s# #%20#g'
  fi
}

VHOST_ENCODED="$(urlencode "${VHOST}")"
QUEUE_ENCODED="$(urlencode "${QUEUE_NAME}")"
QUEUE_URL="${RABBITMQ_API_URL}/queues/${VHOST_ENCODED}/${QUEUE_ENCODED}"

echo "Removendo fila '${QUEUE_NAME}' do vhost '${VHOST}' em ${RABBITMQ_API_URL}..."

HTTP_STATUS="$(curl -sS -u "${RABBITMQ_USER}:${RABBITMQ_PASS}" \
  -o /tmp/rabbitmq-delete-queue-response.txt \
  -w '%{http_code}' \
  -X DELETE \
  "${QUEUE_URL}")"

if [ "${HTTP_STATUS}" = "204" ]; then
  echo "Fila removida com sucesso."
  echo "Execute um discovery no portal para validar a marcação como removida."
  exit 0
fi

if [ "${HTTP_STATUS}" = "404" ]; then
  echo "Fila não encontrada no RabbitMQ. Nada foi removido."
  exit 0
fi

echo "Falha ao remover fila. HTTP ${HTTP_STATUS}" >&2
cat /tmp/rabbitmq-delete-queue-response.txt >&2 || true
exit 1
