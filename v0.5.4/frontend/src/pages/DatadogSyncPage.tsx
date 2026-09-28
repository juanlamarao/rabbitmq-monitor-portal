import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
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
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SaveIcon from '@mui/icons-material/Save';
import VisibilityIcon from '@mui/icons-material/Visibility';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiRequest } from '../services/api';
import {
  DatadogOrg,
  DatadogPlan,
  DatadogPlanBucket,
  DatadogPlanPersistResult,
  GeneratedMonitor,
  JobHistory,
  MonitorTemplate,
} from '../types/api';

function formatJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '-';
}

function planStateChip(state: string) {
  if (state === 'new') return <Chip size="small" label="Novo" color="info" />;
  if (state === 'changed') return <Chip size="small" label="Alterado" color="warning" />;
  return <Chip size="small" label="Sem alteração" color="success" />;
}

function syncStatusColor(status: string): 'default' | 'info' | 'warning' | 'success' | 'error' {
  if (status === 'synced') return 'success';
  if (status === 'pending_create' || status === 'pending_update' || status === 'planned') return 'info';
  if (status === 'orphaned' || status === 'disabled' || status === 'out_of_sync') return 'warning';
  if (status === 'error' || status === 'not_found') return 'error';
  return 'default';
}

export default function DatadogSyncPage() {
  const [datadogOrgId, setDatadogOrgId] = useState<string>('');
  const [templateId, setTemplateId] = useState<string>('');
  const [sampleLimit, setSampleLimit] = useState(10);
  const [selectedBucket, setSelectedBucket] = useState<DatadogPlanBucket | null>(null);
  const [selectedGeneratedMonitor, setSelectedGeneratedMonitor] = useState<GeneratedMonitor | null>(null);
  const [persistResult, setPersistResult] = useState<DatadogPlanPersistResult | null>(null);
  const [applyJob, setApplyJob] = useState<JobHistory | null>(null);
  const queryClient = useQueryClient();

  const { data: datadogOrgs = [] } = useQuery({
    queryKey: ['datadog-orgs'],
    queryFn: () => apiRequest<DatadogOrg[]>('/admin/datadog-orgs'),
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['templates-active'],
    queryFn: () => apiRequest<MonitorTemplate[]>('/templates?component_type=queue&active_only=true'),
  });

  const planUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (datadogOrgId) params.set('datadog_org_id', datadogOrgId);
    if (templateId) params.set('template_id', templateId);
    params.set('sample_limit', String(sampleLimit || 10));
    return `/datadog-sync/plan?${params.toString()}`;
  }, [datadogOrgId, templateId, sampleLimit]);

  const generatedUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (datadogOrgId) params.set('datadog_org_id', datadogOrgId);
    if (templateId) params.set('template_id', templateId);
    params.set('limit', '200');
    params.set('active_only', 'true');
    return `/datadog-sync/generated-monitors?${params.toString()}`;
  }, [datadogOrgId, templateId]);

  const { data: plan, refetch, isFetching, error } = useQuery({
    queryKey: ['datadog-plan', datadogOrgId, templateId, sampleLimit],
    queryFn: () => apiRequest<DatadogPlan>(planUrl),
  });

  const { data: generatedMonitors = [], refetch: refetchGeneratedMonitors } = useQuery({
    queryKey: ['generated-monitors', datadogOrgId, templateId],
    queryFn: () => apiRequest<GeneratedMonitor[]>(generatedUrl),
  });

  const applicableGeneratedMonitors = useMemo(
    () => generatedMonitors.filter((monitor) => ['pending_create', 'pending_update', 'error'].includes(monitor.sync_status)),
    [generatedMonitors],
  );

  const persistMutation = useMutation({
    mutationFn: () =>
      apiRequest<DatadogPlanPersistResult>('/datadog-sync/plan/persist', {
        method: 'POST',
        body: JSON.stringify({
          datadog_org_id: datadogOrgId ? Number(datadogOrgId) : null,
          template_id: templateId ? Number(templateId) : null,
          sample_limit: sampleLimit || 10,
        }),
      }),
    onSuccess: (result) => {
      setPersistResult(result);
      queryClient.invalidateQueries({ queryKey: ['datadog-plan'] });
      queryClient.invalidateQueries({ queryKey: ['generated-monitors'] });
      refetchGeneratedMonitors();
      refetch();
    },
  });

  const applyMutation = useMutation({
    mutationFn: () =>
      apiRequest<JobHistory>('/jobs/datadog/sync', {
        method: 'POST',
        body: JSON.stringify({
          datadog_org_id: datadogOrgId ? Number(datadogOrgId) : null,
          template_id: templateId ? Number(templateId) : null,
          monitor_ids: null,
        }),
      }),
    onSuccess: (job) => {
      setApplyJob(job);
      queryClient.invalidateQueries({ queryKey: ['generated-monitors'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      refetchGeneratedMonitors();
    },
  });


  const validateMutation = useMutation({
    mutationFn: (monitorId: number) =>
      apiRequest(`/datadog-sync/generated-monitors/${monitorId}/validate`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generated-monitors'] });
      refetchGeneratedMonitors();
    },
  });

  function handleApplyDatadogSync() {
    const total = applicableGeneratedMonitors.length;
    const created = applicableGeneratedMonitors.filter((monitor) => monitor.sync_status === 'pending_create').length;
    const updated = applicableGeneratedMonitors.filter((monitor) => monitor.sync_status === 'pending_update').length;
    const retryErrors = applicableGeneratedMonitors.filter((monitor) => monitor.sync_status === 'error').length;
    const scope = `${datadogOrgId ? 'org selecionada' : 'todas as orgs'} / ${templateId ? 'template selecionado' : 'todos os templates'}`;
    const confirmed = window.confirm(
      `Aplicar monitores no Datadog para ${scope}?\n\nCriar: ${created}\nAtualizar: ${updated}\nReprocessar erros: ${retryErrors}\nTotal: ${total}\n\nOrphaned e disabled serão ignorados.`,
    );
    if (confirmed) applyMutation.mutate();
  }

  const summary = plan?.summary;

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
        <Box>
          <Typography variant="h4" fontWeight={800}>
            Datadog Sync
          </Typography>
          <Typography color="text.secondary">
            Planejamento e estado desejado de monitores dedicados: 1 template aplicado em 1 fila = 1 monitor Datadog.
          </Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => refetch()} disabled={isFetching} sx={{ fontWeight: 800 }}>
            Recalcular dry-run
          </Button>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={() => persistMutation.mutate()}
            disabled={persistMutation.isPending || isFetching || !plan?.buckets?.length}
            sx={{ fontWeight: 800 }}
          >
            Salvar plano
          </Button>
          <Button
            variant="contained"
            color="success"
            startIcon={<PlayArrowIcon />}
            onClick={handleApplyDatadogSync}
            disabled={applyMutation.isPending || applicableGeneratedMonitors.length === 0}
            sx={{ fontWeight: 800 }}
          >
            Aplicar no Datadog
          </Button>
        </Stack>
      </Stack>

      <Alert severity="info">
        Esta versão cria e atualiza monitores dedicados reais no Datadog via job assíncrono. Monitores orphaned/disabled continuam protegidos e não são alterados nesta etapa.
      </Alert>

      {persistResult && (
        <Alert severity="success">
          Plano salvo: {persistResult.created} criados, {persistResult.updated} atualizados, {persistResult.unchanged} sem alteração,
          {` ${persistResult.orphaned} órfãos e ${persistResult.skipped_with_errors} ignorados por erro.`}
        </Alert>
      )}
      {persistMutation.error instanceof Error && <Alert severity="error">{persistMutation.error.message}</Alert>}
      {applyJob && (
        <Alert severity="success">
          Job de aplicação Datadog enfileirado: #{applyJob.id}. Acompanhe em Administração &gt; Jobs.
        </Alert>
      )}
      {applyMutation.error instanceof Error && <Alert severity="error">{applyMutation.error.message}</Alert>}
      {validateMutation.error instanceof Error && <Alert severity="error">{validateMutation.error.message}</Alert>}

      <Paper className="main-filter-panel" sx={{ p: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Org Datadog</InputLabel>
              <Select label="Org Datadog" value={datadogOrgId} onChange={(event) => setDatadogOrgId(event.target.value)}>
                <MenuItem value="">Todas</MenuItem>
                {datadogOrgs.map((org) => (
                  <MenuItem key={org.id} value={String(org.id)}>
                    {org.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Template</InputLabel>
              <Select label="Template" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
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
            <TextField
              fullWidth
              label="Amostra por monitor"
              type="number"
              value={sampleLimit}
              inputProps={{ min: 1, max: 100 }}
              onChange={(event) => setSampleLimit(Number(event.target.value || 10))}
            />
          </Grid>
        </Grid>
      </Paper>

      {error instanceof Error && <Alert severity="error">{error.message}</Alert>}

      {summary && (
        <Grid container spacing={2}>
          <Grid item xs={6} md={2}>
            <Chip label={`Buckets: ${summary.total_buckets}`} />
          </Grid>
          <Grid item xs={6} md={2}>
            <Chip label={`Queues: ${summary.total_queues_covered}`} color="info" />
          </Grid>
          <Grid item xs={6} md={2}>
            <Chip label={`Novos: ${summary.new_buckets}`} color="info" />
          </Grid>
          <Grid item xs={6} md={2}>
            <Chip label={`Alterados: ${summary.changed_buckets}`} color={summary.changed_buckets ? 'warning' : 'success'} />
          </Grid>
          <Grid item xs={6} md={2}>
            <Chip label={`Sem alteração: ${summary.unchanged_buckets}`} color="success" />
          </Grid>
          <Grid item xs={6} md={2}>
            <Chip label={`Erros: ${summary.buckets_with_errors}`} color={summary.buckets_with_errors ? 'error' : 'success'} />
          </Grid>
        </Grid>
      )}

      <Paper sx={{ overflow: 'hidden' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Org</TableCell>
              <TableCell>Template</TableCell>
              <TableCell>Configuração efetiva</TableCell>
              <TableCell>Queues</TableCell>
              <TableCell>Estado</TableCell>
              <TableCell>Query</TableCell>
              <TableCell align="right">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(plan?.buckets || []).map((bucket) => (
              <TableRow key={bucket.bucket_key} hover>
                <TableCell>{bucket.datadog_org_name}</TableCell>
                <TableCell>
                  <Stack spacing={0.5}>
                    <Typography fontWeight={700}>{bucket.template_code}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {bucket.monitor_type} · {bucket.strategy}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">Hash: {bucket.desired_config_hash.slice(0, 12)}</Typography>
                  </Stack>
                </TableCell>
                <TableCell sx={{ maxWidth: 260 }}>
                  <Typography variant="caption" sx={{ whiteSpace: 'pre-wrap' }}>
                    {Object.entries(bucket.effective_config).map(([k, v]) => `${k}: ${String(v)}`).join(' | ')}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Stack spacing={0.5}>
                    <Typography>{bucket.queue_count}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {bucket.inherited_queue_count} herdadas · {bucket.customized_queue_count} customizadas
                    </Typography>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    {planStateChip(bucket.plan_state)}
                    {bucket.saved_sync_status && <Chip size="small" label={bucket.saved_sync_status} color={syncStatusColor(bucket.saved_sync_status)} />}
                    {bucket.errors.length > 0 && <Chip size="small" label={`${bucket.errors.length} erro(s)`} color="error" />}
                    {bucket.errors.length === 0 && <Chip size="small" label="Planejável" color="success" />}
                  </Stack>
                </TableCell>
                <TableCell sx={{ maxWidth: 360 }}>
                  <Typography variant="caption" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {bucket.query || 'Query não configurada'}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Visualizar dry-run">
                    <Button size="small" startIcon={<VisibilityIcon />} onClick={() => setSelectedBucket(bucket)}>
                      Ver
                    </Button>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Box>
        <Typography variant="h5" fontWeight={800} sx={{ mb: 1 }}>
          Estado desejado salvo
        </Typography>
        <Paper sx={{ overflow: 'hidden' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Org</TableCell>
                <TableCell>Template</TableCell>
                <TableCell>Nome planejado</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Queues</TableCell>
                <TableCell>Último plano</TableCell>
                <TableCell>Último sync</TableCell>
                <TableCell>Datadog</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {generatedMonitors.map((monitor) => (
                <TableRow key={monitor.id} hover>
                  <TableCell>{monitor.datadog_org_name || '-'}</TableCell>
                  <TableCell>{monitor.template_code || '-'}</TableCell>
                  <TableCell sx={{ maxWidth: 320 }}>
                    <Typography variant="caption" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{monitor.name || '-'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={monitor.sync_status} color={syncStatusColor(monitor.sync_status)} />
                  </TableCell>
                  <TableCell>{monitor.covered_queues_count}</TableCell>
                  <TableCell>{formatDate(monitor.last_planned_at)}</TableCell>
                  <TableCell>{formatDate(monitor.last_synced_at)}</TableCell>
                  <TableCell>
                    {monitor.external_monitor_url ? (
                      <Button size="small" href={monitor.external_monitor_url} target="_blank" rel="noreferrer">
                        Abrir
                      </Button>
                    ) : (
                      <Typography variant="caption" color="text.secondary">-</Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <Button size="small" startIcon={<VisibilityIcon />} onClick={() => setSelectedGeneratedMonitor(monitor)}>
                        Ver
                      </Button>
                      <Button
                        size="small"
                        startIcon={<RefreshIcon />}
                        onClick={() => validateMutation.mutate(monitor.id)}
                        disabled={!monitor.external_monitor_id || validateMutation.isPending}
                      >
                        Validar
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {!generatedMonitors.length && (
                <TableRow>
                  <TableCell colSpan={9}>
                    <Typography color="text.secondary">Nenhum estado desejado salvo para os filtros atuais.</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>
      </Box>

      <Dialog open={Boolean(selectedBucket)} onClose={() => setSelectedBucket(null)} maxWidth="lg" fullWidth>
        <DialogTitle>Dry-run do monitor dedicado</DialogTitle>
        <DialogContent dividers>
          {selectedBucket && (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Chip label={selectedBucket.datadog_org_name} />
                <Chip label={selectedBucket.template_code} color="info" />
                <Chip label={`${selectedBucket.queue_count} queue(s)`} />
                {planStateChip(selectedBucket.plan_state)}
                {selectedBucket.errors.length > 0 && <Chip label="Com erro" color="error" />}
              </Stack>
              {selectedBucket.errors.map((item) => (
                <Alert key={item} severity="error">{item}</Alert>
              ))}
              {selectedBucket.warnings.map((item) => (
                <Alert key={item} severity="warning" icon={<WarningAmberIcon />}>{item}</Alert>
              ))}
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Typography fontWeight={700}>Query gerada</Typography>
                  <Typography component="pre" variant="caption" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {selectedBucket.query || 'Query não configurada'}
                  </Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography fontWeight={700}>Mensagem gerada</Typography>
                  <Typography component="pre" variant="caption" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {selectedBucket.message || 'Mensagem não configurada'}
                  </Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography fontWeight={700}>Tags</Typography>
                  <Typography component="pre" variant="caption">{formatJson(selectedBucket.tags)}</Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography fontWeight={700}>Options</Typography>
                  <Typography component="pre" variant="caption">{formatJson(selectedBucket.options)}</Typography>
                </Grid>
              </Grid>
              <Typography fontWeight={700}>Amostra de queues incluídas</Typography>
              <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Cluster</TableCell>
                      <TableCell>Vhost</TableCell>
                      <TableCell>Queue</TableCell>
                      <TableCell>Contexto no portal</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedBucket.sample_queues.map((queue) => (
                      <TableRow key={queue.queue_id} hover>
                        <TableCell>{queue.rabbitmq_cluster_tag}</TableCell>
                        <TableCell>{queue.vhost}</TableCell>
                        <TableCell>{queue.queue}</TableCell>
                        <TableCell>
                          <Stack spacing={0.5}>
                            <Typography variant="caption">Serviço: {queue.service_name || '-'}</Typography>
                            <Typography variant="caption">Criticidade: {queue.criticality || '-'}</Typography>
                            <Typography variant="caption">Owner: {queue.owner_email || '-'}</Typography>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Paper>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedBucket(null)}>Fechar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(selectedGeneratedMonitor)} onClose={() => setSelectedGeneratedMonitor(null)} maxWidth="lg" fullWidth>
        <DialogTitle>Estado desejado salvo</DialogTitle>
        <DialogContent dividers>
          {selectedGeneratedMonitor && (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Chip label={selectedGeneratedMonitor.datadog_org_name || '-'} />
                <Chip label={selectedGeneratedMonitor.template_code || '-'} color="info" />
                <Chip label={selectedGeneratedMonitor.sync_status} color={syncStatusColor(selectedGeneratedMonitor.sync_status)} />
                <Chip label={`${selectedGeneratedMonitor.covered_queues_count} queue(s)`} />
              </Stack>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Typography fontWeight={700}>Query</Typography>
                  <Typography component="pre" variant="caption" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {selectedGeneratedMonitor.query || '-'}
                  </Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography fontWeight={700}>Mensagem</Typography>
                  <Typography component="pre" variant="caption" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {selectedGeneratedMonitor.message || '-'}
                  </Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography fontWeight={700}>Tags</Typography>
                  <Typography component="pre" variant="caption">{formatJson(selectedGeneratedMonitor.tags)}</Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography fontWeight={700}>Options</Typography>
                  <Typography component="pre" variant="caption">{formatJson(selectedGeneratedMonitor.options)}</Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography fontWeight={700}>Hash desejado</Typography>
                  <Typography variant="caption">{selectedGeneratedMonitor.desired_config_hash || '-'}</Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography fontWeight={700}>Hash aplicado</Typography>
                  <Typography variant="caption">{selectedGeneratedMonitor.applied_config_hash || '-'}</Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography fontWeight={700}>Monitor Datadog</Typography>
                  {selectedGeneratedMonitor.external_monitor_url ? (
                    <Button size="small" href={selectedGeneratedMonitor.external_monitor_url} target="_blank" rel="noreferrer">
                      Abrir monitor #{selectedGeneratedMonitor.external_monitor_id}
                    </Button>
                  ) : (
                    <Typography variant="caption">-</Typography>
                  )}
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography fontWeight={700}>Último sync</Typography>
                  <Typography variant="caption">{formatDate(selectedGeneratedMonitor.last_synced_at)}</Typography>
                </Grid>
              </Grid>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedGeneratedMonitor(null)}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
