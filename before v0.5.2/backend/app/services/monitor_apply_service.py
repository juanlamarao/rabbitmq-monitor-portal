from copy import deepcopy
from typing import Any

from app.models.monitor_template import QueueMonitorTemplate


def calculate_effective_template_config(binding: QueueMonitorTemplate) -> dict[str, Any]:
    """Herança dinâmica: template atual + overrides locais da fila."""
    config = deepcopy(binding.template.default_config or {})
    overrides = binding.overrides or {}
    config.update(overrides)
    return config
