import { DeleteSweep, PlayArrow, Refresh, RestartAlt, Visibility } from '@mui/icons-material';
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
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiRequest } from '../services/api';
import { Cluster, JobBulkEnqueueResult, JobHistory } from '../types/api';

type JobResultDetails = {
  result?: {
    fetched?: number;
    created?: number;
    updated?: number;
    restored?: number;
    marked_removed?: number;
    temporary_matched?: number;
    deleted?: number;
    retention_days?: number;
  };
  error?: string;
  cluster_name?: string;
  rq_job_id?: string;
  source?: string;
  [key: string]: unknown;
};

function statusColor(status: string): 'default' | 'primary' | 'success' | 'error' | 'warning' | 'info' {
  if (status === 'success') return 'success';
  if (status === 'error') return 'error';
  if (status === 'running') return 'info';
  if (status === 'queued' || status === 'pending') return 'warning';
  return 'default';
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '-';
}

function getDuration(job: JobHistory) {
  if (!job.started_at || !job.finished_at) return '-';
  const started = new Date(job.started_at).getTime();
  const finished = new Date(job.finished_at).getTime();
  if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) return '-';
  const seconds = Math.round((finished - started) / 1000);
  return `${seconds}s`;
}

function detailsOf(job: JobHistory): JobResultDetails {
  return (job.details || {}) as JobResultDetails;
}

export default function JobsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [jobTypeFilter, setJobTypeFilter] = useState('');
  const [clusterFilter, setClusterFilter] = useState('');
  const [selectedClusterToRun, setSelectedClusterToRun] = useState('');
  const [selectedJob, setSelectedJob] = useState<JobHistory | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { data: clusters = [] } = useQuery({ queryKey: ['clusters'], queryFn: () => apiRequest<Cluster[]>('/clusters') });

  const jobsPath = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (jobTypeFilter) params.set('job_type', jobTypeFilter);
    if (clusterFilter) params.set('cluster_id', clusterFilter);
    params.set('limit', '200');
    return `/jobs?${params.toString()}`;
  }, [statusFilter, jobTypeFilter, clusterFilter]);

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['jobs', statusFilter, jobTypeFilter, clusterFilter],
    queryFn: () => apiRequest<JobHistory[]>(jobsPath),
    refetchInterval: 10000,
  });

  const clusterNameById = useMemo(() => new Map(clusters.map((cluster) => [cluster.id, cluster.name])), [clusters]);

  const enqueueAllMutation = useMutation({
    mutationFn: () => apiRequest<JobBulkEnqueueResult>('/jobs/discovery/all', { method: 'POST' }),
    onSuccess: (result) => {
      setMessage(`Discovery enfileirado para ${result.enqueued} clusters. Ignorados por já estarem em execução: ${result.skipped}.`);
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Erro ao enfileirar discoveries'),
  });

  const enqueueClusterMutation = useMutation({
    mutationFn: (clusterId: number) => apiRequest<JobHistory>(`/jobs/discovery/cluster/${clusterId}`, { method: 'POST' }),
    onSuccess: (job) => {
      setMessage(`Discovery enfileirado. Job #${job.id}.`);
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Erro ao enfileirar discovery'),
  });

  const retryMutation = useMutation({
    mutationFn: (jobId: number) => apiRequest<JobHistory>(`/jobs/${jobId}/retry`, { method: 'POST' }),
    onSuccess: (job) => {
      setMessage(`Reexecução enfileirada. Novo job #${job.id}.`);
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Erro ao reexecutar job'),
  });

  const cleanupMutation = useMutation({
    mutationFn: () => apiRequest<JobHistory>('/jobs/cleanup/removed-queues', { method: 'POST' }),
    onSuccess: (job) => {
      setMessage(`Cleanup de queues removidas enfileirado. Job #${job.id}.`);
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Erro ao enfileirar cleanup'),
  });

  const refreshJobs = () => queryClient.invalidateQueries({ queryKey: ['jobs'] });

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
        <Box>
          <Typography variant="h4" fontWeight={800}>
            Jobs
          </Typography>
          <Typography color="text.secondary">Acompanhe execuções de discovery, falhas, contadores e reexecuções.</Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button variant="outlined" startIcon={<Refresh />} onClick={refreshJobs}>
            Atualizar
          </Button>
          <Button variant="outlined" startIcon={<DeleteSweep />} onClick={() => cleanupMutation.mutate()}>
            Limpar removidas
          </Button>
          <Button variant="contained" startIcon={<PlayArrow />} onClick={() => enqueueAllMutation.mutate()}>
            Enfileirar todos
          </Button>
        </Stack>
      </Stack>

      <Paper className="page-filter-grid" sx={{ p: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <MenuItem value="">Todos</MenuItem>
                <MenuItem value="queued">queued</MenuItem>
                <MenuItem value="running">running</MenuItem>
                <MenuItem value="success">success</MenuItem>
                <MenuItem value="error">error</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Tipo</InputLabel>
              <Select label="Tipo" value={jobTypeFilter} onChange={(event) => setJobTypeFilter(event.target.value)}>
                <MenuItem value="">Todos</MenuItem>
                <MenuItem value="discovery_queues">discovery_queues</MenuItem>
                <MenuItem value="cleanup_removed_queues">cleanup_removed_queues</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Cluster</InputLabel>
              <Select label="Cluster" value={clusterFilter} onChange={(event) => setClusterFilter(event.target.value)}>
                <MenuItem value="">Todos</MenuItem>
                {clusters.map((cluster) => (
                  <MenuItem key={cluster.id} value={String(cluster.id)}>
                    {cluster.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Executar cluster</InputLabel>
              <Select label="Executar cluster" value={selectedClusterToRun} onChange={(event) => setSelectedClusterToRun(event.target.value)}>
                <MenuItem value="">Selecione</MenuItem>
                {clusters
                  .filter((cluster) => cluster.is_active)
                  .map((cluster) => (
                    <MenuItem key={cluster.id} value={String(cluster.id)}>
                      {cluster.name}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={1}>
            <Button
              fullWidth
              variant="outlined"
              disabled={!selectedClusterToRun}
              onClick={() => enqueueClusterMutation.mutate(Number(selectedClusterToRun))}
            >
              Ir
            </Button>
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ overflow: 'hidden' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Criado em</TableCell>
              <TableCell>Tipo</TableCell>
              <TableCell>Cluster</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Criadas</TableCell>
              <TableCell>Atualizadas</TableCell>
              <TableCell>Removidas/Apagadas</TableCell>
              <TableCell>Duração</TableCell>
              <TableCell align="right">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {jobs.map((job) => {
              const details = detailsOf(job);
              const result = details.result || {};
              const clusterName = job.cluster_id ? clusterNameById.get(job.cluster_id) || details.cluster_name || `#${job.cluster_id}` : '-';
              return (
                <TableRow key={job.id} hover>
                  <TableCell>#{job.id}</TableCell>
                  <TableCell>{formatDate(job.created_at)}</TableCell>
                  <TableCell>{job.job_type}</TableCell>
                  <TableCell>{clusterName}</TableCell>
                  <TableCell>
                    <Chip size="small" label={job.status} color={statusColor(job.status)} />
                  </TableCell>
                  <TableCell>{result.created ?? '-'}</TableCell>
                  <TableCell>{result.updated ?? '-'}</TableCell>
                  <TableCell>{result.marked_removed ?? result.deleted ?? '-'}</TableCell>
                  <TableCell>{getDuration(job)}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Visualizar detalhes">
                      <IconButton onClick={() => setSelectedJob(job)}>
                        <Visibility />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Reexecutar">
                      <span>
                        <IconButton disabled={(job.job_type === 'discovery_queues' && !job.cluster_id) || job.status === 'queued' || job.status === 'running'} onClick={() => retryMutation.mutate(job.id)}>
                          <RestartAlt />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
            {!isLoading && jobs.length === 0 && (
              <TableRow>
                <TableCell colSpan={10}>
                  <Alert severity="info">Nenhum job encontrado.</Alert>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={!!selectedJob} onClose={() => setSelectedJob(null)} maxWidth="md" fullWidth>
        <DialogTitle>Detalhes do job {selectedJob ? `#${selectedJob.id}` : ''}</DialogTitle>
        {selectedJob && (
          <DialogContent dividers>
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Chip label={selectedJob.job_type} />
                <Chip label={selectedJob.status} color={statusColor(selectedJob.status)} />
                <Chip label={`Cluster: ${selectedJob.cluster_id ? clusterNameById.get(selectedJob.cluster_id) || detailsOf(selectedJob).cluster_name || selectedJob.cluster_id : '-'}`} />
              </Stack>
              <Box>
                <Typography fontWeight={800}>Resumo</Typography>
                <Typography color="text.secondary">{selectedJob.summary || '-'}</Typography>
              </Box>
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <Typography variant="caption" color="text.secondary">Criado em</Typography>
                  <Typography>{formatDate(selectedJob.created_at)}</Typography>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Typography variant="caption" color="text.secondary">Início</Typography>
                  <Typography>{formatDate(selectedJob.started_at)}</Typography>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Typography variant="caption" color="text.secondary">Fim</Typography>
                  <Typography>{formatDate(selectedJob.finished_at)}</Typography>
                </Grid>
              </Grid>
              {detailsOf(selectedJob).error && <Alert severity="error">{detailsOf(selectedJob).error}</Alert>}
              <Box>
                <Typography fontWeight={800}>Detalhes técnicos</Typography>
                <Paper variant="outlined" sx={{ p: 2, mt: 1, maxHeight: 360, overflow: 'auto' }}>
                  <Typography component="pre" sx={{ m: 0, fontFamily: 'monospace', fontSize: 13, whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify(selectedJob.details || {}, null, 2)}
                  </Typography>
                </Paper>
              </Box>
            </Stack>
          </DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => setSelectedJob(null)}>Fechar</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!message} autoHideDuration={6000} onClose={() => setMessage(null)} message={message} />
    </Stack>
  );
}
