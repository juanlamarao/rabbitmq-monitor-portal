# API

Base local:

```text
http://localhost:8000
```

## Health

- `GET /health`

## Administração

- `GET /admin/sre-groups`
- `POST /admin/sre-groups`
- `PUT /admin/sre-groups/{group_id}`
- `GET /admin/datadog-orgs`
- `POST /admin/datadog-orgs`
- `PUT /admin/datadog-orgs/{org_id}`

## Clusters

- `GET /clusters`
- `POST /clusters`
- `GET /clusters/{cluster_id}`
- `PUT /clusters/{cluster_id}`
- `POST /clusters/{cluster_id}/test-connection`
- `POST /clusters/{cluster_id}/discover-queues`

O discovery usa a RabbitMQ Management API:

```http
GET /api/queues/?enable_queue_totals=true&disable_stats=true
```

## Queues

- `GET /components/queues`
- `GET /components/queues?include_removed=true`
- `GET /components/queues?cluster_id=1&search=orders`
- `PUT /components/queues/{queue_id}`

## Templates

- `GET /templates`
- `GET /templates?component_type=queue`

## Jobs

- `GET /jobs`

## Audit Log

- `GET /audit-logs`
