import { Cached } from '@mui/icons-material';
import { Alert, Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import { adminLinks } from '../components/adminNavigation';
import { apiRequest } from '../services/api';

interface DirectoryCacheStatus { people_count: number; refreshed_at?: string | null }

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
      <Typography variant="h4">Administração</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(2,minmax(0,1fr))', lg: 'repeat(4,minmax(0,1fr))' }, gap: 2, alignItems: 'stretch', width: '100%' }}>
        {adminLinks.filter(entry => entry.path !== '/admin').map(entry => (
          <Box key={entry.path} sx={{ minWidth: 0, display: 'flex' }}>
            <Card sx={{ width: '100%', height: '100%' }}>
              <CardContent sx={{ p: 2.5, height: '100%', minHeight: 246, display: 'flex', flexDirection: 'column', gap: 1.5, '&:last-child': { pb: 2.5 } }}>
                <Box sx={{ color: 'primary.main', '& svg': { fontSize: 30 } }}>{entry.icon}</Box>
                <Typography variant="h6">{entry.label}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>{entry.description}</Typography>
                <Button component={RouterLink} to={entry.path} variant="contained" fullWidth sx={{ mt: 'auto' }}>{entry.action}</Button>
              </CardContent>
            </Card>
          </Box>
        ))}
        {/* LDAP is intentionally the last administration card and is not part of the sidebar. */}
        <Box sx={{ minWidth: 0, display: 'flex' }}>
          <Card sx={{ width: '100%', height: '100%' }}>
            <CardContent sx={{ p: 2.5, height: '100%', minHeight: 246, display: 'flex', flexDirection: 'column', gap: 1.5, '&:last-child': { pb: 2.5 } }}>
              <Box sx={{ color: 'primary.main' }}><Cached sx={{ fontSize: 30 }} /></Box>
              <Typography variant="h6">Cache LDAP/AD</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
                Pessoas em cache: {directoryStatus?.people_count ?? '-'}
                <br />
                Última atualização: {directoryStatus?.refreshed_at ? new Date(directoryStatus.refreshed_at).toLocaleString('pt-BR') : '-'}
              </Typography>
              {refreshDirectoryMutation.isError && <Alert severity="error">Falha ao sincronizar diretório.</Alert>}
              <Button variant="outlined" fullWidth sx={{ mt: 'auto' }} onClick={() => refreshDirectoryMutation.mutate()} disabled={refreshDirectoryMutation.isPending}>
                Atualizar cache LDAP/AD
              </Button>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Stack>
  );
}
