import { Add, ArrowBack, Delete } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
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
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../services/api';
import { Cluster, ClusterFormPayload, DatadogOrg, Environment, Protocol, SREGroup } from '../types/api';

const emptyForm: ClusterFormPayload = {
  name: '',
  environment: 'prod',
  business_line: '',
  protocol: 'http',
  dns: '',
  api_port: 15672,
  api_username: '',
  api_password: '',
  sre_group_id: null,
  datadog_org_id: null,
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
  const { clusterId } = useParams();
  const isEdit = Boolean(clusterId);
  const location = useLocation();
  const isView = location.pathname.endsWith('/view');
  const canEdit = !isView;
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
        protocol: cluster.protocol,
        dns: cluster.dns,
        api_port: cluster.api_port,
        api_username: cluster.api_username,
        api_password: '',
        sre_group_id: cluster.sre_group_id || null,
        datadog_org_id: cluster.datadog_org_id || null,
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

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    setError(null);
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
                  <FormControl fullWidth>
                    <InputLabel>Ambiente</InputLabel>
                    <Select
                      disabled={!canEdit}
                      label="Ambiente"
                      value={form.environment}
                      onChange={(e: SelectChangeEvent) => updateField('environment', e.target.value as Environment)}
                    >
                      <MenuItem value="prod">prod</MenuItem>
                      <MenuItem value="uat">uat</MenuItem>
                      <MenuItem value="dev">dev</MenuItem>
                    </Select>
                  </FormControl>
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
                        label="Porta da API"
                        type="number"
                        value={form.api_port}
                        onChange={(e) => updateField('api_port', Number(e.target.value))}
                        required
                        fullWidth
                        disabled={!canEdit}
                      />
                    </Grid>
                  </Grid>
                </Stack>
              </Box>

              <Divider />

              <Box>
                <Typography variant="h6" fontWeight={800}>
                  Credentials
                </Typography>
                <Stack spacing={2} sx={{ mt: 2 }}>
                  <TextField label="Usuário da API" value={form.api_username} onChange={(e) => updateField('api_username', e.target.value)} required disabled={!canEdit} />
                  <TextField
                    label={isEdit ? 'Nova senha da API (opcional)' : 'Senha da API'}
                    type="password"
                    value={form.api_password || ''}
                    onChange={(e) => updateField('api_password', e.target.value)}
                    required={!isEdit}
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
                <Button type="submit" size="large" variant="contained" disabled={saveMutation.isPending}>
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
                  Ambiente: <PreviewValue value={form.environment} placeholder="ambiente" />
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
