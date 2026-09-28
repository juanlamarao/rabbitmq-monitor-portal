import { Add, Delete, Edit, Settings, Visibility, WarningAmber } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  SelectChangeEvent,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { MultiPersonEmailAutocomplete, SinglePersonEmailAutocomplete } from '../components/PersonEmailAutocomplete';
import { apiRequest } from '../services/api';
import { Cluster, MonitorTemplate, MonitoringSchedule, QueueCriticality, QueueItem, QueueMonitorTemplate } from '../types/api';

interface QueueEditState {
  description: string;
  criticality: QueueCriticality;
  owner_email: string;
  journey: string;
  service_name: string;
  monitoring_schedule: MonitoringSchedule;
  monitoring_custom_window: string;
  dev_emails: string[];
  is_dead_letter: boolean;
  monitor_anomaly: boolean;
  monitor_enabled: boolean;
}

type QueueDialogMode = 'view' | 'edit';
type TemplateConfigState = Record<string, string | number | boolean>;

const criticalityOptions: QueueCriticality[] = ['none', 'low', 'medium', 'high', 'critical'];

function toEditState(queue: QueueItem): QueueEditState {
  return {
    description: queue.description || '',
    criticality: queue.criticality || 'none',
    owner_email: queue.owner_email || '',
    journey: queue.journey || '',
    service_name: queue.service_name || '',
    monitoring_schedule: queue.monitoring_schedule,
    monitoring_custom_window: queue.monitoring_custom_window || '',
    dev_emails: queue.dev_emails || [],
    is_dead_letter: queue.is_dead_letter,
    monitor_anomaly: queue.monitor_anomaly,
    monitor_enabled: queue.monitor_enabled,
  };
}

function formatConfig(config: Record<string, unknown> | null | undefined) {
  if (!config || Object.keys(config).length === 0) return 'Sem parâmetros configuráveis';
  return Object.entries(config)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(' | ');
}

function getDefaultValue(template: MonitorTemplate, key: string) {
  return template.default_config?.[key];
}

function normalizeTemplateConfigValue(rawValue: string | number | boolean, defaultValue: unknown) {
  if (typeof defaultValue === 'boolean') return Boolean(rawValue);
  if (typeof defaultValue === 'number') {
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  }
  return String(rawValue);
}

function buildOverrides(template: MonitorTemplate, state: TemplateConfigState) {
  const overrides: Record<string, unknown> = {};
  Object.keys(template.default_config || {}).forEach((key) => {
    const defaultValue = getDefaultValue(template, key);
    const rawValue = state[key] ?? (defaultValue as string | number | boolean);
    const currentValue = normalizeTemplateConfigValue(rawValue, defaultValue);
    if (currentValue !== defaultValue) {
      overrides[key] = currentValue;
    }
  });
  return Object.keys(overrides).length > 0 ? overrides : null;
}

function isBindingCustomized(binding: QueueMonitorTemplate) {
  return Boolean(binding.overrides && Object.keys(binding.overrides).length > 0);
}

export default function QueuesPage() {
  const queryClient = useQueryClient();
  const customizationRef = useRef<HTMLDivElement | null>(null);
  const dialogEndRef = useRef<HTMLDivElement | null>(null);
  const [showRemovedOnly, setShowRemovedOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [clusterFilter, setClusterFilter] = useState<string>('');
  const [templateFilter, setTemplateFilter] = useState<string>('');
  const [customizedOnly, setCustomizedOnly] = useState(false);
  const [selectedQueue, setSelectedQueue] = useState<QueueItem | null>(null);
  const [dialogMode, setDialogMode] = useState<QueueDialogMode>('edit');
  const [editState, setEditState] = useState<QueueEditState | null>(null);
  const [editingBinding, setEditingBinding] = useState<QueueMonitorTemplate | null>(null);
  const [templateConfigState, setTemplateConfigState] = useState<TemplateConfigState>({});
  const [error, setError] = useState<string | null>(null);

  const { data: clusters = [] } = useQuery({ queryKey: ['clusters'], queryFn: () => apiRequest<Cluster[]>('/clusters') });
  const { data: templates = [] } = useQuery({ queryKey: ['templates', 'queue'], queryFn: () => apiRequest<MonitorTemplate[]>('/templates?component_type=queue') });
  const { data: appliedTemplates = [] } = useQuery({
    queryKey: ['queue-template-bindings', selectedQueue?.id],
    queryFn: () => apiRequest<QueueMonitorTemplate[]>(`/components/queues/${selectedQueue?.id}/templates`),
    enabled: Boolean(selectedQueue),
  });
  const { data: queues = [], isLoading } = useQuery({
    queryKey: ['queues', showRemovedOnly, search, clusterFilter, templateFilter, customizedOnly],
    queryFn: () => {
      const params = new URLSearchParams();
      if (showRemovedOnly) params.set('removed_only', 'true');
      if (search) params.set('search', search);
      if (clusterFilter) params.set('cluster_id', clusterFilter);
      if (templateFilter) params.set('template_id', templateFilter);
      if (customizedOnly) params.set('customized_only', 'true');
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return apiRequest<QueueItem[]>(`/components/queues${suffix}`);
    },
  });

  const clusterById = useMemo(() => new Map(clusters.map((cluster) => [cluster.id, cluster])), [clusters]);
  const appliedTemplateIds = useMemo(() => new Set(appliedTemplates.map((binding) => binding.template_id)), [appliedTemplates]);
  const availableTemplates = useMemo(() => templates.filter((template) => template.is_active && !appliedTemplateIds.has(template.id)), [templates, appliedTemplateIds]);
  const readOnly = dialogMode === 'view';

  const updateMutation = useMutation({
    mutationFn: ({ queueId, payload }: { queueId: number; payload: Record<string, unknown> }) =>
      apiRequest<QueueItem>(`/components/queues/${queueId}`, { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: () => {
      closeDialog();
      queryClient.invalidateQueries({ queryKey: ['queues'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Erro ao atualizar queue'),
  });

  const addTemplateMutation = useMutation({
    mutationFn: ({ queueId, templateId }: { queueId: number; templateId: number }) =>
      apiRequest<QueueMonitorTemplate>(`/components/queues/${queueId}/templates`, {
        method: 'POST',
        body: JSON.stringify({ template_id: templateId, enabled: true, overrides: null }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue-template-bindings', selectedQueue?.id] });
      queryClient.invalidateQueries({ queryKey: ['queues'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
      window.setTimeout(() => dialogEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 80);
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Erro ao aplicar template'),
  });

  const updateTemplateMutation = useMutation({
    mutationFn: ({ queueId, bindingId, payload }: { queueId: number; bindingId: number; payload: Record<string, unknown> }) =>
      apiRequest<QueueMonitorTemplate>(`/components/queues/${queueId}/templates/${bindingId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setEditingBinding(null);
      setTemplateConfigState({});
      queryClient.invalidateQueries({ queryKey: ['queue-template-bindings', selectedQueue?.id] });
      queryClient.invalidateQueries({ queryKey: ['queues'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Erro ao atualizar template aplicado'),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: ({ queueId, bindingId }: { queueId: number; bindingId: number }) =>
      apiRequest<void>(`/components/queues/${queueId}/templates/${bindingId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue-template-bindings', selectedQueue?.id] });
      queryClient.invalidateQueries({ queryKey: ['queues'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Erro ao remover template aplicado'),
  });

  function openDialog(queue: QueueItem, mode: QueueDialogMode) {
    setSelectedQueue(queue);
    setDialogMode(mode);
    setEditState(toEditState(queue));
    setEditingBinding(null);
    setTemplateConfigState({});
    setError(null);
  }

  function closeDialog() {
    setSelectedQueue(null);
    setEditState(null);
    setEditingBinding(null);
    setTemplateConfigState({});
    setError(null);
  }

  function saveEdit() {
    if (!selectedQueue || !editState) return;
    updateMutation.mutate({
      queueId: selectedQueue.id,
      payload: {
        ...editState,
        owner_email: editState.owner_email || null,
        criticality: editState.criticality,
        monitoring_custom_window: editState.monitoring_custom_window || null,
        dev_emails: editState.dev_emails,
      },
    });
  }

  function startEditBinding(binding: QueueMonitorTemplate) {
    setEditingBinding(binding);
    setTemplateConfigState({ ...(binding.effective_config as TemplateConfigState) });
    window.setTimeout(() => customizationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 0);
  }

  function saveTemplateConfig() {
    if (!selectedQueue || !editingBinding) return;
    updateTemplateMutation.mutate({
      queueId: selectedQueue.id,
      bindingId: editingBinding.id,
      payload: {
        enabled: editingBinding.enabled,
        overrides: buildOverrides(editingBinding.template, templateConfigState),
      },
    });
  }

  function toggleTemplateEnabled(binding: QueueMonitorTemplate, enabled: boolean) {
    if (!selectedQueue) return;
    updateTemplateMutation.mutate({
      queueId: selectedQueue.id,
      bindingId: binding.id,
      payload: { enabled, overrides: binding.overrides || null },
    });
  }

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h4" fontWeight={800}>
          Queues
        </Typography>
        <Typography color="text.secondary">Filas descobertas via RabbitMQ Management API e metadados manuais.</Typography>
      </Box>

      <Paper className="main-page-filters" sx={{ p: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={4}>
            <TextField label="Buscar queue, vhost, serviço ou jornada" value={search} onChange={(e) => setSearch(e.target.value)} fullWidth />
          </Grid>
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Cluster</InputLabel>
              <Select label="Cluster" value={clusterFilter} onChange={(e: SelectChangeEvent) => setClusterFilter(e.target.value)}>
                <MenuItem value="">Todos</MenuItem>
                {clusters.map((cluster) => (
                  <MenuItem key={cluster.id} value={String(cluster.id)}>
                    {cluster.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Template aplicado</InputLabel>
              <Select label="Template aplicado" value={templateFilter} onChange={(e: SelectChangeEvent) => setTemplateFilter(e.target.value)}>
                <MenuItem value="">Todos</MenuItem>
                {templates.map((template) => (
                  <MenuItem key={template.id} value={String(template.id)}>
                    {template.code}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={4}>
            <FormControlLabel control={<Switch checked={showRemovedOnly} onChange={(e) => setShowRemovedOnly(e.target.checked)} />} label="Mostrar removidas" />
          </Grid>
          <Grid item xs={12} md={4}>
            <FormControlLabel control={<Switch checked={customizedOnly} onChange={(e) => setCustomizedOnly(e.target.checked)} />} label="Somente templates customizados" />
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ overflow: 'hidden' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Queue</TableCell>
              <TableCell>Cluster</TableCell>
              <TableCell>Metadados</TableCell>
              <TableCell>Monitores aplicados</TableCell>
              <TableCell align="right">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {queues.map((queue) => (
              <TableRow key={queue.id} hover sx={{ opacity: queue.is_removed ? 0.65 : 1 }}>
                <TableCell>
                  <Typography fontWeight={700}>{queue.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    vhost: {queue.vhost}
                  </Typography>
                </TableCell>
                <TableCell>{clusterById.get(queue.cluster_id)?.name || `#${queue.cluster_id}`}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
                    <Chip label={`criticidade: ${queue.criticality || 'none'}`} size="small" />
                  </Stack>
                  <Typography variant="caption" display="block">
                    owner: {queue.owner_email || '-'}
                  </Typography>
                  <Typography variant="caption" display="block">
                    serviço: {queue.service_name || '-'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {(queue.applied_templates || []).length === 0 && <Typography variant="caption">-</Typography>}
                    {(queue.applied_templates || []).map((template) => (
                      <Chip
                        key={`${queue.id}-${template.template_id}`}
                        label={template.code}
                        size="small"
                        variant="outlined"
                        icon={template.is_customized ? <WarningAmber fontSize="small" /> : undefined}
                        sx={{ '& .MuiChip-icon': { color: 'warning.main' } }}
                      />
                    ))}
                    {queue.is_temporary && <Chip label="Temporária" size="small" />}
                  </Stack>
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Visualizar">
                    <IconButton onClick={() => openDialog(queue, 'view')}>
                      <Visibility />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Editar metadados e templates">
                    <IconButton onClick={() => openDialog(queue, 'edit')}>
                      <Edit />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && queues.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Alert severity="info">Nenhuma queue encontrada.</Alert>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={Boolean(selectedQueue && editState)} onClose={closeDialog} fullWidth maxWidth="lg">
        <DialogTitle>{readOnly ? 'Visualizar queue' : 'Editar queue'}</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {selectedQueue && editState && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField label="Name" value={selectedQueue.name} fullWidth disabled />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField label="Vhost" value={selectedQueue.vhost} fullWidth disabled />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField label="Type" value={selectedQueue.type || '-'} fullWidth disabled />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField label="State" value={selectedQueue.state || '-'} fullWidth disabled />
                </Grid>
              </Grid>

              <Divider />

              <TextField label="Descrição" value={editState.description} onChange={(e) => setEditState({ ...editState, description: e.target.value })} multiline minRows={2} disabled={readOnly} />
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth disabled={readOnly}>
                    <InputLabel>Criticidade</InputLabel>
                    <Select
                      label="Criticidade"
                      value={editState.criticality}
                      onChange={(e: SelectChangeEvent) => setEditState({ ...editState, criticality: e.target.value as QueueCriticality })}
                    >
                      {criticalityOptions.map((option) => (
                        <MenuItem key={option} value={option}>
                          {option}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={6}>
                  <SinglePersonEmailAutocomplete label="Owner (email)" value={editState.owner_email} onChange={(value) => setEditState({ ...editState, owner_email: value })} disabled={readOnly} />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField label="Jornada" value={editState.journey} onChange={(e) => setEditState({ ...editState, journey: e.target.value })} fullWidth disabled={readOnly} />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField label="Serviço" value={editState.service_name} onChange={(e) => setEditState({ ...editState, service_name: e.target.value })} fullWidth disabled={readOnly} />
                </Grid>
              </Grid>
              <MultiPersonEmailAutocomplete label="Devs para notificação" value={editState.dev_emails} onChange={(value) => setEditState({ ...editState, dev_emails: value })} disabled={readOnly} />

              <Divider />

              <Box>
                <Typography variant="h6" fontWeight={800} sx={{ mb: 1 }}>
                  Templates disponíveis
                </Typography>
                {availableTemplates.length === 0 ? (
                  <Alert severity="info">Todos os templates ativos já estão aplicados nesta queue.</Alert>
                ) : (
                  <Stack spacing={1}>
                    {availableTemplates.map((template) => (
                      <Paper key={template.id} variant="outlined" sx={{ p: 1.5 }}>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
                          <Box>
                            <Typography fontWeight={800}>{template.name}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              {template.description || '-'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {formatConfig(template.default_config)}
                            </Typography>
                          </Box>
                          {!readOnly && (
                            <Button
                              variant="outlined"
                              startIcon={<Add />}
                              onClick={() => selectedQueue && addTemplateMutation.mutate({ queueId: selectedQueue.id, templateId: template.id })}
                              disabled={addTemplateMutation.isPending}
                            >
                              Adicionar
                            </Button>
                          )}
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                )}
              </Box>

              <Box>
                <Typography variant="h6" fontWeight={800} sx={{ mb: 1 }}>
                  Monitores aplicados
                </Typography>
                <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Template</TableCell>
                        <TableCell>Configuração ativa</TableCell>
                        <TableCell align="right">Ações</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {appliedTemplates.map((binding) => {
                        const customized = isBindingCustomized(binding);
                        return (
                          <TableRow key={binding.id} hover>
                            <TableCell>
                              <Typography fontWeight={700}>{binding.template.name}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {binding.template.code}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Stack direction="row" spacing={0.75} alignItems="center">
                                {customized && <WarningAmber fontSize="small" sx={{ color: 'warning.main' }} />}
                                <Typography variant="body2">{formatConfig(binding.effective_config)}</Typography>
                              </Stack>
                            </TableCell>
                            <TableCell align="right">
                              {!readOnly && (
                                <>
                                  <Tooltip title="Customizar configuração">
                                    <IconButton onClick={() => startEditBinding(binding)}>
                                      <Settings />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title={binding.enabled ? 'Desabilitar' : 'Habilitar'}>
                                    <Switch size="small" checked={binding.enabled} onChange={(e) => toggleTemplateEnabled(binding, e.target.checked)} />
                                  </Tooltip>
                                  <Tooltip title="Remover template aplicado">
                                    <IconButton
                                      color="error"
                                      onClick={() => {
                                        if (selectedQueue && confirm(`Remover o template "${binding.template.name}" desta queue?`)) {
                                          deleteTemplateMutation.mutate({ queueId: selectedQueue.id, bindingId: binding.id });
                                        }
                                      }}
                                    >
                                      <Delete />
                                    </IconButton>
                                  </Tooltip>
                                </>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {appliedTemplates.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3}>
                            <Alert severity="info">Nenhum template aplicado nesta queue.</Alert>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </Paper>
              </Box>

              {editingBinding && (
                <Paper variant="outlined" sx={{ p: 2 }} ref={customizationRef}>
                  <Stack spacing={2}>
                    <Box>
                      <Typography variant="h6" fontWeight={800}>
                        Customizar template aplicado
                      </Typography>
                      <Typography color="text.secondary">{editingBinding.template.name}</Typography>
                    </Box>
                    <Grid container spacing={2}>
                      {Object.entries(editingBinding.template.default_config || {}).map(([key, defaultValue]) => (
                        <Grid item xs={12} md={6} key={key}>
                          {typeof defaultValue === 'boolean' ? (
                            <FormControlLabel
                              control={
                                <Checkbox
                                  checked={Boolean(templateConfigState[key])}
                                  onChange={(e) => setTemplateConfigState({ ...templateConfigState, [key]: e.target.checked })}
                                />
                              }
                              label={`${key} (default: ${String(defaultValue)})`}
                            />
                          ) : (
                            <TextField
                              label={`${key} (default: ${String(defaultValue)})`}
                              type={typeof defaultValue === 'number' ? 'number' : 'text'}
                              value={templateConfigState[key] ?? ''}
                              onChange={(e) => setTemplateConfigState({ ...templateConfigState, [key]: typeof defaultValue === 'number' ? Number(e.target.value) : e.target.value })}
                              fullWidth
                            />
                          )}
                        </Grid>
                      ))}
                    </Grid>
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <Button onClick={() => setTemplateConfigState({ ...(editingBinding.template.default_config as TemplateConfigState) })}>Restaurar padrão</Button>
                      <Button onClick={() => setEditingBinding(null)}>Cancelar</Button>
                      <Button variant="contained" onClick={saveTemplateConfig} disabled={updateTemplateMutation.isPending}>
                        Salvar customização
                      </Button>
                    </Stack>
                  </Stack>
                </Paper>
              )}
              <Box ref={dialogEndRef} />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>{readOnly ? 'Fechar' : 'Cancelar'}</Button>
          {!readOnly && (
            <Button onClick={saveEdit} variant="contained" disabled={updateMutation.isPending}>
              Salvar metadados
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
