import { Add, ArrowBack, Delete, Edit, Key, Visibility } from '@mui/icons-material';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  IconButton,
  Paper,
  Snackbar,
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { apiRequest } from '../services/api';
import { DatadogOrg } from '../types/api';

type DialogMode = 'create' | 'edit' | 'view';

interface OrgFormState {
  name: string;
  api_url: string;
  org_url: string;
  description: string;
  api_key: string;
  app_key: string;
  is_active: boolean;
}

const emptyForm: OrgFormState = {
  name: '',
  api_url: 'https://api.datadoghq.com',
  org_url: '',
  description: '',
  api_key: '',
  app_key: '',
  is_active: true,
};

function toFormState(org: DatadogOrg): OrgFormState {
  return {
    name: org.name,
    api_url: org.api_url,
    org_url: org.org_url || '',
    description: org.description || '',
    api_key: '',
    app_key: '',
    is_active: org.is_active,
  };
}

export default function DatadogOrgsPage() {
  const queryClient = useQueryClient();
  const { data: orgs = [] } = useQuery({ queryKey: ['datadog-orgs'], queryFn: () => apiRequest<DatadogOrg[]>('/admin/datadog-orgs') });
  const [nameFilter, setNameFilter] = useState('');
  const [urlFilter, setUrlFilter] = useState('');
  const [dialogMode, setDialogMode] = useState<DialogMode>('create');
  const [selectedOrg, setSelectedOrg] = useState<DatadogOrg | null>(null);
  const [formState, setFormState] = useState<OrgFormState>(emptyForm);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const filteredOrgs = useMemo(() => {
    const nameNeedle = nameFilter.trim().toLowerCase();
    const urlNeedle = urlFilter.trim().toLowerCase();
    return orgs.filter((org) => {
      const matchesName = !nameNeedle || org.name.toLowerCase().includes(nameNeedle);
      const searchableUrls = `${org.api_url || ''} ${org.org_url || ''}`.toLowerCase();
      const matchesUrl = !urlNeedle || searchableUrls.includes(urlNeedle);
      return matchesName && matchesUrl;
    });
  }, [orgs, nameFilter, urlFilter]);

  const createOrg = useMutation({
    mutationFn: (payload: OrgFormState) =>
      apiRequest<DatadogOrg>('/admin/datadog-orgs', {
        method: 'POST',
        body: JSON.stringify({
          name: payload.name,
          api_url: payload.api_url,
          org_url: payload.org_url || null,
          description: payload.description || null,
          api_key: payload.api_key,
          app_key: payload.app_key,
          is_active: payload.is_active,
        }),
      }),
    onSuccess: () => {
      closeDialog();
      setMessage('Datadog Org criada.');
      queryClient.invalidateQueries({ queryKey: ['datadog-orgs'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Erro ao adicionar Datadog Org'),
  });

  const updateOrg = useMutation({
    mutationFn: ({ orgId, payload }: { orgId: number; payload: OrgFormState }) => {
      const body: Record<string, unknown> = {
        name: payload.name,
        api_url: payload.api_url,
        org_url: payload.org_url || null,
        description: payload.description || null,
        is_active: payload.is_active,
      };
      if (payload.api_key) body.api_key = payload.api_key;
      if (payload.app_key) body.app_key = payload.app_key;
      return apiRequest<DatadogOrg>(`/admin/datadog-orgs/${orgId}`, { method: 'PUT', body: JSON.stringify(body) });
    },
    onSuccess: () => {
      closeDialog();
      setMessage('Datadog Org atualizada.');
      queryClient.invalidateQueries({ queryKey: ['datadog-orgs'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Erro ao atualizar Datadog Org'),
  });

  const deleteOrg = useMutation({
    mutationFn: (orgId: number) => apiRequest<void>(`/admin/datadog-orgs/${orgId}`, { method: 'DELETE' }),
    onSuccess: () => {
      setMessage('Datadog Org removida.');
      queryClient.invalidateQueries({ queryKey: ['datadog-orgs'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (err) => setMessage(err instanceof Error ? err.message : 'Erro ao remover Datadog Org'),
  });

  function openCreate() {
    setDialogMode('create');
    setSelectedOrg(null);
    setFormState(emptyForm);
    setError(null);
    setDialogOpen(true);
  }

  function openOrg(org: DatadogOrg, mode: Exclude<DialogMode, 'create'>) {
    setDialogMode(mode);
    setSelectedOrg(org);
    setFormState(toFormState(org));
    setError(null);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setSelectedOrg(null);
    setFormState(emptyForm);
    setError(null);
  }

  function saveOrg() {
    setError(null);
    if (dialogMode === 'create') {
      createOrg.mutate(formState);
      return;
    }
    if (selectedOrg) {
      updateOrg.mutate({ orgId: selectedOrg.id, payload: formState });
    }
  }

  function confirmDelete(org: DatadogOrg) {
    const ok = window.confirm(`Remover a Datadog Org "${org.name}"?`);
    if (ok) deleteOrg.mutate(org.id);
  }

  const readOnly = dialogMode === 'view';
  const isSaving = createOrg.isPending || updateOrg.isPending || deleteOrg.isPending;
  const canSave = Boolean(formState.name && formState.api_url && (dialogMode === 'edit' || (formState.api_key && formState.app_key)));

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between">
        <Stack direction="row" spacing={2} alignItems="center">
          <Button component={RouterLink} to="/admin" startIcon={<ArrowBack />}>
            Voltar
          </Button>
          <Typography variant="h4" fontWeight={800}>
            Datadog Orgs
          </Typography>
        </Stack>
        <Button variant="contained" startIcon={<Add />} onClick={openCreate} sx={{ fontWeight: 800 }}>
          NOVA ORG
        </Button>
      </Stack>

      <Paper className="main-page-filters" sx={{ p: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <TextField label="Filtrar por nome da org" value={nameFilter} onChange={(event) => setNameFilter(event.target.value)} fullWidth />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField label="Filtrar por Org URL ou API URL" value={urlFilter} onChange={(event) => setUrlFilter(event.target.value)} fullWidth />
          </Grid>
        </Grid>
      </Paper>

      <Card>
        <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Org</TableCell>
                <TableCell>URLs</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredOrgs.map((org) => (
                <TableRow key={org.id} hover>
                  <TableCell>
                    <Typography fontWeight={800}>{org.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {org.description || 'Sem descrição'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">API: {org.api_url}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Org: {org.org_url || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Chip icon={<Key />} label={org.has_credentials ? 'Credenciais salvas' : 'Sem credenciais'} size="small" color={org.has_credentials ? 'success' : 'warning'} />
                      <Chip label={org.is_active ? 'Ativa' : 'Inativa'} size="small" color={org.is_active ? 'success' : 'default'} />
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Visualizar">
                      <IconButton onClick={() => openOrg(org, 'view')}>
                        <Visibility />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Editar">
                      <IconButton onClick={() => openOrg(org, 'edit')}>
                        <Edit />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Remover">
                      <IconButton onClick={() => confirmDelete(org)} color="error">
                        <Delete />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {filteredOrgs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Alert severity="info">Nenhuma Datadog Org encontrada.</Alert>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>{dialogMode === 'create' ? 'Nova Datadog Org' : readOnly ? 'Visualizar Datadog Org' : 'Editar Datadog Org'}</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Nome da org" value={formState.name} onChange={(e) => setFormState({ ...formState, name: e.target.value })} required disabled={readOnly} />
            <TextField label="API URL" value={formState.api_url} onChange={(e) => setFormState({ ...formState, api_url: e.target.value })} required disabled={readOnly} />
            <TextField label="Org URL" value={formState.org_url} onChange={(e) => setFormState({ ...formState, org_url: e.target.value })} disabled={readOnly} />
            <TextField
              label="Descrição"
              value={formState.description}
              onChange={(e) => setFormState({ ...formState, description: e.target.value })}
              multiline
              minRows={2}
              disabled={readOnly}
            />
            {!readOnly && (
              <Alert severity="info">
                {dialogMode === 'create' ? 'As credenciais serão validadas antes de salvar.' : 'Preencha API key e APP key somente se quiser alterar as credenciais salvas.'}
              </Alert>
            )}
            <TextField
              label="API key"
              value={formState.api_key}
              onChange={(e) => setFormState({ ...formState, api_key: e.target.value })}
              type="password"
              required={dialogMode === 'create'}
              disabled={readOnly}
            />
            <TextField
              label="APP key"
              value={formState.app_key}
              onChange={(e) => setFormState({ ...formState, app_key: e.target.value })}
              type="password"
              required={dialogMode === 'create'}
              disabled={readOnly}
            />
            <FormControlLabel
              control={<Checkbox checked={formState.is_active} onChange={(e) => setFormState({ ...formState, is_active: e.target.checked })} disabled={readOnly} />}
              label="Ativa"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>{readOnly ? 'Fechar' : 'Cancelar'}</Button>
          {!readOnly && (
            <Button onClick={saveOrg} variant="contained" disabled={!canSave || isSaving}>
              Salvar
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Snackbar open={!!message} autoHideDuration={5000} onClose={() => setMessage(null)} message={message} />
    </Stack>
  );
}
