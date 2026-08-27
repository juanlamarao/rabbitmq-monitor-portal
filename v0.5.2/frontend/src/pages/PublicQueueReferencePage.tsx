import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  CssBaseline,
  Divider,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ThemeProvider,
  Typography,
  createTheme,
} from '@mui/material';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { apiRequest } from '../services/api';
import { PublicQueueReference } from '../types/api';

function valueOrDash(value?: string | null) {
  return value && value.trim() ? value : '-';
}

function formatJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function PublicQueueReferenceContent() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const rabbitmqCluster = params.get('rabbitmq_cluster') || '';
  const vhost = params.get('vhost') || '';
  const queue = params.get('queue') || '';
  const enabled = Boolean(rabbitmqCluster && vhost && queue);

  const { data, error, isLoading } = useQuery({
    enabled,
    queryKey: ['public-queue-reference', rabbitmqCluster, vhost, queue],
    queryFn: () =>
      apiRequest<PublicQueueReference>(
        `/public/queue-reference?rabbitmq_cluster=${encodeURIComponent(rabbitmqCluster)}&vhost=${encodeURIComponent(vhost)}&queue=${encodeURIComponent(queue)}`,
      ),
  });

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: 4 }}>
      <Container maxWidth="lg">
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'flex-start' }} spacing={2}>
            <Box>
              <Typography variant="h4" fontWeight={900}>
                Referência pública da Queue
              </Typography>
              <Typography color="text.secondary">
                Página pública para alertas Datadog. O portal permanece como fonte da verdade para o contexto operacional da fila.
              </Typography>
            </Box>
          </Stack>

          {!enabled && <Alert severity="warning">Informe rabbitmq_cluster, vhost e queue na URL.</Alert>}
          {isLoading && <Alert severity="info">Carregando referência da queue...</Alert>}
          {error instanceof Error && <Alert severity="error">{error.message}</Alert>}

          {data && (
            <>
              <Paper sx={{ p: 3 }}>
                <Stack spacing={2}>
                  <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
                    <Chip label={data.environment} color={data.environment === 'prod' ? 'error' : data.environment === 'uat' ? 'warning' : 'info'} />
                    <Chip label={`Cluster: ${data.cluster_name}`} />
                    <Chip label={`Vhost: ${data.vhost}`} />
                    {data.is_removed && <Chip label="Queue removida" color="warning" />}
                  </Stack>
                  <Box>
                    <Typography variant="h5" fontWeight={800} sx={{ wordBreak: 'break-word' }}>
                      {data.queue}
                    </Typography>
                    <Typography color="text.secondary">rabbitmq_cluster tag: {data.rabbitmq_cluster_tag}</Typography>
                  </Box>
                </Stack>
              </Paper>

              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Paper sx={{ p: 2, height: '100%' }}>
                    <Typography variant="h6" fontWeight={800}>Contexto operacional</Typography>
                    <Divider sx={{ my: 1.5 }} />
                    <Stack spacing={1}>
                      <Typography><strong>Serviço:</strong> {valueOrDash(data.service_name)}</Typography>
                      <Typography><strong>Criticidade:</strong> {valueOrDash(data.criticality)}</Typography>
                      <Typography><strong>Owner:</strong> {valueOrDash(data.owner_email)}</Typography>
                      <Typography><strong>Grupo SRE:</strong> {valueOrDash(data.sre_group_name)}</Typography>
                      <Typography><strong>Linha de negócio:</strong> {valueOrDash(data.business_line)}</Typography>
                      <Typography><strong>Jornada:</strong> {valueOrDash(data.journey)}</Typography>
                      <Typography><strong>Horário de monitoramento:</strong> {valueOrDash(data.monitoring_schedule)}</Typography>
                    </Stack>
                  </Paper>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Paper sx={{ p: 2, height: '100%' }}>
                    <Typography variant="h6" fontWeight={800}>Dados RabbitMQ</Typography>
                    <Divider sx={{ my: 1.5 }} />
                    <Stack spacing={1}>
                      <Typography><strong>Type:</strong> {valueOrDash(data.type)}</Typography>
                      <Typography><strong>State:</strong> {valueOrDash(data.state)}</Typography>
                      <Typography><strong>Último discovery:</strong> {data.discovered_at ? new Date(data.discovered_at).toLocaleString() : '-'}</Typography>
                      <Typography><strong>Atualizado em:</strong> {new Date(data.updated_at).toLocaleString()}</Typography>
                      <Typography><strong>Removida em:</strong> {data.removed_at ? new Date(data.removed_at).toLocaleString() : '-'}</Typography>
                    </Stack>
                  </Paper>
                </Grid>
              </Grid>

              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" fontWeight={800}>Descrição</Typography>
                <Typography sx={{ whiteSpace: 'pre-wrap', mt: 1 }}>{valueOrDash(data.description)}</Typography>
              </Paper>

              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Paper sx={{ p: 2, height: '100%' }}>
                    <Typography variant="h6" fontWeight={800}>SREs</Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1 }}>
                      {data.sre_group_members.length ? data.sre_group_members.map((email) => <Chip key={email} label={email} />) : <Typography color="text.secondary">Nenhum SRE configurado.</Typography>}
                    </Stack>
                  </Paper>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Paper sx={{ p: 2, height: '100%' }}>
                    <Typography variant="h6" fontWeight={800}>Devs</Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1 }}>
                      {data.dev_emails.length ? data.dev_emails.map((email) => <Chip key={email} label={email} />) : <Typography color="text.secondary">Nenhum dev configurado.</Typography>}
                    </Stack>
                  </Paper>
                </Grid>
              </Grid>

              <Paper sx={{ overflow: 'hidden' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Template</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Configuração efetiva</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.applied_templates.map((template) => (
                      <TableRow key={template.binding_id} hover>
                        <TableCell>
                          <Stack spacing={0.5}>
                            <Typography fontWeight={700}>{template.code}</Typography>
                            <Typography variant="caption" color="text.secondary">{template.name}</Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={1} flexWrap="wrap">
                            <Chip size="small" label={template.enabled ? 'Ativo' : 'Inativo'} color={template.enabled ? 'success' : 'default'} />
                            {template.is_customized && <Chip size="small" label="Customizado" color="warning" />}
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Typography component="pre" variant="caption" sx={{ whiteSpace: 'pre-wrap' }}>
                            {formatJson(template.effective_config)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Paper>
            </>
          )}
        </Stack>
      </Container>
    </Box>
  );
}

export default function PublicQueueReferencePage() {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: { main: '#f97316' },
          background: {
            default: mode === 'dark' ? '#0f172a' : '#f5f7fb',
            paper: mode === 'dark' ? '#111827' : '#ffffff',
          },
        },
        shape: { borderRadius: 12 },
        components: {
          MuiPaper: {
            styleOverrides: {
              root: { backgroundImage: 'none' },
            },
          },
        },
      }),
    [mode],
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ position: 'fixed', top: 16, right: 16, zIndex: 10 }}>
        <Button
          variant="contained"
          size="small"
          startIcon={mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
          onClick={() => setMode((value) => (value === 'dark' ? 'light' : 'dark'))}
          sx={{ fontWeight: 800 }}
        >
          {mode === 'dark' ? 'Tema claro' : 'Tema dark'}
        </Button>
      </Box>
      <PublicQueueReferenceContent />
    </ThemeProvider>
  );
}
