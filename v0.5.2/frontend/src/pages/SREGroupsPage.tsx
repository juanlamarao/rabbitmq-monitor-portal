import { Add, ArrowBack, Delete, Edit, Visibility } from '@mui/icons-material';
import {
  Alert,
  Box,
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
import { MultiPersonEmailAutocomplete } from '../components/PersonEmailAutocomplete';
import { apiRequest } from '../services/api';
import { SREGroup } from '../types/api';

type DialogMode = 'create' | 'edit' | 'view';

interface GroupFormState {
  name: string;
  description: string;
  is_active: boolean;
  member_emails: string[];
}

const emptyForm: GroupFormState = {
  name: '',
  description: '',
  is_active: true,
  member_emails: [],
};

function toFormState(group: SREGroup): GroupFormState {
  return {
    name: group.name,
    description: group.description || '',
    is_active: group.is_active,
    member_emails: (group.members || []).map((member) => member.email),
  };
}

export default function SREGroupsPage() {
  const queryClient = useQueryClient();
  const { data: groups = [] } = useQuery({ queryKey: ['sre-groups'], queryFn: () => apiRequest<SREGroup[]>('/admin/sre-groups') });
  const [nameFilter, setNameFilter] = useState('');
  const [personFilter, setPersonFilter] = useState('');
  const [dialogMode, setDialogMode] = useState<DialogMode>('create');
  const [selectedGroup, setSelectedGroup] = useState<SREGroup | null>(null);
  const [formState, setFormState] = useState<GroupFormState>(emptyForm);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const filteredGroups = useMemo(() => {
    const nameNeedle = nameFilter.trim().toLowerCase();
    const personNeedle = personFilter.trim().toLowerCase();
    return groups.filter((group) => {
      const matchesName = !nameNeedle || group.name.toLowerCase().includes(nameNeedle);
      const matchesPerson = !personNeedle || (group.members || []).some((member) => member.email.toLowerCase().includes(personNeedle));
      return matchesName && matchesPerson;
    });
  }, [groups, nameFilter, personFilter]);

  const createGroup = useMutation({
    mutationFn: (payload: GroupFormState) =>
      apiRequest<SREGroup>('/admin/sre-groups', {
        method: 'POST',
        body: JSON.stringify({ ...payload, description: payload.description || null }),
      }),
    onSuccess: () => {
      closeDialog();
      setMessage('Grupo SRE criado.');
      queryClient.invalidateQueries({ queryKey: ['sre-groups'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Erro ao adicionar grupo'),
  });

  const updateGroup = useMutation({
    mutationFn: ({ groupId, payload }: { groupId: number; payload: GroupFormState }) =>
      apiRequest<SREGroup>(`/admin/sre-groups/${groupId}`, {
        method: 'PUT',
        body: JSON.stringify({ ...payload, description: payload.description || null }),
      }),
    onSuccess: () => {
      closeDialog();
      setMessage('Grupo SRE atualizado.');
      queryClient.invalidateQueries({ queryKey: ['sre-groups'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Erro ao atualizar grupo'),
  });

  const deleteGroup = useMutation({
    mutationFn: (groupId: number) => apiRequest<void>(`/admin/sre-groups/${groupId}`, { method: 'DELETE' }),
    onSuccess: () => {
      setMessage('Grupo SRE removido.');
      queryClient.invalidateQueries({ queryKey: ['sre-groups'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (err) => setMessage(err instanceof Error ? err.message : 'Erro ao remover grupo'),
  });

  function openCreate() {
    setDialogMode('create');
    setSelectedGroup(null);
    setFormState(emptyForm);
    setError(null);
    setDialogOpen(true);
  }

  function openGroup(group: SREGroup, mode: Exclude<DialogMode, 'create'>) {
    setDialogMode(mode);
    setSelectedGroup(group);
    setFormState(toFormState(group));
    setError(null);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setSelectedGroup(null);
    setFormState(emptyForm);
    setError(null);
  }

  function saveGroup() {
    setError(null);
    if (dialogMode === 'create') {
      createGroup.mutate(formState);
      return;
    }
    if (selectedGroup) {
      updateGroup.mutate({ groupId: selectedGroup.id, payload: formState });
    }
  }

  function confirmDelete(group: SREGroup) {
    const ok = window.confirm(`Remover o grupo SRE "${group.name}"?`);
    if (ok) deleteGroup.mutate(group.id);
  }

  const readOnly = dialogMode === 'view';
  const isSaving = createGroup.isPending || updateGroup.isPending;

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between">
        <Stack direction="row" spacing={2} alignItems="center">
          <Button component={RouterLink} to="/admin" startIcon={<ArrowBack />}>
            Voltar
          </Button>
          <Typography variant="h4" fontWeight={800}>
            Grupos SRE
          </Typography>
        </Stack>
        <Button variant="contained" startIcon={<Add />} onClick={openCreate} sx={{ fontWeight: 800 }}>
          NOVO GRUPO
        </Button>
      </Stack>

      <Paper className="main-page-filters" sx={{ p: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <TextField label="Filtrar por nome do grupo" value={nameFilter} onChange={(event) => setNameFilter(event.target.value)} fullWidth />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField label="Filtrar por pessoa/e-mail configurado" value={personFilter} onChange={(event) => setPersonFilter(event.target.value)} fullWidth />
          </Grid>
        </Grid>
      </Paper>

      <Card>
        <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Grupo</TableCell>
                <TableCell>Pessoas</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredGroups.map((group) => (
                <TableRow key={group.id} hover>
                  <TableCell>
                    <Typography fontWeight={800}>{group.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {group.description || 'Sem descrição'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                      {(group.members || []).length > 0 ? (
                        group.members.map((member) => <Chip key={member.id} label={member.email} size="small" />)
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          Nenhuma pessoa vinculada.
                        </Typography>
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Chip label={group.is_active ? 'Ativo' : 'Inativo'} size="small" color={group.is_active ? 'success' : 'default'} />
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Visualizar">
                      <IconButton onClick={() => openGroup(group, 'view')}>
                        <Visibility />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Editar">
                      <IconButton onClick={() => openGroup(group, 'edit')}>
                        <Edit />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Remover">
                      <IconButton onClick={() => confirmDelete(group)} color="error">
                        <Delete />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {filteredGroups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Alert severity="info">Nenhum grupo SRE encontrado.</Alert>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>{dialogMode === 'create' ? 'Novo grupo SRE' : readOnly ? 'Visualizar grupo SRE' : 'Editar grupo SRE'}</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Nome do grupo" value={formState.name} onChange={(e) => setFormState({ ...formState, name: e.target.value })} required disabled={readOnly} />
            <TextField
              label="Descrição"
              value={formState.description}
              onChange={(e) => setFormState({ ...formState, description: e.target.value })}
              multiline
              minRows={2}
              disabled={readOnly}
            />
            <MultiPersonEmailAutocomplete label="Pessoas do grupo" value={formState.member_emails} onChange={(value) => setFormState({ ...formState, member_emails: value })} disabled={readOnly} />
            <FormControlLabel
              control={<Checkbox checked={formState.is_active} onChange={(e) => setFormState({ ...formState, is_active: e.target.checked })} disabled={readOnly} />}
              label="Ativo"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>{readOnly ? 'Fechar' : 'Cancelar'}</Button>
          {!readOnly && (
            <Button onClick={saveGroup} variant="contained" disabled={!formState.name || isSaving}>
              Salvar
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Snackbar open={!!message} autoHideDuration={5000} onClose={() => setMessage(null)} message={message} />
    </Stack>
  );
}
