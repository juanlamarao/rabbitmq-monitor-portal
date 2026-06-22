import { Add, Edit, Refresh, Visibility, WifiTethering } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Chip,
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
import { Cluster, DiscoveryResult } from '../types/api';

export default function ClustersPage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const { data: clusters = [], isLoading } = useQuery({ queryKey: ['clusters'], queryFn: () => apiRequest<Cluster[]>('/clusters') });

  const discoverMutation = useMutation({
    mutationFn: (clusterId: number) => apiRequest<DiscoveryResult>(`/clusters/${clusterId}/discover-queues`, { method: 'POST' }),
    onSuccess: (result) => {
      setMessage(`Discovery executado: ${result.fetched} filas encontradas, ${result.created} criadas, ${result.marked_removed} removidas.`);
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
      queryClient.invalidateQueries({ queryKey: ['queues'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Erro ao executar discovery'),
  });

  const testMutation = useMutation({
    mutationFn: (clusterId: number) => apiRequest<{ status: string; rabbitmq_version?: string }>(`/clusters/${clusterId}/test-connection`, { method: 'POST' }),
    onSuccess: (result) => setMessage(`Conexão OK. RabbitMQ ${result.rabbitmq_version || 'versão não informada'}.`),
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Erro ao testar conexão'),
  });

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2}>
        <Box>
          <Typography variant="h4" fontWeight={800}>
            Clusters RabbitMQ
          </Typography>
          <Typography color="text.secondary">Cadastro, teste de conexão e discovery manual de queues.</Typography>
        </Box>
        <Button component={RouterLink} to="/clusters/new" variant="contained" startIcon={<Add />} sx={{ fontWeight: 800 }}>
          NOVO CLUSTER
        </Button>
      </Stack>

      <Paper sx={{ overflow: 'hidden' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Nome</TableCell>
              <TableCell>Ambiente</TableCell>
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
                <TableCell>
                  <Chip label={cluster.environment} size="small" />
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
                  <Tooltip title="Testar conexão">
                    <IconButton onClick={() => testMutation.mutate(cluster.id)}>
                      <WifiTethering />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Forçar discovery de queues">
                    <IconButton onClick={() => discoverMutation.mutate(cluster.id)}>
                      <Refresh />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Editar">
                    <IconButton component={RouterLink} to={`/clusters/${cluster.id}/edit`}>
                      <Edit />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && clusters.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
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
