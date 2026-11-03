import { Button, Grid, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiRequest } from '../services/api';
import { AuditLog } from '../types/api';

type AuditFilters = { q: string; entity_type: string; action: string; actor: string; date_from: string; date_to: string };
const blank: AuditFilters = { q: '', entity_type: '', action: '', actor: '', date_from: '', date_to: '' };

export default function AuditLogPage() {
  const [draft, setDraft] = useState<AuditFilters>(blank);
  const [applied, setApplied] = useState<AuditFilters>(blank);
  const params = new URLSearchParams({ limit: '500' });
  for (const [key, value] of Object.entries(applied)) if (value.trim()) params.set(key, value.trim());
  const { data: logs = [], isFetching } = useQuery({
    queryKey: ['audit-logs', applied],
    queryFn: () => apiRequest<AuditLog[]>(`/audit-logs?${params.toString()}`),
  });
  const edit = (key: keyof AuditFilters, value: string) => setDraft(prev => ({ ...prev, [key]: value }));
  return (
    <Stack spacing={2.5}>
      <Stack spacing={0.5}>
        <Typography variant="h4">Audit Logs</Typography>
        <Typography variant="body2" color="text.secondary">Pesquise alterações por entidade, ação, usuário, conteúdo e período.</Typography>
      </Stack>
      <Paper sx={{ p: 2 }}>
        <Stack component="form" spacing={2} onSubmit={event => { event.preventDefault(); setApplied({ ...draft }); }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={4}><TextField fullWidth label="Pesquisar no histórico" value={draft.q} onChange={event => edit('q', event.target.value)} /></Grid>
            <Grid item xs={12} sm={6} md={2}><TextField fullWidth label="Entidade" value={draft.entity_type} onChange={event => edit('entity_type', event.target.value)} /></Grid>
            <Grid item xs={12} sm={6} md={2}><TextField fullWidth label="Ação" value={draft.action} onChange={event => edit('action', event.target.value)} /></Grid>
            <Grid item xs={12} md={4}><TextField fullWidth label="Ator / Usuário" value={draft.actor} onChange={event => edit('actor', event.target.value)} /></Grid>
            <Grid item xs={12} sm={6} md={3}><TextField fullWidth label="Data inicial" type="date" InputLabelProps={{ shrink: true }} value={draft.date_from} onChange={event => edit('date_from', event.target.value)} /></Grid>
            <Grid item xs={12} sm={6} md={3}><TextField fullWidth label="Data final" type="date" InputLabelProps={{ shrink: true }} value={draft.date_to} onChange={event => edit('date_to', event.target.value)} /></Grid>
            <Grid item xs={12} md={6} sx={{ display: 'flex', gap: 1 }}>
              <Button type="submit" variant="contained">Aplicar filtros</Button>
              <Button type="button" variant="outlined" onClick={() => { setDraft({ ...blank }); setApplied({ ...blank }); }}>Limpar</Button>
            </Grid>
          </Grid>
        </Stack>
      </Paper>
      <Paper sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead><TableRow><TableCell>Data</TableCell><TableCell>Entidade</TableCell><TableCell>Ação</TableCell><TableCell>Ator</TableCell><TableCell>Resumo</TableCell></TableRow></TableHead>
          <TableBody>
            {logs.map(log => <TableRow key={log.id} hover>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(log.created_at).toLocaleString('pt-BR')}</TableCell>
              <TableCell>{log.entity_type} #{log.entity_id || '-'}</TableCell>
              <TableCell>{log.action}</TableCell>
              <TableCell>{log.actor}</TableCell>
              <TableCell>{log.summary}</TableCell>
            </TableRow>)}
            {!isFetching && logs.length === 0 && <TableRow><TableCell colSpan={5}>Nenhum registro encontrado para os filtros selecionados.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Paper>
      <Typography variant="caption" color="text.secondary">{isFetching ? 'Consultando histórico…' : `${logs.length} registro(s) exibido(s), limitado aos 500 mais recentes que atendem aos filtros.`}</Typography>
    </Stack>
  );
}
