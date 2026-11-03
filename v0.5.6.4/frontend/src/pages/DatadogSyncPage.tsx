import { Alert, Box, Chip, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../services/api';

type Entry = { queue_id: number; status: string; desired_revision: number; applied_revision: number; attempts: number;
  reason: string; requested_by: string; last_error?: string | null; updated_at?: string | null; last_synced_at?: string | null };

const labels: Record<string,string>={synced:'Em sync',pending:'Pendente',running:'Sincronizando',retry:'Retry agendado',error:'Falha',blocked:'Revisão necessária'};
export default function DatadogSyncPage() {
  const {data:records=[],isLoading,error}=useQuery({queryKey:['datadog-sync-queue'],queryFn:()=>apiRequest<Entry[]>('/datadog-sync-queue/entries?limit=200'),refetchInterval:5000});
  const {data:counts={}}=useQuery({queryKey:['datadog-sync-summary'],queryFn:()=>apiRequest<Record<string,number>>('/datadog-sync-queue/summary'),refetchInterval:5000});
  return <Stack spacing={3}>
    <Box><Typography variant="h4">Datadog — Fila automática</Typography>
      <Typography variant="body2" color="text.secondary">Cada alteração é persistida no MySQL e aplicada automaticamente na Org Datadog da respectiva queue.</Typography></Box>
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
      {Object.entries(counts).map(([state,count])=><Chip key={state} label={`${labels[state] || state}: ${count}`} variant="outlined"/>)}
    </Stack>
    <Alert severity="info">Não há botão de sincronização. A ausência de entradas indica que nenhuma alteração foi solicitada desde a ativação desta fila; não confirma, isoladamente, que Datadog e Portal estão iguais.</Alert>
    {error && <Alert severity="error">Não foi possível consultar a fila.</Alert>}
    <Paper sx={{overflow:'auto'}}><Table size="small"><TableHead><TableRow>
      <TableCell>Queue ID</TableCell><TableCell>Estado</TableCell><TableCell>Revisão</TableCell><TableCell>Tentativas</TableCell><TableCell>Origem / Usuário</TableCell><TableCell>Erro</TableCell>
    </TableRow></TableHead><TableBody>
      {records.map(r=><TableRow key={r.queue_id}>
        <TableCell>{r.queue_id}</TableCell><TableCell><Chip size="small" label={labels[r.status]||r.status} color={r.status==='synced'?'success':r.status==='error'||r.status==='blocked'?'error':'warning'}/></TableCell>
        <TableCell>{r.applied_revision}/{r.desired_revision}</TableCell><TableCell>{r.attempts}</TableCell><TableCell>{r.reason}<Typography variant="caption" display="block" color="text.secondary">{r.requested_by}</Typography></TableCell>
        <TableCell sx={{maxWidth:340,overflowWrap:'anywhere'}}>{r.last_error||'—'}</TableCell>
      </TableRow>)}
      {!isLoading && records.length===0 && <TableRow><TableCell colSpan={6}>Nenhuma alteração na fila.</TableCell></TableRow>}
    </TableBody></Table></Paper>
  </Stack>;
}
