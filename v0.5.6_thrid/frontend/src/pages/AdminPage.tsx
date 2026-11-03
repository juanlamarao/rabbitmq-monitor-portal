import { AdminPanelSettings, Business, Cached, Groups, ManageHistory, SyncAlt, Palette } from '@mui/icons-material';
import { Alert, Button, Card, CardContent, Grid, Stack, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import { apiRequest } from '../services/api';

interface DirectoryCacheStatus {
  people_count: number;
  refreshed_at?: string | null;
}

export default function AdminPage() {
  const queryClient = useQueryClient();
  const { data: directoryStatus } = useQuery({
    queryKey: ['directory-cache-status'],
    queryFn: () => apiRequest<DirectoryCacheStatus>('/directory/cache-status'),
  });
  const refreshDirectoryMutation = useMutation({
    mutationFn: () => apiRequest('/directory/refresh-cache', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['directory-cache-status'] }),
  });

  return (
    <Stack spacing={3}>
      <Typography variant="h4" fontWeight={800}>
        Administração
      </Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} md={3}><Card><CardContent><Stack spacing={2}>
          <Palette fontSize="large" />
          <Typography variant="h6" fontWeight={800}>Aparência</Typography>
          <Typography color="text.secondary">Defina o layout Corporate ou Workspace para todos os usuários.</Typography>
          <Button component={RouterLink} to="/admin/appearance" variant="contained">Configurar aparência</Button>
        </Stack></CardContent></Card></Grid>
        <Grid item xs={12} md={3}><Card><CardContent><Stack spacing={2}>
          <AdminPanelSettings fontSize="large" />
          <Typography variant="h6" fontWeight={800}>Permissões de Acesso</Typography>
          <Typography color="text.secondary">Associe Object IDs de grupos Microsoft Entra aos clusters editáveis ou à administração.</Typography>
          <Button component={RouterLink} to="/admin/access" variant="contained">Gerenciar permissões</Button>
        </Stack></CardContent></Card></Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Groups fontSize="large" />
                <Typography variant="h6" fontWeight={800}>
                  Grupos SRE
                </Typography>
                <Typography color="text.secondary">Gerencie grupos responsáveis e pessoas vinculadas por e-mail.</Typography>
                <Button component={RouterLink} to="/admin/sre-groups" variant="contained">
                  Abrir grupos SRE
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Business fontSize="large" />
                <Typography variant="h6" fontWeight={800}>
                  Datadog Orgs
                </Typography>
                <Typography color="text.secondary">Cadastre organizações Datadog com validação de API key e APP key.</Typography>
                <Button component={RouterLink} to="/admin/datadog-orgs" variant="contained">
                  Abrir Datadog Orgs
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <ManageHistory fontSize="large" />
                <Typography variant="h6" fontWeight={800}>
                  Jobs
                </Typography>
                <Typography color="text.secondary">Acompanhe discoveries recorrentes, falhas, contadores e reexecuções.</Typography>
                <Button component={RouterLink} to="/admin/jobs" variant="contained">
                  Abrir jobs
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <SyncAlt fontSize="large" />
                <Typography variant="h6" fontWeight={800}>
                  Fila Datadog
                </Typography>
                <Typography color="text.secondary">Planeje, aplique e valide monitores dedicados por fila/template.</Typography>
                <Button component={RouterLink} to="/admin/datadog-sync" variant="contained">
                  Consultar fila
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Cached fontSize="large" />
                <Typography variant="h6" fontWeight={800}>
                  Cache LDAP/AD
                </Typography>
                <Typography color="text.secondary">
                  Pessoas em cache: {directoryStatus?.people_count ?? '-'}
                  <br />
                  Último sync: {directoryStatus?.refreshed_at ? new Date(directoryStatus.refreshed_at).toLocaleString('pt-BR') : '-'}
                </Typography>
                {refreshDirectoryMutation.isError && <Alert severity="error">Falha ao sincronizar diretório.</Alert>}
                <Button variant="outlined" onClick={() => refreshDirectoryMutation.mutate()} disabled={refreshDirectoryMutation.isPending}>
                  Forçar sync do diretório
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
