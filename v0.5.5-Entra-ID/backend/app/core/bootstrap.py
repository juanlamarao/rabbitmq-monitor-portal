from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.datadog_org import DatadogOrg
from app.models.monitor_template import MonitorTemplate
from app.models.sre_group import SREGroup

QUEUE_TEMPLATES = [
    {
        "code": "queue_messages_above_threshold",
        "name": "Fila com quantidade de mensagens acima de threshold",
        "description": "Alerta quando a quantidade de mensagens na fila ultrapassar o threshold configurado.",
        "component_type": "queue",
        "monitor_kind": "threshold",

        "datadog_monitor_type": "query alert",
        "datadog_query_template": 'max(last_{{window}}):max:{{metric_messages}}{ {{datadog_scope}} } > {{threshold}}',
        "datadog_message_template": '{{#is_alert}}\n🚨 RabbitMQ Queue em alerta\n\nCluster: {{rabbitmq_cluster.name}}\nVhost: {{vhost.name}}\nQueue: {{queue.name}}\n\nDetalhes da fila: {{public_reference_url}}\n{{/is_alert}}\n\n{{#is_recovery}}\n✅ RabbitMQ Queue recuperada\n\nCluster: {{rabbitmq_cluster.name}}\nVhost: {{vhost.name}}\nQueue: {{queue.name}}\n{{/is_recovery}}',
        "datadog_tags_template": ['managed_by:rabbitmq-monitor-portal', 'component:queue', 'provider:datadog', 'template:{{template_code}}'],
        "datadog_options": {'include_tags': True, 'notify_no_data': False, 'require_full_window': False},
        "default_config": {"threshold": 5000, "window": "15m", "business_days_only": False},
    },
    {
        "code": "queue_dlq_messages_above_threshold",
        "name": "Fila DLQ com mensagens acima de threshold",
        "description": "Alerta para filas DLQ quando houver mensagens acima do limite configurado.",
        "component_type": "queue",
        "monitor_kind": "dlq_threshold",

        "datadog_monitor_type": "query alert",
        "datadog_query_template": 'max(last_{{window}}):max:{{metric_messages}}{ {{datadog_scope}} } > {{threshold}}',
        "datadog_message_template": '{{#is_alert}}\n🚨 RabbitMQ Queue em alerta\n\nCluster: {{rabbitmq_cluster.name}}\nVhost: {{vhost.name}}\nQueue: {{queue.name}}\n\nDetalhes da fila: {{public_reference_url}}\n{{/is_alert}}\n\n{{#is_recovery}}\n✅ RabbitMQ Queue recuperada\n\nCluster: {{rabbitmq_cluster.name}}\nVhost: {{vhost.name}}\nQueue: {{queue.name}}\n{{/is_recovery}}',
        "datadog_tags_template": ['managed_by:rabbitmq-monitor-portal', 'component:queue', 'provider:datadog', 'template:{{template_code}}'],
        "datadog_options": {'include_tags': True, 'notify_no_data': False, 'require_full_window': False},
        "default_config": {"threshold": 0, "window": "15m", "business_days_only": False},
    },
    {
        "code": "queue_messages_low_consumers",
        "name": "Fila com mensagens e baixo consumidores",
        "description": "Alerta quando houver mensagens e consumidores abaixo do mínimo configurado.",
        "component_type": "queue",
        "monitor_kind": "messages_low_consumers",

        "datadog_monitor_type": "query alert",
        "datadog_query_template": None,
        "datadog_message_template": '{{#is_alert}}\n🚨 RabbitMQ Queue em alerta\n\nCluster: {{rabbitmq_cluster.name}}\nVhost: {{vhost.name}}\nQueue: {{queue.name}}\n\nDetalhes da fila: {{public_reference_url}}\n{{/is_alert}}\n\n{{#is_recovery}}\n✅ RabbitMQ Queue recuperada\n\nCluster: {{rabbitmq_cluster.name}}\nVhost: {{vhost.name}}\nQueue: {{queue.name}}\n{{/is_recovery}}',
        "datadog_tags_template": ['managed_by:rabbitmq-monitor-portal', 'component:queue', 'provider:datadog', 'template:{{template_code}}'],
        "datadog_options": {'include_tags': True, 'notify_no_data': False, 'require_full_window': False},
        "default_config": {"messages_threshold": 1, "consumers_threshold": 0, "window": "15m", "business_days_only": False},
    },
    {
        "code": "queue_growing_messages",
        "name": "Fila com mensagens crescentes",
        "description": "Alerta quando a quantidade de mensagens crescer durante a janela configurada.",
        "component_type": "queue",
        "monitor_kind": "growing_messages",

        "datadog_monitor_type": "query alert",
        "datadog_query_template": 'change(avg(last_{{window}}),last_{{window}}):max:{{metric_messages}}{ {{datadog_scope}} } > 0',
        "datadog_message_template": '{{#is_alert}}\n🚨 RabbitMQ Queue em alerta\n\nCluster: {{rabbitmq_cluster.name}}\nVhost: {{vhost.name}}\nQueue: {{queue.name}}\n\nDetalhes da fila: {{public_reference_url}}\n{{/is_alert}}\n\n{{#is_recovery}}\n✅ RabbitMQ Queue recuperada\n\nCluster: {{rabbitmq_cluster.name}}\nVhost: {{vhost.name}}\nQueue: {{queue.name}}\n{{/is_recovery}}',
        "datadog_tags_template": ['managed_by:rabbitmq-monitor-portal', 'component:queue', 'provider:datadog', 'template:{{template_code}}'],
        "datadog_options": {'include_tags': True, 'notify_no_data': False, 'require_full_window': False},
        "default_config": {"window": "15m", "business_days_only": False},
    },
    {
        "code": "queue_without_messages",
        "name": "Fila sem mensagens",
        "description": "Alerta quando a fila permanecer sem mensagens durante a janela configurada.",
        "component_type": "queue",
        "monitor_kind": "without_messages",

        "datadog_monitor_type": "query alert",
        "datadog_query_template": 'max(last_{{window}}):max:{{metric_messages}}{ {{datadog_scope}} } < 1',
        "datadog_message_template": '{{#is_alert}}\n🚨 RabbitMQ Queue em alerta\n\nCluster: {{rabbitmq_cluster.name}}\nVhost: {{vhost.name}}\nQueue: {{queue.name}}\n\nDetalhes da fila: {{public_reference_url}}\n{{/is_alert}}\n\n{{#is_recovery}}\n✅ RabbitMQ Queue recuperada\n\nCluster: {{rabbitmq_cluster.name}}\nVhost: {{vhost.name}}\nQueue: {{queue.name}}\n{{/is_recovery}}',
        "datadog_tags_template": ['managed_by:rabbitmq-monitor-portal', 'component:queue', 'provider:datadog', 'template:{{template_code}}'],
        "datadog_options": {'include_tags': True, 'notify_no_data': False, 'require_full_window': False},
        "default_config": {"window": "15m", "business_days_only": False},
    },
]


def seed_initial_data(db: Session) -> None:
    if not db.scalar(select(SREGroup).where(SREGroup.name == "SRE Default")):
        db.add(SREGroup(name="SRE Default", description="Grupo SRE inicial para ambiente local.", is_active=True))

    if not db.scalar(select(DatadogOrg).where(DatadogOrg.name == "Datadog Default")):
        db.add(
            DatadogOrg(
                name="Datadog Default",
                api_url="https://api.datadoghq.com",
                org_url=None,
                description="Org Datadog inicial para vincular clusters.",
                is_active=True,
            )
        )

    for item in QUEUE_TEMPLATES:
        template = db.scalar(select(MonitorTemplate).where(MonitorTemplate.code == item["code"]))
        if not template:
            db.add(MonitorTemplate(**item, is_system=True, is_active=True))
        else:
            # Não sobrescreve customizações do usuário; preenche apenas campos Datadog ainda vazios.
            changed = False
            for field in (
                "datadog_monitor_type",
                "datadog_query_template",
                "datadog_message_template",
                "datadog_tags_template",
                "datadog_options",
            ):
                if getattr(template, field, None) in (None, [], {}):
                    setattr(template, field, item.get(field))
                    changed = True

    db.commit()
