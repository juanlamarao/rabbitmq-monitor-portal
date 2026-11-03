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
import { useEffect, useMemo, useRef, useState } from 'react';
import { MultiPersonEmailAutocomplete, SinglePersonEmailAutocomplete } from '../components/PersonEmailAutocomplete';
import { apiRequest } from '../services/api';
import { useAuth } from '../services/authContext';
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
  const auth=useAuth();
  const canEditQueue=(clusterId:number)=>auth.is_admin||auth.edit_cluster_ids.includes(clusterId);
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
  // Edits are in memory until the user presses the single Save button.
  const [draftBindings, setDraftBindings] = useState<QueueMonitorTemplate[]>([]);
  const [removedBindingIds, setRemovedBindingIds] = useState<number[]>([]);
  const [draftReady, setDraftReady] = useState(false);


  const { data: clusters = [] } = useQuery({ queryKey: ['clusters'], queryFn: () => apiRequest<Cluster[]>('/clusters') });
  const { data: templates = [] } = useQuery({ queryKey: ['templates', 'queue'], queryFn: () => apiRequest<MonitorTemplate[]>('/templates?component_type=queue') });
  const { data: appliedTemplates = [], isLoading: bindingsLoading } = useQuery({
    queryKey: ['queue-template-bindings', selectedQueue?.id],
    queryFn: () => apiRequest<QueueMonitorTemplate[]>(`/components/queues/${selectedQueue?.id}/templates`),
    enabled: Boolean(selectedQueue),
  });
  const { data: queues = [], isLoading } = useQuery({
    queryKey: ['queues', showRemovedOnly, search, clusterFilter, templateFilter, customizedOnly],
    refetchInterval: 5000,
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
  useEffect(() => {
    if (selectedQueue && !draftReady && !bindingsLoading) {
      setDraftBindings(appliedTemplates.map((binding) => ({ ...binding })));
      setRemovedBindingIds([]);
      setDraftReady(true);
    }
  }, [selectedQueue, draftReady, bindingsLoading, appliedTemplates]);
  const appliedTemplateIds = useMemo(() => new Set(draftBindings.filter((b) => !removedBindingIds.includes(b.id)).map((b) => b.template_id)), [draftBindings, removedBindingIds]);
  const availableTemplates = useMemo(() => templates.filter((template) => template.is_active && !appliedTemplateIds.has(template.id)), [templates, appliedTemplateIds]);
  const metadataChanged = Boolean(selectedQueue && editState && JSON.stringify(toEditState(selectedQueue)) !== JSON.stringify(editState));
  const draftChange = (binding: QueueMonitorTemplate): 'create' | 'edit' | 'remove' | null => {
    if (removedBindingIds.includes(binding.id)) return 'remove';
    if (binding.id < 0) return 'create';
    const original = appliedTemplates.find((b) => b.id === binding.id);
    if (!original) return null;
    return metadataChanged || original.enabled !== binding.enabled || JSON.stringify(original.overrides || {}) !== JSON.stringify(binding.overrides || {}) ? 'edit' : null;
  };
  const pendingTemplates = draftBindings.filter((binding) => draftChange(binding));

  const readOnly = dialogMode === 'view';

  const saveMutation = useMutation({
    mutationFn: ({ queueId, payload }: { queueId: number; payload: Record<string, unknown> }) =>
      apiRequest<QueueItem>(`/components/queues/${queueId}/configuration`, { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: () => {
      closeDialog();
      queryClient.invalidateQueries({ queryKey: ['queues'] });
      queryClient.invalidateQueries({ queryKey: ['queue-template-bindings'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Não foi possível salvar as alterações'),
  });

  function openDialog(queue: QueueItem, mode: QueueDialogMode) {
    setSelectedQueue(queue);
    setDialogMode(mode);
    setEditState(toEditState(queue));
    setEditingBinding(null);
    setTemplateConfigState({});
    setDraftBindings([]);
    setRemovedBindingIds([]);
    setDraftReady(false);
    setError(null);
  }

  function closeDialog() {
    setSelectedQueue(null);
    setEditState(null);
    setEditingBinding(null);
    setTemplateConfigState({});
    setDraftBindings([]);
    setRemovedBindingIds([]);
    setDraftReady(false);
    setError(null);
  }

  function cancelDialog() {
    if (!readOnly && (metadataChanged || pendingTemplates.length) && !window.confirm('Descartar alterações ainda não salvas?')) return;
    closeDialog();
  }

  function saveEdit() {
    if (!selectedQueue || !editState || !draftReady) return;
    saveMutation.mutate({
      queueId: selectedQueue.id,
      payload: {
        metadata: {
          ...editState,
          owner_email: editState.owner_email || null,
          monitoring_custom_window: editState.monitoring_custom_window || null,
          dev_emails: editState.dev_emails,
        },
        templates: draftBindings.filter((binding) => !removedBindingIds.includes(binding.id)).map((binding) => ({
          template_id: binding.template_id,
          enabled: binding.enabled,
          overrides: binding.overrides || null,
        })),
      },
    });
  }

  function addDraftTemplate(template: MonitorTemplate) {
    // Reuse staged removal, when the user changes their mind before saving.
    const removed = draftBindings.find((b) => b.template_id === template.id && removedBindingIds.includes(b.id));
    if (removed) {
      setRemovedBindingIds((ids) => ids.filter((id) => id !== removed.id));
    } else if (!draftBindings.some((b) => b.template_id === template.id)) {
      const timestamp = new Date().toISOString();
      setDraftBindings((items) => [...items, {
        id: -template.id, queue_id: selectedQueue?.id || 0, template_id: template.id,
        template, enabled: true, overrides: null, effective_config: { ...(template.default_config || {}) },
        created_at: timestamp, updated_at: timestamp,
      }]);
    }
    window.setTimeout(() => dialogEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 80);
  }

  function removeDraftTemplate(binding: QueueMonitorTemplate) {
    if (binding.id < 0) setDraftBindings((items) => items.filter((b) => b.id !== binding.id));
    else setRemovedBindingIds((ids) => [...new Set([...ids, binding.id])]);
    if (editingBinding?.id === binding.id) setEditingBinding(null);
  }

  function startEditBinding(binding: QueueMonitorTemplate) {
    setEditingBinding(binding);
    setTemplateConfigState({ ...(binding.effective_config as TemplateConfigState) });
    window.setTimeout(() => customizationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 0);
  }

  function saveTemplateConfig() {
    if (!editingBinding) return;
    const overrides = buildOverrides(editingBinding.template, templateConfigState);
    setDraftBindings((items) => items.map((binding) => binding.id === editingBinding.id ? {
      ...binding, overrides,
      effective_config: { ...(editingBinding.template.default_config || {}), ...(overrides || {}) },
    } : binding));
    setEditingBinding(null);
    setTemplateConfigState({});
  }

  function toggleTemplateEnabled(binding: QueueMonitorTemplate, enabled: boolean) {
    setDraftBindings((items) => items.map((b) => b.id === binding.id ? { ...b, enabled } : b));
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
              <TableCell>Datadog sync</TableCell>
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
                <TableCell>
                  <Chip size="small"
                    label={({synced:'Em sync',pending:'Pendente',running:'Sincronizando',retry:'Aguardando retry',error:'Falhou',blocked:'Revisão necessária',not_configured:'Sem solicitação'} as Record<string,string>)[queue.sync_status || 'not_configured'] || queue.sync_status}
                    color={queue.sync_status === 'synced' ? 'success' : queue.sync_status === 'error' || queue.sync_status === 'blocked' ? 'error' : queue.sync_status === 'not_configured' ? 'default' : 'warning'} />
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Visualizar">
                    <IconButton onClick={() => openDialog(queue, 'view')}>
                      <Visibility />
                    </IconButton>
                  </Tooltip>
                  {canEditQueue(queue.cluster_id) && <Tooltip title="Editar metadados e templates">
                    <IconButton onClick={() => openDialog(queue, 'edit')}>
                      <Edit />
                    </IconButton>
                  </Tooltip>}
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && queues.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Alert severity="info">Nenhuma queue encontrada.</Alert>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={Boolean(selectedQueue && editState)} onClose={cancelDialog} fullWidth maxWidth="lg">
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

              {!readOnly && pendingTemplates.length > 0 && (
                <Alert severity="info">{pendingTemplates.length} alteração(ões) de monitor aguardando salvar. Nenhuma foi enviada ao Datadog ainda.</Alert>
              )}
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
                              onClick={() => addDraftTemplate(template)}
                              disabled={!draftReady}
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
                      {draftBindings.map((binding) => {
                        const customized = isBindingCustomized(binding);
                        const change = draftChange(binding);
                        return (
                          <Tooltip title={change === 'remove' ? 'Monitor será removido após salvar' : ''} key={binding.id} followCursor>
                          <TableRow hover sx={{ opacity: change === 'remove' ? .42 : 1, '& td': { textDecoration: change === 'remove' ? 'line-through' : 'none' } }}>
                            <TableCell>
                              <Typography fontWeight={700}>{binding.template.name}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {binding.template.code}
                              </Typography>
                              {change && <Tooltip title={change === 'create' ? 'Criação' : change === 'edit' ? 'Edição' : 'Monitor será removido'}><Chip size="small" label={change === 'create' ? 'Criação' : change === 'edit' ? 'Edição' : 'Remoção'} color={change === 'remove' ? 'default' : 'info'} variant="outlined" sx={{ ml: 1, textDecoration: 'none' }}/></Tooltip>}
                            </TableCell>
                            <TableCell>
                              <Stack direction="row" spacing={0.75} alignItems="center">
                                {customized && <WarningAmber fontSize="small" sx={{ color: 'warning.main' }} />}
                                <Typography variant="body2">{formatConfig(binding.effective_config)}</Typography>
                              </Stack>
                            </TableCell>
                            <TableCell align="right">
                              {!readOnly && change !== 'remove' && (
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
                                        if (confirm(`Marcar o template "${binding.template.name}" para remoção? A mudança só será aplicada ao salvar a queue.`)) {
                                          removeDraftTemplate(binding);
                                        }
                                      }}
                                    >
                                      <Delete />
                                    </IconButton>
                                  </Tooltip>
                                </>
                              )}
                              {!readOnly && change === 'remove' && <Button size="small" onClick={() => setRemovedBindingIds((ids) => ids.filter((id) => id !== binding.id))}>Desfazer</Button>}
                            </TableCell>
                          </TableRow>
                          </Tooltip>
                        );
                      })}
                      {draftBindings.length === 0 && (
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
                      <Button variant="contained" onClick={saveTemplateConfig} >
                        Aplicar ao rascunho
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
          <Button onClick={cancelDialog}>{readOnly ? 'Fechar' : 'Cancelar'}</Button>
          {!readOnly && (
            <Button onClick={saveEdit} variant="contained" disabled={saveMutation.isPending || !draftReady}>
              Salvar alterações
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
