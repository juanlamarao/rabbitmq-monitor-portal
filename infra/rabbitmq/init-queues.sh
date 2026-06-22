#!/bin/sh

set -eu

RABBITMQ_API_URL="http://rabbitmq:15672/api"
RABBITMQ_USER="guest"
RABBITMQ_PASS="guest"
RABBITMQ_VHOST="%2F"

echo "Aguardando RabbitMQ Management API ficar disponível..."

until curl -fsS -u "${RABBITMQ_USER}:${RABBITMQ_PASS}" "${RABBITMQ_API_URL}/overview" > /dev/null; do
  echo "RabbitMQ ainda não está pronto. Tentando novamente..."
  sleep 3
done

echo "RabbitMQ disponível. Criando filas de validação..."

create_queue() {
  QUEUE_NAME="$1"

  echo "Criando fila: ${QUEUE_NAME}"

  curl -fsS -u "${RABBITMQ_USER}:${RABBITMQ_PASS}" \
    -H "content-type: application/json" \
    -X PUT \
    "${RABBITMQ_API_URL}/queues/${RABBITMQ_VHOST}/${QUEUE_NAME}" \
    -d '{
      "durable": true,
      "auto_delete": false,
      "arguments": {}
    }' > /dev/null
}

create_queue "demo.orders.created"
create_queue "demo.orders.cancelled"
create_queue "demo.orders.payment.pending"
create_queue "demo.orders.payment.approved"
create_queue "demo.orders.payment.failed"

create_queue "demo.customers.created"
create_queue "demo.customers.updated"
create_queue "demo.customers.deleted"

create_queue "demo.notifications.email"
create_queue "demo.notifications.sms"
create_queue "demo.notifications.push"

create_queue "demo.billing.invoice.created"
create_queue "demo.billing.invoice.paid"
create_queue "demo.billing.invoice.overdue"

create_queue "demo.deadletter.default"

echo "Criando exchange demo.direct..."

curl -fsS -u "${RABBITMQ_USER}:${RABBITMQ_PASS}" \
  -H "content-type: application/json" \
  -X PUT \
  "${RABBITMQ_API_URL}/exchanges/${RABBITMQ_VHOST}/demo.direct" \
  -d '{
    "type": "direct",
    "durable": true,
    "auto_delete": false,
    "internal": false,
    "arguments": {}
  }' > /dev/null

echo "Criando bindings das filas na exchange demo.direct..."

bind_queue() {
  QUEUE_NAME="$1"
  ROUTING_KEY="$2"

  echo "Binding: ${QUEUE_NAME} <- ${ROUTING_KEY}"

  curl -fsS -u "${RABBITMQ_USER}:${RABBITMQ_PASS}" \
    -H "content-type: application/json" \
    -X POST \
    "${RABBITMQ_API_URL}/bindings/${RABBITMQ_VHOST}/e/demo.direct/q/${QUEUE_NAME}" \
    -d "{
      \"routing_key\": \"${ROUTING_KEY}\",
      \"arguments\": {}
    }" > /dev/null
}

bind_queue "demo.orders.created" "orders.created"
bind_queue "demo.orders.cancelled" "orders.cancelled"
bind_queue "demo.orders.payment.pending" "orders.payment.pending"
bind_queue "demo.orders.payment.approved" "orders.payment.approved"
bind_queue "demo.orders.payment.failed" "orders.payment.failed"

bind_queue "demo.customers.created" "customers.created"
bind_queue "demo.customers.updated" "customers.updated"
bind_queue "demo.customers.deleted" "customers.deleted"

bind_queue "demo.notifications.email" "notifications.email"
bind_queue "demo.notifications.sms" "notifications.sms"
bind_queue "demo.notifications.push" "notifications.push"

bind_queue "demo.billing.invoice.created" "billing.invoice.created"
bind_queue "demo.billing.invoice.paid" "billing.invoice.paid"
bind_queue "demo.billing.invoice.overdue" "billing.invoice.overdue"

bind_queue "demo.deadletter.default" "deadletter.default"

echo "Publicando mensagens de exemplo..."

publish_message() {
  ROUTING_KEY="$1"
  MESSAGE="$2"

  curl -fsS -u "${RABBITMQ_USER}:${RABBITMQ_PASS}" \
    -H "content-type: application/json" \
    -X POST \
    "${RABBITMQ_API_URL}/exchanges/${RABBITMQ_VHOST}/demo.direct/publish" \
    -d "{
      \"properties\": {},
      \"routing_key\": \"${ROUTING_KEY}\",
      \"payload\": \"${MESSAGE}\",
      \"payload_encoding\": \"string\"
    }" > /dev/null
}

publish_message "orders.created" "{\"event\":\"orders.created\",\"order_id\":\"1001\"}"
publish_message "orders.payment.pending" "{\"event\":\"orders.payment.pending\",\"order_id\":\"1001\"}"
publish_message "notifications.email" "{\"event\":\"notifications.email\",\"target\":\"user@example.com\"}"
publish_message "billing.invoice.created" "{\"event\":\"billing.invoice.created\",\"invoice_id\":\"INV-1001\"}"
publish_message "deadletter.default" "{\"event\":\"deadletter.default\",\"reason\":\"demo message\"}"

echo "RabbitMQ demo inicializado com sucesso."
echo "Management UI: http://localhost:15672"
echo "Usuário: guest"
echo "Senha: guest"
