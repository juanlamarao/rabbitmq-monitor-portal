import { PlaylistAddCheck, Refresh } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { MultiPersonEmailAutocomplete, SinglePersonEmailAutocomplete } from '../components/PersonEmailAutocomplete';
import { apiRequest } from '../services/api';
import {
  Cluster,
  MonitorTemplate,
  MonitoringSchedule,
  QueueBulkAction,
  QueueBulkApplyResult,
  QueueBulkFilter,
  QueueBulkPreview,
  QueueCriticality,
} from '../types/api';

type ActionState = {
  action: QueueBulkAction;
  template_id: string;
  overrides_json: string;
  enabled: string;
  description: string;
  criticality: string;
  owner_email: string;
  journey: string;
  service_name: string;
  monitoring_schedule: string;
  monitoring_custom_window: string;
  dev_emails: string[];
};

const criticalityOptions: QueueCriticality[] = ['none', 'low', 'medium', 'high', 'critical'];
const scheduleOptions: MonitoringSchedule[] = ['24x7', 'business_hour', 'seg-sex', 'custom'];

const initialActionState: ActionState = {
  action: 'apply_template',
  template_id: '',
  overrides_json: '{}',
  enabled: 'true',
  description: '',
  criticality: '',
  owner_email: '',
  journey: '',
  service_name: '',
  monitoring_schedule: '',
  monitoring_custom_window: '',
  dev_emails: [],
};

function normalizeEmpty(value: string) {
  return value.trim() ? value.trim() : null;
}

function formatTemplates(templates: Array<{ code: string; is_customized: boolean; enabled: boolean }>) {
  if (!templates.length) return <Typography variant="caption" color="text.secondary">Sem templates</Typography>;
  return (
    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
      {templates.map((template) => (
        <Chip
          key={template.code}
          label={`${template.code}${template.is_customized ? ' *' : ''}`}
          size="small"
          color={template.is_customized ? 'warning' : template.enabled ? 'default' : 'secondary'}
          variant={template.enabled ? 'filled' : 'outlined'}
        />
      ))}
    </Stack>
  );
}

function parseOverrides(jsonText: string): Record<string, unknown> | null {
  const clean = jsonText.trim();
  if (!clean || clean === '{}') return null;
  const parsed = JSON.parse(clean);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Overrides precisa ser um objeto JSON, por exemplo {"threshold": 1000}.');
  }
  return parsed as Record<string, unknown>;
}

export default function BulkActionsPage() {
  const [filters, setFilters] = useState<QueueBulkFilter>({ sample_limit: 200 });
  const [selectedQueueIds, setSelectedQueueIds] = useState<number[]>([]);
  const [preview, setPreview] = useState<QueueBulkPreview | null>(null);
  const [actionState, setActionState] = useState<ActionState>(initialActionState);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QueueBulkApplyResult | null>(null);

  const { data: clusters = [] } = useQuery({ queryKey: ['clusters'], queryFn: () => apiRequest<Cluster[]>('/clusters') });
  const { data: templates = [] } = useQuery({ queryKey: ['templates', 'queue'], queryFn: () => apiRequest<MonitorTemplate[]>('/templates?component_type=queue') });

  const selectedTemplate = useMemo(
    () => templates.find((template) => String(template.id) === actionState.template_id),
    [templates, actionState.template_id],
  );

  const previewMutation = useMutation({
    mutationFn: () => apiRequest<QueueBulkPreview>('/components/queues/bulk/preview', {
      method: 'POST',
      body: JSON.stringify({ filters }),
    }),
    onSuccess: (data) => {
      setPreview(data);
      setSelectedQueueIds([]);
      setError(null);
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Erro ao carregar prévia'),
  });

  const applyMutation = useMutation({
    mutationFn: () => {
      const applyFilters = selectedQueueIds.length > 0 ? { ...filters, queue_ids: selectedQueueIds } : filters;
      const body: Record<string, unknown> = {
        filters: applyFilters,
        action: actionState.action,
      };

      if (actionState.action === 'update_metadata') {
        const metadata: Record<string, unknown> = {};
        if (actionState.description.trim()) metadata.description = actionState.description.trim();
        if (actionState.criticality) metadata.criticality = actionState.criticality;
        if (actionState.owner_email.trim()) metadata.owner_email = actionState.owner_email.trim();
        if (actionState.journey.trim()) metadata.journey = actionState.journey.trim();
        if (actionState.service_name.trim()) metadata.service_name = actionState.service_name.trim();
        if (actionState.monitoring_schedule) metadata.monitoring_schedule = actionState.monitoring_schedule;
        if (actionState.monitoring_custom_window.trim()) metadata.monitoring_custom_window = actionState.monitoring_custom_window.trim();
        if (actionState.dev_emails.length > 0) {
          metadata.dev_emails = actionState.dev_emails;
        }
        body.metadata = metadata;
      }

      if (actionState.action !== 'update_metadata') {
        body.template_id = Number(actionState.template_id);
      }
      if (actionState.action === 'apply_template' || actionState.action === 'update_template_overrides') {
        body.overrides = parseOverrides(actionState.overrides_json);
      }
      if (actionState.action === 'set_template_enabled') {
        body.enabled = actionState.enabled === 'true';
      }

      return apiRequest<QueueBulkApplyResult>('/components/queues/bulk/apply', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
    onSuccess: (data) => {
      setResult(data);
      setError(null);
      previewMutation.mutate();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Erro ao aplicar ação em massa'),
  });

  function setFilter<K extends keyof QueueBulkFilter>(key: K, value: QueueBulkFilter[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function toggleSelected(queueId: number) {
    setSelectedQueueIds((current) => (current.includes(queueId) ? current.filter((id) => id !== queueId) : [...current, queueId]));
  }

  function toggleAllVisible() {
    if (!preview) return;
    const visibleIds = preview.queues.map((queue) => queue.id);
    const allVisibleSelected = visibleIds.every((id) => selectedQueueIds.includes(id));
    setSelectedQueueIds(allVisibleSelected ? selectedQueueIds.filter((id) => !visibleIds.includes(id)) : Array.from(new Set([...selectedQueueIds, ...visibleIds])));
  }

  function canApply() {
    if (!preview || preview.matched_count === 0) return false;
    if (actionState.action !== 'update_metadata' && !actionState.template_id) return false;
    return true;
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" fontWeight={800}>Edição em massa</Typography>
        <Typography color="text.secondary">Filtre queues, valide a prévia e aplique alterações em lote com audit log.</Typography>
      </Box>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      {result && (
        <Alert severity="success" onClose={() => setResult(null)}>
          Ação aplicada. Encontradas: {result.matched_count}. Alteradas: {result.affected_count}. Ignoradas: {result.skipped_count}.
        </Alert>
      )}

      <Paper className="main-page-filters" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="h6" fontWeight={700}>Filtros</Typography>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Cluster</InputLabel>
                <Select
                  label="Cluster"
                  value={filters.cluster_id ? String(filters.cluster_id) : ''}
                  onChange={(event) => setFilter('cluster_id', event.target.value ? Number(event.target.value) : null)}
                >
                  <MenuItem value="">Todos</MenuItem>
                  {clusters.map((cluster) => <MenuItem key={cluster.id} value={String(cluster.id)}>{cluster.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField label="Busca" size="small" fullWidth value={filters.search || ''} onChange={(event) => setFilter('search', normalizeEmpty(event.target.value))} />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField label="Vhost" size="small" fullWidth value={filters.vhost || ''} onChange={(event) => setFilter('vhost', normalizeEmpty(event.target.value))} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField label="Regex do nome da fila" size="small" fullWidth value={filters.name_regex || ''} onChange={(event) => setFilter('name_regex', normalizeEmpty(event.target.value))} />
            </Grid>

            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Criticidade</InputLabel>
                <Select label="Criticidade" value={filters.criticality || ''} onChange={(event) => setFilter('criticality', (event.target.value || null) as QueueCriticality | null)}>
                  <MenuItem value="">Todas</MenuItem>
                  {criticalityOptions.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField label="Owner" size="small" fullWidth value={filters.owner_email || ''} onChange={(event) => setFilter('owner_email', normalizeEmpty(event.target.value))} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField label="Serviço" size="small" fullWidth value={filters.service_name || ''} onChange={(event) => setFilter('service_name', normalizeEmpty(event.target.value))} />
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Template aplicado</InputLabel>
                <Select label="Template aplicado" value={filters.template_id ? String(filters.template_id) : ''} onChange={(event) => setFilter('template_id', event.target.value ? Number(event.target.value) : null)}>
                  <MenuItem value="">Todos</MenuItem>
                  {templates.map((template) => <MenuItem key={template.id} value={String(template.id)}>{template.code}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControlLabel control={<Checkbox checked={Boolean(filters.customized_only)} onChange={(event) => setFilter('customized_only', event.target.checked)} />} label="Somente customizadas" />
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControlLabel control={<Checkbox checked={Boolean(filters.include_removed)} onChange={(event) => setFilter('include_removed', event.target.checked)} disabled={Boolean(filters.removed_only)} />} label="Incluir removidas" />
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControlLabel control={<Checkbox checked={Boolean(filters.removed_only)} onChange={(event) => setFilter('removed_only', event.target.checked)} />} label="Somente removidas" />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField label="Amostra" size="small" type="number" fullWidth value={filters.sample_limit || 200} onChange={(event) => setFilter('sample_limit', Number(event.target.value) || 200)} />
            </Grid>
          </Grid>
          <Stack direction="row" spacing={1}>
            <Button startIcon={<Refresh />} variant="outlined" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending}>Atualizar prévia</Button>
            {preview && <Chip label={`${preview.matched_count} queue(s) encontradas`} color="primary" />}
            {selectedQueueIds.length > 0 && <Chip label={`${selectedQueueIds.length} selecionada(s)`} color="warning" />}
          </Stack>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="h6" fontWeight={700}>Ação em massa</Typography>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Ação</InputLabel>
                <Select label="Ação" value={actionState.action} onChange={(event) => setActionState((current) => ({ ...current, action: event.target.value as QueueBulkAction }))}>
                  <MenuItem value="update_metadata">Atualizar metadados</MenuItem>
                  <MenuItem value="apply_template">Aplicar template</MenuItem>
                  <MenuItem value="remove_template">Remover template</MenuItem>
                  <MenuItem value="update_template_overrides">Customizar overrides do template</MenuItem>
                  <MenuItem value="clear_template_overrides">Limpar customização do template</MenuItem>
                  <MenuItem value="set_template_enabled">Habilitar/desabilitar template aplicado</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            {actionState.action !== 'update_metadata' && (
              <Grid item xs={12} md={4}>
                <FormControl fullWidth size="small">
                  <InputLabel>Template</InputLabel>
                  <Select label="Template" value={actionState.template_id} onChange={(event) => setActionState((current) => ({ ...current, template_id: event.target.value }))}>
                    <MenuItem value="">Selecione</MenuItem>
                    {templates.map((template) => <MenuItem key={template.id} value={String(template.id)}>{template.code}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
            )}
            {actionState.action === 'set_template_enabled' && (
              <Grid item xs={12} md={4}>
                <FormControl fullWidth size="small">
                  <InputLabel>Status</InputLabel>
                  <Select label="Status" value={actionState.enabled} onChange={(event) => setActionState((current) => ({ ...current, enabled: event.target.value }))}>
                    <MenuItem value="true">Habilitar</MenuItem>
                    <MenuItem value="false">Desabilitar</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            )}
          </Grid>

          {selectedTemplate && (actionState.action === 'apply_template' || actionState.action === 'update_template_overrides') && (
            <Alert severity="info">
              Default do template {selectedTemplate.code}: {JSON.stringify(selectedTemplate.default_config)}
            </Alert>
          )}

          {(actionState.action === 'apply_template' || actionState.action === 'update_template_overrides') && (
            <TextField
              label="Overrides JSON"
              fullWidth
              multiline
              minRows={4}
              value={actionState.overrides_json}
              onChange={(event) => setActionState((current) => ({ ...current, overrides_json: event.target.value }))}
              helperText='Exemplo: {"threshold": 1000, "window": "10m"}. Use {} para aplicar sem customização.'
            />
          )}

          {actionState.action === 'update_metadata' && (
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}><FormControl fullWidth size="small"><InputLabel>Criticidade</InputLabel><Select label="Criticidade" value={actionState.criticality} onChange={(event) => setActionState((current) => ({ ...current, criticality: event.target.value }))}><MenuItem value="">Não alterar</MenuItem>{criticalityOptions.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</Select></FormControl></Grid>
              <Grid item xs={12} md={4}><SinglePersonEmailAutocomplete label="Owner" value={actionState.owner_email} onChange={(value) => setActionState((current) => ({ ...current, owner_email: value }))} /></Grid>
              <Grid item xs={12} md={4}><TextField label="Serviço" size="small" fullWidth value={actionState.service_name} onChange={(event) => setActionState((current) => ({ ...current, service_name: event.target.value }))} /></Grid>
              <Grid item xs={12} md={4}><FormControl fullWidth size="small"><InputLabel>Horário</InputLabel><Select label="Horário" value={actionState.monitoring_schedule} onChange={(event) => setActionState((current) => ({ ...current, monitoring_schedule: event.target.value }))}><MenuItem value="">Não alterar</MenuItem>{scheduleOptions.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</Select></FormControl></Grid>
              <Grid item xs={12} md={4}><TextField label="Janela custom" size="small" fullWidth value={actionState.monitoring_custom_window} onChange={(event) => setActionState((current) => ({ ...current, monitoring_custom_window: event.target.value }))} /></Grid>
              <Grid item xs={12} md={4}><TextField label="Jornada" size="small" fullWidth value={actionState.journey} onChange={(event) => setActionState((current) => ({ ...current, journey: event.target.value }))} /></Grid>
              <Grid item xs={12}><TextField label="Descrição" size="small" fullWidth multiline minRows={2} value={actionState.description} onChange={(event) => setActionState((current) => ({ ...current, description: event.target.value }))} /></Grid>
              <Grid item xs={12}><MultiPersonEmailAutocomplete label="Devs para notificação" value={actionState.dev_emails} onChange={(value) => setActionState((current) => ({ ...current, dev_emails: value }))} /></Grid>
            </Grid>
          )}

          <Divider />
          <Alert severity="warning">
            A ação será aplicada nas queues filtradas. Se você selecionar linhas na prévia, a aplicação será limitada somente às filas selecionadas.
          </Alert>
          <Button startIcon={<PlaylistAddCheck />} variant="contained" onClick={() => applyMutation.mutate()} disabled={!canApply() || applyMutation.isPending}>
            Aplicar ação em massa
          </Button>
        </Stack>
      </Paper>

      <Paper sx={{ overflow: 'hidden' }}>
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" fontWeight={700}>Prévia de impacto</Typography>
          <Typography variant="body2" color="text.secondary">
            {preview ? `Exibindo ${preview.sample_count} de ${preview.matched_count} queue(s).` : 'Clique em Atualizar prévia para carregar as queues afetadas.'}
          </Typography>
        </Box>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox"><Checkbox onChange={toggleAllVisible} disabled={!preview?.queues.length} /></TableCell>
              <TableCell>Cluster</TableCell>
              <TableCell>Vhost</TableCell>
              <TableCell>Queue</TableCell>
              <TableCell>Criticidade</TableCell>
              <TableCell>Owner</TableCell>
              <TableCell>Serviço</TableCell>
              <TableCell>Monitores aplicados</TableCell>
              <TableCell>Removida</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {!preview && <TableRow><TableCell colSpan={9}>Nenhuma prévia carregada.</TableCell></TableRow>}
            {preview?.queues.map((queue) => (
              <TableRow key={queue.id} hover selected={selectedQueueIds.includes(queue.id)}>
                <TableCell padding="checkbox"><Checkbox checked={selectedQueueIds.includes(queue.id)} onChange={() => toggleSelected(queue.id)} /></TableCell>
                <TableCell>{queue.cluster_name || queue.cluster_id}</TableCell>
                <TableCell>{queue.vhost}</TableCell>
                <TableCell><Typography fontWeight={700}>{queue.name}</Typography></TableCell>
                <TableCell><Chip label={queue.criticality || 'none'} size="small" /></TableCell>
                <TableCell>{queue.owner_email || '-'}</TableCell>
                <TableCell>{queue.service_name || '-'}</TableCell>
                <TableCell>{formatTemplates(queue.applied_templates)}</TableCell>
                <TableCell>{queue.is_removed ? <Chip label="sim" size="small" color="warning" /> : 'não'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Stack>
  );
}
