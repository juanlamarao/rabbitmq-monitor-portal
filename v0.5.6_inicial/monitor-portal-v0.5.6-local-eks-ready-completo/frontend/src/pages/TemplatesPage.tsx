import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  Paper,
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
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import InsightsIcon from '@mui/icons-material/Insights';
import RestoreIcon from '@mui/icons-material/Restore';
import VisibilityIcon from '@mui/icons-material/Visibility';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiRequest } from '../services/api';
import { MonitorTemplate, MonitorTemplatePayload, TemplateImpact, TemplateUsage } from '../types/api';

type FormMode = 'create' | 'edit' | 'view';

interface TemplateFormState {
  code: string;
  name: string;
  description: string;
  monitor_kind: string;
  default_config_text: string;
  datadog_monitor_type: string;
  datadog_query_template: string;
  datadog_message_template: string;
  datadog_tags_template_text: string;
  datadog_options_text: string;
  is_active: boolean;
}

const emptyForm: TemplateFormState = {
  code: '',
  name: '',
  description: '',
  monitor_kind: 'threshold',
  default_config_text: JSON.stringify({ threshold: 5000, window: '15m', business_days_only: false }, null, 2),
  datadog_monitor_type: 'query alert',
  datadog_query_template: 'max(last_{{window}}):max:{{metric_messages}}{ {{datadog_scope}} } > {{threshold}}',
  datadog_message_template: '{{#is_alert}}\n🚨 RabbitMQ Queue em alerta\n\nCluster: {{rabbitmq_cluster.name}}\nVhost: {{vhost.name}}\nQueue: {{queue.name}}\n\nDetalhes: {{public_reference_url}}\n{{/is_alert}}',
  datadog_tags_template_text: JSON.stringify(['managed_by:rabbitmq-monitor-portal', 'component:queue', 'provider:datadog', 'template:{{template_code}}'], null, 2),
  datadog_options_text: JSON.stringify({ include_tags: true, notify_no_data: false, require_full_window: false }, null, 2),
  is_active: true,
};

function configSummary(config: Record<string, unknown>) {
  return Object.entries(config || {})
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(' | ');
}

function parseJsonObject(text: string, label: string): Record<string, unknown> {
  const parsed = JSON.parse(text || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} precisa ser um objeto JSON.`);
  }
  return parsed as Record<string, unknown>;
}

function parseJsonStringList(text: string, label: string): string[] {
  const parsed = JSON.parse(text || '[]');
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
    throw new Error(`${label} precisa ser um array JSON de strings.`);
  }
  return parsed as string[];
}

function parseConfig(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('A configuração padrão precisa ser um objeto JSON.');
  }
  return parsed as Record<string, unknown>;
}

function templateToForm(template: MonitorTemplate): TemplateFormState {
  return {
    code: template.code,
    name: template.name,
    description: template.description || '',
    monitor_kind: template.monitor_kind,
    default_config_text: JSON.stringify(template.default_config || {}, null, 2),
    datadog_monitor_type: template.datadog_monitor_type || 'query alert',
    datadog_query_template: template.datadog_query_template || '',
    datadog_message_template: template.datadog_message_template || '',
    datadog_tags_template_text: JSON.stringify(template.datadog_tags_template || [], null, 2),
    datadog_options_text: JSON.stringify(template.datadog_options || {}, null, 2),
    is_active: template.is_active,
  };
}

export default function TemplatesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [mode, setMode] = useState<FormMode>('create');
  const [selected, setSelected] = useState<MonitorTemplate | null>(null);
  const [form, setForm] = useState<TemplateFormState>(emptyForm);
  const [openForm, setOpenForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [usageTemplate, setUsageTemplate] = useState<MonitorTemplate | null>(null);
  const [impact, setImpact] = useState<TemplateImpact | null>(null);

  const { data: templates = [] } = useQuery({
    queryKey: ['templates', search, activeOnly],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (activeOnly) params.set('active_only', 'true');
      return apiRequest<MonitorTemplate[]>(`/templates${params.toString() ? `?${params}` : ''}`);
    },
  });

  const { data: usage, isLoading: loadingUsage } = useQuery({
    enabled: Boolean(usageTemplate),
    queryKey: ['template-usage', usageTemplate?.id],
    queryFn: () => apiRequest<TemplateUsage>(`/templates/${usageTemplate?.id}/usage`),
  });

  const usageByTemplate = useMemo(() => {
    const map = new Map<number, TemplateUsage>();
    if (usageTemplate && usage) map.set(usageTemplate.id, usage);
    return map;
  }, [usageTemplate, usage]);

  const createMutation = useMutation({
    mutationFn: (payload: MonitorTemplatePayload) => apiRequest<MonitorTemplate>('/templates', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      closeForm();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: MonitorTemplatePayload }) =>
      apiRequest<MonitorTemplate>(`/templates/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      closeForm();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'deactivate' | 'reactivate' }) =>
      apiRequest<MonitorTemplate>(`/templates/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      if (usageTemplate) queryClient.invalidateQueries({ queryKey: ['template-usage', usageTemplate.id] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest<void>(`/templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
    onError: (err: Error) => alert(err.message),
  });

  const impactMutation = useMutation({
    mutationFn: ({ id, default_config }: { id: number; default_config: Record<string, unknown> }) =>
      apiRequest<TemplateImpact>(`/templates/${id}/impact`, { method: 'POST', body: JSON.stringify({ default_config }) }),
    onSuccess: (data) => setImpact(data),
    onError: (err: Error) => setFormError(err.message),
  });

  function openCreate() {
    setMode('create');
    setSelected(null);
    setForm(emptyForm);
    setImpact(null);
    setFormError(null);
    setOpenForm(true);
  }

  function openTemplate(template: MonitorTemplate, nextMode: FormMode) {
    setMode(nextMode);
    setSelected(template);
    setForm(templateToForm(template));
    setImpact(null);
    setFormError(null);
    setOpenForm(true);
  }

  function closeForm() {
    setOpenForm(false);
    setSelected(null);
    setForm(emptyForm);
    setImpact(null);
    setFormError(null);
  }

  function buildPayload(): MonitorTemplatePayload {
    const config = parseConfig(form.default_config_text);
    const datadogTags = parseJsonStringList(form.datadog_tags_template_text, 'Tags Datadog');
    const datadogOptions = parseJsonObject(form.datadog_options_text, 'Options Datadog');
    return {
      ...(mode === 'create' ? { code: form.code.trim() } : {}),
      name: form.name.trim(),
      description: form.description.trim() || null,
      component_type: 'queue',
      monitor_kind: form.monitor_kind.trim(),
      default_config: config,
      datadog_monitor_type: form.datadog_monitor_type.trim() || null,
      datadog_query_template: form.datadog_query_template.trim() || null,
      datadog_message_template: form.datadog_message_template.trim() || null,
      datadog_tags_template: datadogTags,
      datadog_options: datadogOptions,
      is_active: form.is_active,
    };
  }

  function handleSubmit() {
    setFormError(null);
    try {
      const payload = buildPayload();
      if (mode === 'create') {
        createMutation.mutate(payload);
      } else if (selected) {
        updateMutation.mutate({ id: selected.id, payload });
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao validar formulário.');
    }
  }

  function handlePreviewImpact() {
    if (!selected) return;
    setFormError(null);
    try {
      const default_config = parseConfig(form.default_config_text);
      impactMutation.mutate({ id: selected.id, default_config });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao validar configuração JSON.');
    }
  }

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
        <Box>
          <Typography variant="h4" fontWeight={800}>
            Templates de monitoramento
          </Typography>
          <Typography color="text.secondary">
            Gestão dos padrões herdados dinamicamente pelas queues e dos overrides locais aplicados em cada monitor.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ fontWeight: 800 }}>
          Novo template
        </Button>
      </Stack>

      <Paper className="main-filter-panel" sx={{ p: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={8}>
            <TextField fullWidth label="Pesquisar por nome, code ou kind" value={search} onChange={(event) => setSearch(event.target.value)} />
          </Grid>
          <Grid item xs={12} md={4}>
            <FormControlLabel
              control={<Switch checked={activeOnly} onChange={(event) => setActiveOnly(event.target.checked)} />}
              label="Somente ativos"
            />
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ overflow: 'hidden' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Template</TableCell>
              <TableCell>Kind</TableCell>
              <TableCell>Configuração padrão</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {templates.map((template) => {
              const knownUsage = usageByTemplate.get(template.id);
              return (
                <TableRow key={template.id} hover>
                  <TableCell sx={{ minWidth: 280 }}>
                    <Stack spacing={0.5}>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Typography fontWeight={700}>{template.name}</Typography>
                        {template.is_system && <Chip label="Sistema" size="small" variant="outlined" />}
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {template.code}
                      </Typography>
                      {template.description && (
                        <Typography variant="body2" color="text.secondary">
                          {template.description}
                        </Typography>
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell>{template.monitor_kind}</TableCell>
                  <TableCell sx={{ maxWidth: 420 }}>
                    <Typography variant="caption" sx={{ whiteSpace: 'pre-wrap' }}>
                      {configSummary(template.default_config)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Stack spacing={0.5}>
                      <Chip label={template.is_active ? 'Ativo' : 'Inativo'} color={template.is_active ? 'success' : 'default'} size="small" />
                      {knownUsage && <Typography variant="caption">{knownUsage.total_bindings} aplicação(ões)</Typography>}
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Visualizar">
                      <IconButton onClick={() => openTemplate(template, 'view')}>
                        <VisibilityIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Editar">
                      <IconButton onClick={() => openTemplate(template, 'edit')}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Uso do template">
                      <IconButton onClick={() => setUsageTemplate(template)}>
                        <InsightsIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {template.is_active ? (
                      <Tooltip title="Desativar">
                        <IconButton onClick={() => statusMutation.mutate({ id: template.id, action: 'deactivate' })}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    ) : (
                      <Tooltip title="Reativar">
                        <IconButton onClick={() => statusMutation.mutate({ id: template.id, action: 'reactivate' })}>
                          <RestoreIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {!template.is_system && !template.is_active && (
                      <Tooltip title="Remover fisicamente se não estiver em uso">
                        <IconButton
                          color="error"
                          onClick={() => {
                            if (confirm(`Remover fisicamente o template ${template.name}?`)) deleteMutation.mutate(template.id);
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={openForm} onClose={closeForm} maxWidth="md" fullWidth>
        <DialogTitle>{mode === 'create' ? 'Novo template' : mode === 'edit' ? 'Editar template' : 'Visualizar template'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {formError && <Alert severity="error">{formError}</Alert>}
            {selected && mode === 'edit' && (
              <Alert severity="warning" icon={<WarningAmberIcon />}>
                Como a herança é dinâmica, alterar a configuração padrão impacta queues que usam este template sem override no campo alterado.
              </Alert>
            )}
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  label="Code"
                  value={form.code}
                  disabled={mode !== 'create'}
                  helperText="Somente minúsculas, números e underline"
                  onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
                />
              </Grid>
              <Grid item xs={12} md={8}>
                <TextField
                  fullWidth
                  label="Nome"
                  value={form.name}
                  disabled={mode === 'view'}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField fullWidth label="Componente" value="queue" disabled />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Monitor kind"
                  value={form.monitor_kind}
                  disabled={mode === 'view'}
                  onChange={(event) => setForm((prev) => ({ ...prev, monitor_kind: event.target.value }))}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  minRows={2}
                  label="Descrição"
                  value={form.description}
                  disabled={mode === 'view'}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  minRows={8}
                  label="Configuração padrão (JSON)"
                  value={form.default_config_text}
                  disabled={mode === 'view'}
                  onChange={(event) => setForm((prev) => ({ ...prev, default_config_text: event.target.value }))}
                />
              </Grid>
              <Grid item xs={12}>
                <Divider textAlign="left">Datadog</Divider>
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  label="Tipo de monitor Datadog"
                  value={form.datadog_monitor_type}
                  disabled={mode === 'view'}
                  onChange={(event) => setForm((prev) => ({ ...prev, datadog_monitor_type: event.target.value }))}
                />
              </Grid>
              <Grid item xs={12} md={8}>
                <TextField
                  fullWidth
                  label="Tags usadas no grouping"
                  value="rabbitmq_cluster, vhost, queue"
                  disabled
                  helperText="Não adicionar novas tags/cardinalidade nesta etapa"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  minRows={4}
                  label="Query template Datadog"
                  value={form.datadog_query_template}
                  disabled={mode === 'view'}
                  helperText="Use placeholders como {{threshold}} e {{window}}. Variáveis Datadog com ponto, como {{queue.name}}, são preservadas."
                  onChange={(event) => setForm((prev) => ({ ...prev, datadog_query_template: event.target.value }))}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  minRows={5}
                  label="Message template Datadog"
                  value={form.datadog_message_template}
                  disabled={mode === 'view'}
                  helperText="Inclua o link público para /public/queue-reference usando rabbitmq_cluster, vhost e queue."
                  onChange={(event) => setForm((prev) => ({ ...prev, datadog_message_template: event.target.value }))}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  multiline
                  minRows={4}
                  label="Tags template Datadog (JSON array)"
                  value={form.datadog_tags_template_text}
                  disabled={mode === 'view'}
                  onChange={(event) => setForm((prev) => ({ ...prev, datadog_tags_template_text: event.target.value }))}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  multiline
                  minRows={4}
                  label="Options Datadog (JSON)"
                  value={form.datadog_options_text}
                  disabled={mode === 'view'}
                  onChange={(event) => setForm((prev) => ({ ...prev, datadog_options_text: event.target.value }))}
                />
              </Grid>
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={form.is_active}
                      disabled={mode === 'view'}
                      onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))}
                    />
                  }
                  label="Template ativo"
                />
              </Grid>
            </Grid>

            {selected && mode !== 'create' && (
              <Stack spacing={1}>
                <Divider />
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Button variant="outlined" startIcon={<InsightsIcon />} onClick={() => setUsageTemplate(selected)}>
                    Ver uso do template
                  </Button>
                  {mode === 'edit' && (
                    <Button variant="outlined" startIcon={<WarningAmberIcon />} onClick={handlePreviewImpact}>
                      Prévia de impacto
                    </Button>
                  )}
                </Stack>
                {impact && (
                  <Alert severity={impact.affected_inherited_bindings > 0 ? 'warning' : 'info'}>
                    <strong>{impact.affected_inherited_bindings}</strong> aplicação(ões) herdadas serão impactadas.{' '}
                    <strong>{impact.protected_by_override_bindings}</strong> aplicação(ões) têm override nos campos alterados. Campos alterados:{' '}
                    {[...impact.changed_keys, ...impact.added_keys, ...impact.removed_keys].join(', ') || 'nenhum'}.
                  </Alert>
                )}
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeForm}>Fechar</Button>
          {mode !== 'view' && (
            <Button variant="contained" onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              Salvar
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(usageTemplate)} onClose={() => setUsageTemplate(null)} maxWidth="lg" fullWidth>
        <DialogTitle>Uso do template: {usageTemplate?.name}</DialogTitle>
        <DialogContent dividers>
          {loadingUsage ? (
            <Typography>Carregando...</Typography>
          ) : usage ? (
            <Stack spacing={2}>
              <Grid container spacing={2}>
                <Grid item xs={6} md={2}>
                  <Chip label={`Total: ${usage.total_bindings}`} />
                </Grid>
                <Grid item xs={6} md={2}>
                  <Chip label={`Ativos: ${usage.enabled_bindings}`} color="success" />
                </Grid>
                <Grid item xs={6} md={2}>
                  <Chip label={`Customizados: ${usage.customized_bindings}`} color="warning" />
                </Grid>
                <Grid item xs={6} md={2}>
                  <Chip label={`Herdados: ${usage.inherited_bindings}`} color="info" />
                </Grid>
                <Grid item xs={6} md={2}>
                  <Chip label={`Queues ativas: ${usage.active_queues}`} />
                </Grid>
                <Grid item xs={6} md={2}>
                  <Chip label={`Removidas: ${usage.removed_queues}`} />
                </Grid>
              </Grid>
              <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Cluster</TableCell>
                      <TableCell>Vhost</TableCell>
                      <TableCell>Queue</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Configuração</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {usage.queues.map((row) => (
                      <TableRow key={row.binding_id} hover>
                        <TableCell>{row.cluster_name}</TableCell>
                        <TableCell>{row.vhost}</TableCell>
                        <TableCell>{row.queue_name}</TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={1} flexWrap="wrap">
                            <Chip size="small" label={row.enabled ? 'Ativo' : 'Inativo'} color={row.enabled ? 'success' : 'default'} />
                            {row.is_customized && <Chip size="small" label="Customizado" color="warning" />}
                            {row.is_removed && <Chip size="small" label="Queue removida" />}
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Typography component="pre" variant="caption" sx={{ m: 0, whiteSpace: 'pre-wrap' }}>
                            {row.overrides ? JSON.stringify(row.overrides, null, 2) : 'Herda configuração padrão'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Paper>
            </Stack>
          ) : (
            <Typography>Nenhum uso encontrado.</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUsageTemplate(null)}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
