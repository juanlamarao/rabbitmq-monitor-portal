from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.cluster import RabbitMQCluster
from app.models.component import RabbitMQQueue
from app.models.monitor_template import QueueMonitorTemplate
from app.schemas.public_reference import PublicAppliedTemplateRead, PublicQueueReferenceRead
from app.services.template_service import merge_effective_config


def get_public_queue_reference(db: Session, *, rabbitmq_cluster: str, vhost: str, queue: str) -> PublicQueueReferenceRead:
    stmt = (
        select(RabbitMQQueue)
        .join(RabbitMQQueue.cluster)
        .where(
            or_(RabbitMQCluster.name == rabbitmq_cluster, RabbitMQCluster.datadog_cluster_tag_value == rabbitmq_cluster),
            RabbitMQQueue.vhost == vhost,
            RabbitMQQueue.name == queue,
        )
        .options(
            selectinload(RabbitMQQueue.cluster).selectinload(RabbitMQCluster.sre_group),
            selectinload(RabbitMQQueue.template_bindings).selectinload(QueueMonitorTemplate.template),
        )
    )
    queue_obj = db.scalar(stmt)
    if not queue_obj:
        raise HTTPException(status_code=404, detail="Queue não encontrada no portal para os parâmetros informados.")

    cluster = queue_obj.cluster
    sre_group = cluster.sre_group
    sre_members = [member.email for member in getattr(sre_group, "members", [])] if sre_group else []
    applied_templates = []
    for binding in queue_obj.template_bindings or []:
        template = binding.template
        if not template:
            continue
        applied_templates.append(
            PublicAppliedTemplateRead(
                binding_id=binding.id,
                template_id=template.id,
                code=template.code,
                name=template.name,
                enabled=binding.enabled,
                is_customized=bool(binding.overrides),
                effective_config=merge_effective_config(template, binding.overrides),
                overrides=binding.overrides or None,
            )
        )

    return PublicQueueReferenceRead(
        cluster_id=cluster.id,
        cluster_name=cluster.name,
        rabbitmq_cluster_tag=cluster.datadog_cluster_tag_value or cluster.name,
        environment=cluster.environment,
        business_line=cluster.business_line,
        vhost=queue_obj.vhost,
        queue=queue_obj.name,
        type=queue_obj.type,
        state=queue_obj.state,
        service_name=queue_obj.service_name,
        criticality=queue_obj.criticality,
        owner_email=queue_obj.owner_email,
        sre_group_name=sre_group.name if sre_group else None,
        sre_group_members=sre_members,
        dev_emails=queue_obj.dev_emails or [],
        journey=queue_obj.journey,
        description=queue_obj.description,
        monitoring_schedule=queue_obj.monitoring_schedule,
        is_removed=queue_obj.is_removed,
        removed_at=queue_obj.removed_at,
        discovered_at=queue_obj.discovered_at,
        updated_at=queue_obj.updated_at,
        applied_templates=applied_templates,
    )
