import Grid from '../components/PortalGrid';
import { Add, ArrowBack, Delete } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Divider,
  Switch,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  SelectChangeEvent,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../services/api';
import { useAuth } from '../services/authContext';
import { Cluster, ClusterFormPayload, DatadogDimension, DatadogOrg, Protocol, SREGroup } from '../types/api';

const emptyForm: ClusterFormPayload = {
  name: '',
  environment: 'prod',
  business_line: '',
  connection_type: 'management_api',
  metrics_endpoints: '',
  protocol: 'http',
  dns: '',
  api_port: 15672,
  api_username: '',
  api_password: '',
  sre_group_id: null,
  datadog_org_id: null,
  datadog_integration_type: 'custom',
  datadog_cluster_tag_value: '',
  datadog_use_cluster_dimension: true,
  datadog_extra_dimensions: [],
  datadog_cluster_tag_key: 'rabbitmq_cluster',
  datadog_vhost_tag_key: 'vhost',
  datadog_queue_tag_key: 'queue',
  datadog_node_tag_key: '',
  datadog_metric_messages: 'rabbitmq.queue.messages',
  datadog_metric_consumers: 'rabbitmq.queue.consumers',
  temporary_queue_regexes: ['^$'],
  is_active: true,
};

function PreviewValue({ value, placeholder }: { value?: string | number | null; placeholder: string }) {
  const filled = value !== undefined && value !== null && String(value).trim() !== '';
  return (
    <Typography component="span" color={filled ? 'text.primary' : 'text.disabled'} fontWeight={filled ? 700 : 500}>
      {filled ? value : `<${placeholder}>`}
    </Typography>
  );
}

export default function ClusterFormPage() {
  const auth=useAuth();
  const { clusterId } = useParams();
  const isEdit = Boolean(clusterId);
  const location = useLocation();
  const isView = location.pathname.endsWith('/view');
  const canEdit = !isView && Boolean(auth.is_admin || auth.is_observability);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ClusterFormPayload>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const { data: groups = [] } = useQuery({ queryKey: ['sre-groups'], queryFn: () => apiRequest<SREGroup[]>('/admin/sre-groups') });
  const { data: orgs = [] } = useQuery({ queryKey: ['datadog-orgs'], queryFn: () => apiRequest<DatadogOrg[]>('/admin/datadog-orgs') });
  const { data: cluster } = useQuery({
    queryKey: ['cluster', clusterId],
    enabled: isEdit,
    queryFn: () => apiRequest<Cluster>(`/clusters/${clusterId}`),
  });

  useEffect(() => {
    if (cluster) {
      setForm({
        name: cluster.name,
        environment: cluster.environment,
        business_line: cluster.business_line || '',
        connection_type: cluster.connection_type || 'management_api',
        metrics_endpoints: cluster.metrics_endpoints || '',
        protocol: cluster.protocol,
        dns: cluster.dns,
        api_port: cluster.api_port,
        api_username: cluster.api_username,
        api_password: '',
        sre_group_id: cluster.sre_group_id || null,
        datadog_org_id: cluster.datadog_org_id || null,
        datadog_integration_type: cluster.datadog_integration_type || 'custom',
        datadog_cluster_tag_value: cluster.datadog_cluster_tag_value || cluster.name,
        datadog_use_cluster_dimension: cluster.datadog_use_cluster_dimension ?? true,
        datadog_extra_dimensions: cluster.datadog_extra_dimensions || [],
        datadog_cluster_tag_key: cluster.datadog_cluster_tag_key || 'rabbitmq_cluster',
        datadog_vhost_tag_key: cluster.datadog_vhost_tag_key || 'vhost',
        datadog_queue_tag_key: cluster.datadog_queue_tag_key || 'queue',
        datadog_node_tag_key: cluster.datadog_node_tag_key || '',
        datadog_metric_messages: cluster.datadog_metric_messages || 'rabbitmq.queue.messages',
        datadog_metric_consumers: cluster.datadog_metric_consumers || 'rabbitmq.queue.consumers',
        temporary_queue_regexes: cluster.temporary_queue_regexes.map((item) => item.pattern),
        is_active: cluster.is_active,
      });
    }
  }, [cluster]);

  const selectedGroup = useMemo(() => groups.find((group) => group.id === form.sre_group_id), [groups, form.sre_group_id]);
  const selectedOrg = useMemo(() => orgs.find((org) => org.id === form.datadog_org_id), [orgs, form.datadog_org_id]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { ...form };
      if (isEdit && !payload.api_password) {
        delete payload.api_password;
      }
      return apiRequest<Cluster>(isEdit ? `/clusters/${clusterId}` : '/clusters', {
        method: isEdit ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
      navigate('/clusters');
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Erro ao salvar cluster'),
  });

  function updateField<K extends keyof ClusterFormPayload>(field: K, value: ClusterFormPayload[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateRegex(index: number, value: string) {
    setForm((current) => ({
      ...current,
      temporary_queue_regexes: current.temporary_queue_regexes.map((item, itemIndex) => (itemIndex === index ? value : item)),
    }));
  }

  function addRegex() {
    setForm((current) => ({ ...current, temporary_queue_regexes: [...current.temporary_queue_regexes, ''] }));
  }

  function removeRegex(index: number) {
    setForm((current) => ({
      ...current,
      temporary_queue_regexes: current.temporary_queue_regexes.filter((_, itemIndex) => itemIndex !== index),
    }));
  }


  function applyDatadogProfile(profile: string) {
    if (profile === 'agent_rabbitmq_prefixed') {
      setForm((current) => ({
        ...current,
        datadog_integration_type: profile,
        datadog_cluster_tag_key: 'rabbitmq_cluster',
        datadog_vhost_tag_key: 'rabbitmq_vhost',
        datadog_queue_tag_key: 'rabbitmq_queue',
        datadog_node_tag_key: 'rabbitmq_node',
      }));
      return;
    }
    if (profile === 'prometheus_openmetrics') {
      setForm((current) => ({
        ...current,
        datadog_integration_type: profile,
        datadog_cluster_tag_key: 'rabbitmq_cluster',
        datadog_vhost_tag_key: 'vhost',
        datadog_queue_tag_key: 'queue',
        datadog_node_tag_key: 'node',
      }));
      return;
    }
    updateField('datadog_integration_type', profile);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    setError(null);
    const extra = form.datadog_extra_dimensions || [];
    if (!form.datadog_use_cluster_dimension && extra.length === 0) {
      setError('Sem a dimensão cluster, adicione ao menos uma dimensão personalizada.');
      return;
    }
    const reserved = [form.datadog_cluster_tag_key, form.datadog_vhost_tag_key, form.datadog_queue_tag_key]
      .map(key => (key || '').trim().toLowerCase());
    const seen = new Set(reserved);
    for (const {key,value} of extra) {
      if (!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(key.trim()) || !value.trim() || /[,{}\\\r\n]/.test(value)) {
        setError('Preencha uma tag válida e um valor sem vírgulas ou chaves para cada dimensão.');
        return;
      }
      if (seen.has(key.trim().toLowerCase())) {
        setError(`A dimensão ${key} está repetida ou já é utilizada por cluster, vhost ou queue.`);
        return;
      }
      seen.add(key.trim().toLowerCase());
    }
    saveMutation.mutate();
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} alignItems="center">
        <Button component={RouterLink} to="/clusters" startIcon={<ArrowBack />}>
          Voltar
        </Button>
        <Box>
          <Typography variant="h4" fontWeight={800}>
            {isView ? 'Visualizar cluster' : isEdit ? 'Editar cluster' : 'Novo cluster'}
          </Typography>
        </Box>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <Grid container spacing={3} alignItems="flex-start">
        <Grid item xs={12} lg={7}>
          <Paper component="form" onSubmit={submit} sx={{ p: 3 }}>
            <Stack spacing={3}>
              <Box>
                <Typography variant="h6" fontWeight={800}>
                  Dados principais
                </Typography>
                <Stack spacing={2} sx={{ mt: 2 }}>
                  <TextField label="Nome" value={form.name} onChange={(e) => updateField('name', e.target.value)} required disabled={!canEdit} />
                  <TextField
                    label="Linha de negócio"
                    value={form.business_line || ''}
                    onChange={(e) => updateField('business_line', e.target.value)}
                    multiline
                    minRows={2}
                    disabled={!canEdit}
                  />
                </Stack>
              </Box>

              <Divider />

              <Box>
                <Typography variant="h6" fontWeight={800}>
                  Connection
                </Typography>
                <Stack spacing={2} sx={{ mt: 2 }}>
                  <FormControl fullWidth>
                    <InputLabel>Tipo de conexão RabbitMQ</InputLabel>
                    <Select label="Tipo de conexão RabbitMQ" value={form.connection_type || 'management_api'} disabled={!canEdit}
                      onChange={(e: SelectChangeEvent) => setForm(current => ({ ...current,
                        connection_type: e.target.value as 'management_api' | 'prometheus_metrics',
                        api_port: e.target.value === 'prometheus_metrics' && current.api_port === 15672 ? 15692
                          : e.target.value === 'management_api' && current.api_port === 15692 ? 15672 : current.api_port,
                      }))}>
                      <MenuItem value="management_api">Management API (15672)</MenuItem>
                      <MenuItem value="prometheus_metrics">Prometheus /metrics (15692)</MenuItem>
                    </Select>
                  </FormControl>
                  {form.connection_type === 'prometheus_metrics' && <Alert severity="info">
                    O discovery lê séries por fila do endpoint /metrics/detailed. Não fornece tipo, durabilidade, exclusive/auto-delete
                    nem garante presença de filas sem séries. Informe todos os nós para ampliar a cobertura.
                  </Alert>}
                  <TextField label="DNS do cluster" value={form.dns} onChange={(e) => updateField('dns', e.target.value)} required disabled={!canEdit} />
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth>
                        <InputLabel>Protocolo</InputLabel>
                        <Select
                          disabled={!canEdit}
                          label="Protocolo"
                          value={form.protocol}
                          onChange={(e: SelectChangeEvent) => updateField('protocol', e.target.value as Protocol)}
                        >
                          <MenuItem value="http">http</MenuItem>
                          <MenuItem value="https">https</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        label={form.connection_type === 'prometheus_metrics' ? 'Porta /metrics' : 'Porta da API'}
                        type="number"
                        value={form.api_port}
                        onChange={(e) => updateField('api_port', Number(e.target.value))}
                        required
                        fullWidth
                        disabled={!canEdit}
                      />
                    </Grid>
                  </Grid>
                  {form.connection_type === 'prometheus_metrics' &&
                    <TextField label="Endpoints Prometheus (um por linha; opcional)" multiline minRows={2}
                      helperText="Ex.: http://rabbit-01:15692 e http://rabbit-02:15692. Em branco utiliza DNS e porta acima."
                      value={form.metrics_endpoints || ''} onChange={e=>updateField('metrics_endpoints', e.target.value)}
                      disabled={!canEdit} />}
                </Stack>
              </Box>

              <Divider />

              <Box>
                <Typography variant="h6" fontWeight={800}>
                  Credentials
                </Typography>
                <Stack spacing={2} sx={{ mt: 2 }}>
                  <TextField label={form.connection_type === 'prometheus_metrics' ? 'Usuário HTTP (opcional)' : 'Usuário da API'} value={form.api_username} onChange={(e) => updateField('api_username', e.target.value)} required disabled={!canEdit} />
                  <TextField
                    label={form.connection_type === 'prometheus_metrics' ? 'Senha HTTP (opcional)' : isEdit ? 'Nova senha da API (opcional)' : 'Senha da API'}
                    type="password"
                    value={form.api_password || ''}
                    onChange={(e) => updateField('api_password', e.target.value)}
                    required={!isEdit && form.connection_type === 'management_api'}
                    disabled={!canEdit}
                  />
                </Stack>
              </Box>

              <Divider />

              <Box>
                <Typography variant="h6" fontWeight={800}>
                  Responsables
                </Typography>
                <Stack spacing={2} sx={{ mt: 2 }}>
                  <FormControl fullWidth>
                    <InputLabel>Grupo SRE responsável</InputLabel>
                    <Select
                      disabled={!canEdit}
                      label="Grupo SRE responsável"
                      value={form.sre_group_id ? String(form.sre_group_id) : ''}
                      onChange={(e: SelectChangeEvent) => updateField('sre_group_id', e.target.value ? Number(e.target.value) : null)}
                    >
                      <MenuItem value="">Nenhum</MenuItem>
                      {groups.map((group) => (
                        <MenuItem key={group.id} value={group.id}>
                          {group.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>
              </Box>

              <Divider />

              <Box>
                <Typography variant="h6" fontWeight={800}>
                  Observability
                </Typography>
                <Stack spacing={2} sx={{ mt: 2 }}>
                  <FormControl fullWidth>
                    <InputLabel>Datadog Org</InputLabel>
                    <Select
                      disabled={!canEdit}
                      label="Datadog Org"
                      value={form.datadog_org_id ? String(form.datadog_org_id) : ''}
                      onChange={(e: SelectChangeEvent) => updateField('datadog_org_id', e.target.value ? Number(e.target.value) : null)}
                    >
                      <MenuItem value="">Nenhuma</MenuItem>
                      {orgs.map((org) => (
                        <MenuItem key={org.id} value={org.id}>
                          {org.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl fullWidth>
                    <InputLabel>Perfil de integração Datadog</InputLabel>
                    <Select
                      disabled={!canEdit}
                      label="Perfil de integração Datadog"
                      value={form.datadog_integration_type || 'custom'}
                      onChange={(e: SelectChangeEvent) => applyDatadogProfile(e.target.value)}
                    >
                      <MenuItem value="custom">Custom</MenuItem>
                      <MenuItem value="prometheus_openmetrics">RabbitMQ OpenMetrics / Prometheus</MenuItem>
                      <MenuItem value="agent_rabbitmq_prefixed">RabbitMQ Agent - tags rabbitmq_*</MenuItem>
                    </Select>
                  </FormControl>

                  <TextField
                    label="Valor do cluster no Datadog"
                    value={form.datadog_cluster_tag_value || ''}
                    onChange={(e) => updateField('datadog_cluster_tag_value', e.target.value)}
                    helperText="Valor exato da tag do cluster no Datadog. Se vazio, o portal usa o nome do cluster."
                    disabled={!canEdit}
                  />

                  <FormControlLabel
                    control={<Switch checked={form.datadog_use_cluster_dimension ?? true} disabled={!canEdit}
                      onChange={(e) => updateField('datadog_use_cluster_dimension', e.target.checked)} />}
                    label="Usar dimensão do cluster nas consultas dos monitores"
                  />
                  <Typography variant="body2" color="text.secondary">
                    O valor do cluster permanece cadastrado para referência, mesmo quando não é utilizado como filtro no Datadog.
                  </Typography>

                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={4}>
                      <TextField label="Tag cluster" value={form.datadog_cluster_tag_key || 'rabbitmq_cluster'} onChange={(e) => updateField('datadog_cluster_tag_key', e.target.value)} fullWidth disabled={!canEdit} />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField label="Tag vhost" value={form.datadog_vhost_tag_key || 'vhost'} onChange={(e) => updateField('datadog_vhost_tag_key', e.target.value)} fullWidth disabled={!canEdit} />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField label="Tag queue" value={form.datadog_queue_tag_key || 'queue'} onChange={(e) => updateField('datadog_queue_tag_key', e.target.value)} fullWidth disabled={!canEdit} />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField label="Métrica mensagens" value={form.datadog_metric_messages || 'rabbitmq.queue.messages'} onChange={(e) => updateField('datadog_metric_messages', e.target.value)} fullWidth disabled={!canEdit} />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField label="Métrica consumidores" value={form.datadog_metric_consumers || 'rabbitmq.queue.consumers'} onChange={(e) => updateField('datadog_metric_consumers', e.target.value)} fullWidth disabled={!canEdit} />
                    </Grid>
                  </Grid>


                  <Box sx={{mt: 2}}>
                    <Typography fontWeight={700} gutterBottom>Dimensões adicionais Datadog</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{mb: 1.5}}>
                      Filtros estáticos incluídos nas consultas de todos os monitores deste cluster, além de vhost e queue.
                    </Typography>
                    <Stack spacing={1.5}>
                      {(form.datadog_extra_dimensions || []).map((dimension: DatadogDimension, index: number) => (
                        <Stack key={index} direction={{xs:'column',sm:'row'}} spacing={1} alignItems={{sm:'center'}}>
                          <TextField size="small" label="Nome da tag" value={dimension.key} disabled={!canEdit} fullWidth
                            placeholder="environment" onChange={e => updateField('datadog_extra_dimensions',
                              (form.datadog_extra_dimensions || []).map((dim, idx) => idx === index ? {...dim,key:e.target.value} : dim))}/>
                          <TextField size="small" label="Valor" value={dimension.value} disabled={!canEdit} fullWidth
                            placeholder="production" onChange={e => updateField('datadog_extra_dimensions',
                              (form.datadog_extra_dimensions || []).map((dim, idx) => idx === index ? {...dim,value:e.target.value} : dim))}/>
                          <IconButton aria-label="Remover dimensão" disabled={!canEdit} onClick={() => updateField('datadog_extra_dimensions',
                            (form.datadog_extra_dimensions || []).filter((_, idx) => idx !== index))}><Delete /></IconButton>
                        </Stack>
                      ))}
                      <Button size="small" variant="outlined" startIcon={<Add />} sx={{alignSelf:'flex-start'}}
                        disabled={!canEdit || (form.datadog_extra_dimensions || []).length >= 25}
                        onClick={() => updateField('datadog_extra_dimensions',
                          [...(form.datadog_extra_dimensions || []), {key:'',value:''}])}>Adicionar dimensão</Button>
                    </Stack>
                  </Box>



                  <Box>
                    <Typography fontWeight={700} gutterBottom>
                      Regex para filas temporárias
                    </Typography>
                    <Stack spacing={1}>
                      {form.temporary_queue_regexes.map((regex, index) => (
                        <Stack key={index} direction="row" spacing={1}>
                          <TextField value={regex} onChange={(e) => updateRegex(index, e.target.value)} fullWidth placeholder="^$" disabled={!canEdit} />
                          <IconButton onClick={() => removeRegex(index)} disabled={!canEdit || form.temporary_queue_regexes.length === 1}>
                            <Delete />
                          </IconButton>
                        </Stack>
                      ))}
                      <Button startIcon={<Add />} onClick={addRegex} variant="outlined" disabled={!canEdit}>
                        Adicionar regex
                      </Button>
                    </Stack>
                  </Box>

                  <Box>
                    <Typography fontWeight={700} gutterBottom>
                      Componentes monitorados
                    </Typography>
                    <Grid container>
                      <Grid item xs={12} sm={6}>
                        <FormControlLabel control={<Checkbox checked disabled />} label="Cluster" />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <FormControlLabel control={<Checkbox checked disabled />} label="Queues" />
                      </Grid>
                      {['Exchanges', 'Connections', 'Nodes', 'Shovels'].map((item) => (
                        <Grid item xs={12} sm={6} key={item}>
                          <FormControlLabel control={<Checkbox disabled />} label={item} />
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                </Stack>
              </Box>

              {canEdit && (
                <Button type="submit" size="large" variant="contained" disabled={saveMutation.isPending || !canEdit}>
                  {isEdit ? 'Salvar alterações' : 'Criar cluster'}
                </Button>
              )}
            </Stack>
          </Paper>
        </Grid>

        <Grid item xs={12} lg={5} sx={{ position: { lg: 'sticky' }, top: 88 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={800} gutterBottom>
                Ficha visual do cluster
              </Typography>
              <Stack spacing={1.5}>
                <Typography>
                  Nome: <PreviewValue value={form.name} placeholder="nome" />
                </Typography>
                <Typography>
                  Linha de negócio: <PreviewValue value={form.business_line} placeholder="linha_de_negocio" />
                </Typography>
                <Typography>
                  Endpoint:{' '}
                  <PreviewValue value={form.protocol} placeholder="protocolo" />://<PreviewValue value={form.dns} placeholder="dns" />:
                  <PreviewValue value={form.api_port} placeholder="porta" />
                </Typography>
                <Typography>
                  Usuário API: <PreviewValue value={form.api_username} placeholder="usuario" />
                </Typography>
                <Typography>
                  Grupo SRE: <PreviewValue value={selectedGroup?.name} placeholder="grupo_sre" />
                </Typography>
                <Typography>
                  Datadog Org: <PreviewValue value={selectedOrg?.name} placeholder="datadog_org" />
                </Typography>
                <Typography>
                  Perfil Datadog: <PreviewValue value={form.datadog_integration_type} placeholder="perfil_datadog" />
                </Typography>
                <Typography>
                  Cluster tag: <PreviewValue value={form.datadog_cluster_tag_key} placeholder="cluster_tag" />=<PreviewValue value={form.datadog_cluster_tag_value || form.name} placeholder="cluster_tag_value" /> {form.datadog_use_cluster_dimension === false ? '(não utilizada nas consultas)' : ''}
                </Typography>
                <Typography>
                  Vhost/Queue tags: <PreviewValue value={form.datadog_vhost_tag_key} placeholder="vhost_tag" /> / <PreviewValue value={form.datadog_queue_tag_key} placeholder="queue_tag" />
                </Typography>
                <Box>
                  <Typography fontWeight={700}>Regex temporárias</Typography>
                  {form.temporary_queue_regexes.map((regex, index) => (
                    <Typography key={index} variant="body2">
                      #{index + 1}: <PreviewValue value={regex} placeholder="regex" />
                    </Typography>
                  ))}
                </Box>
                <Box>
                  <Typography fontWeight={700}>Monitoramento inicial</Typography>
                  <Typography variant="body2">Cluster: habilitado</Typography>
                  <Typography variant="body2">Queues: habilitado</Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
