import { Add, Edit, Refresh, Visibility, WifiTethering } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  IconButton,
  Paper,
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
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { apiRequest } from '../services/api';
import { useAuth } from '../services/authContext';
import { Cluster, JobHistory } from '../types/api';

export default function ClustersPage() {
  const queryClient = useQueryClient();
  const session=useAuth();
  const canManageCluster=Boolean(session.is_admin||session.is_observability);
  const [message, setMessage] = useState<string | null>(null);
  const { data: clusters = [], isLoading } = useQuery({ queryKey: ['clusters'], queryFn: () => apiRequest<Cluster[]>('/clusters') });

  const discoverMutation = useMutation({
    mutationFn: (clusterId: number) => apiRequest<JobHistory>(`/clusters/${clusterId}/discover-queues`, { method: 'POST' }),
    onSuccess: (job) => {
      setMessage(`Discovery enfileirado. Job #${job.id}. Acompanhe em Administração > Jobs.`);
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Erro ao executar discovery'),
  });

  const testMutation = useMutation({
    mutationFn: (clusterId: number) => apiRequest<{ status: string; rabbitmq_version?: string; profile?: string; queues_visible_in_metrics?: number }>(`/clusters/${clusterId}/test-connection`, { method: 'POST' }),
    onSuccess: (result) => setMessage(result.profile === 'prometheus_metrics'
      ? `Prometheus acessível. ${result.queues_visible_in_metrics || 0} fila(s) identificadas nas séries detalhadas.`
      : `Conexão OK. RabbitMQ ${result.rabbitmq_version || 'versão não informada'}.`),
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Erro ao testar conexão'),
  });

  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h4" fontWeight={800}>
            Clusters RabbitMQ
          </Typography>
          <Typography variant="body2" color="text.secondary">Cadastro, teste de conexão e enfileiramento de discovery de queues.</Typography>
        </Box>
        {canManageCluster && <Button component={RouterLink} to="/clusters/new" variant="contained" startIcon={<Add />} sx={{ textTransform: 'none' }}>
          Novo cluster
        </Button>}
      </Box>

      <Paper sx={{ overflow: 'hidden' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Nome</TableCell>
              <TableCell>SRE</TableCell>
              <TableCell>Datadog Org</TableCell>
              <TableCell>Último discovery</TableCell>
              <TableCell align="right">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {clusters.map((cluster) => (
              <TableRow key={cluster.id} hover>
                <TableCell>
                  <Typography fontWeight={700}>{cluster.name}</Typography>
                </TableCell>
                <TableCell>{cluster.sre_group?.name || '-'}</TableCell>
                <TableCell>{cluster.datadog_org?.name || '-'}</TableCell>
                <TableCell>{cluster.last_discovery_at ? new Date(cluster.last_discovery_at).toLocaleString() : '-'}</TableCell>
                <TableCell align="right">
                  <Tooltip title="Visualizar">
                    <IconButton component={RouterLink} to={`/clusters/${cluster.id}/view`}>
                      <Visibility />
                    </IconButton>
                  </Tooltip>
                  {canManageCluster && <Tooltip title="Testar conexão">
                    <IconButton onClick={() => testMutation.mutate(cluster.id)}>
                      <WifiTethering />
                    </IconButton>
                  </Tooltip>}
                  {canManageCluster && <Tooltip title="Enfileirar discovery de queues">
                    <IconButton onClick={() => discoverMutation.mutate(cluster.id)}>
                      <Refresh />
                    </IconButton>
                  </Tooltip>}
                  {canManageCluster && <Tooltip title="Editar">
                    <IconButton component={RouterLink} to={`/clusters/${cluster.id}/edit`}>
                      <Edit />
                    </IconButton>
                  </Tooltip>}
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && clusters.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Alert severity="info">Nenhum cluster cadastrado ainda.</Alert>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      <Snackbar open={!!message} autoHideDuration={6000} onClose={() => setMessage(null)} message={message} />
    </Stack>
  );
}
