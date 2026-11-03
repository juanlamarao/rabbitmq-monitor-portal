import { Alert, Box, Button, Chip, CircularProgress, Divider, LinearProgress, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../services/api';

type ClusterProgress = {
  cluster_id: number; cluster_name: string; org_name: string; status: string;
  total_queues: number; processed_queues: number; percent: number;
  current_queue?: string | null; current_action?: string | null;
  created: number; updated: number; errors: number;
};
type Run = {
  id: number; status: string; trigger: string; requested_by: string;
  stage: string; current_action?: string | null; created_at: string;
  total_orgs: number; processed_orgs: number;
  total_clusters: number; processed_clusters: number;
  total_queues: number; processed_queues: number; percent: number;
  created: number; updated: number; recovered: number; errors: number; untracked_remote: number;
  error_summary?: string | null; clusters: ClusterProgress[];
};

export default function DatadogReconciliationPage(){
  const qc = useQueryClient();
  const { data: run, isLoading, error, refetch } = useQuery({
    queryKey: ['datadog-reconcile-latest'],
    queryFn: () => apiRequest<Run | null>('/datadog-reconcile/latest'),
    refetchInterval: 3000,
  });
  const start = useMutation({
    mutationFn: () => apiRequest<Run>('/datadog-reconcile/start',{method:'POST'}),
    onSuccess: () => qc.invalidateQueries({queryKey:['datadog-reconcile-latest']}),
  });
  const active = run?.status === 'running' || run?.status === 'queued';
  return <Stack spacing={3}>
    <Stack direction={{xs:'column',md:'row'}} alignItems={{xs:'start',md:'center'}} justifyContent="space-between" spacing={2}>
      <Box><Typography variant="h4">Reconciliação Datadog</Typography>
        <Typography variant="body2" color="text.secondary">Validação diária de monitores gerenciados pelo Monitor Portal, por org, cluster e fila.</Typography></Box>
      <Stack direction="row" spacing={1}>
        <Button variant="outlined" startIcon={<RefreshIcon/>} onClick={() => void refetch()}>Atualizar</Button>
        <Tooltip title={active ? 'Uma reconciliação já está em andamento' : 'Iniciar uma validação completa'}>
          <span><Button variant="contained" startIcon={<PlayArrowIcon/>} disabled={active || start.isPending}
            onClick={() => start.mutate()}>Executar agora</Button></span>
        </Tooltip>
      </Stack>
    </Stack>
    {(error || start.error) && <Alert severity="error">{String(start.error || error)}</Alert>}
    {isLoading && <CircularProgress size={24}/>}
    {!run && !isLoading && <Alert severity="info">Nenhuma execução registrada. O reconciliador agenda a primeira execução automaticamente; o Admin também pode iniciar manualmente.</Alert>}
    {run && <>
      <Paper sx={{p:3}}><Stack spacing={1.5}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
          <Typography variant="h6">Execução #{run.id}</Typography>
          <Chip label={run.status} color={run.status==='done'?'success':run.status==='failed'?'error':active?'info':'warning'}/>
        </Stack>
        <Typography color="text.secondary" variant="body2">{run.trigger === 'manual'?'Manual':'Automática'} · {run.requested_by} · {new Date(run.created_at).toLocaleString('pt-BR')}</Typography>
        <Typography fontWeight={700}>{run.stage}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{overflowWrap:'anywhere'}}>{run.current_action || 'Nenhuma operação ativa'}</Typography>
        <LinearProgress variant="determinate" value={run.percent} sx={{height:9,borderRadius:7}}/>
        <Typography variant="body2">{run.percent}% · {run.processed_queues}/{run.total_queues} filas · {run.processed_clusters}/{run.total_clusters} clusters · {run.processed_orgs}/{run.total_orgs} orgs</Typography>
        <Divider/>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip variant="outlined" color="success" label={`Criados: ${run.created}`}/>
          <Chip variant="outlined" label={`Atualizados: ${run.updated}`}/>
          <Chip variant="outlined" color="info" label={`IDs recuperados: ${run.recovered}`}/>
          <Chip variant="outlined" color="warning" label={`Remotos sem vínculo: ${run.untracked_remote}`}/>
          <Chip variant="outlined" color={run.errors?'error':'default'} label={`Erros: ${run.errors}`}/>
        </Stack>
        {run.error_summary && <Alert severity="error">{run.error_summary}</Alert>}
      </Stack></Paper>
      <Paper sx={{overflow:'auto'}}>
        <Table size="small"><TableHead><TableRow>
          <TableCell>Organização / Cluster</TableCell><TableCell>Filas verificadas</TableCell><TableCell>Andamento</TableCell><TableCell>Operação atual</TableCell><TableCell>Alterações</TableCell>
        </TableRow></TableHead><TableBody>
          {run.clusters.map(c=><TableRow key={c.cluster_id}>
            <TableCell><Typography fontWeight={700}>{c.cluster_name}</Typography><Typography variant="caption" color="text.secondary">{c.org_name}</Typography></TableCell>
            <TableCell sx={{minWidth:150}}><LinearProgress variant="determinate" value={c.percent} sx={{height:7,borderRadius:5,mb:.7}}/><Typography variant="caption">{c.processed_queues}/{c.total_queues} ({c.percent}%)</Typography></TableCell>
            <TableCell><Chip size="small" label={c.status}/></TableCell>
            <TableCell sx={{maxWidth:290}}><Typography variant="body2" sx={{overflowWrap:'anywhere'}}>{c.current_action || '—'}</Typography><Typography variant="caption" color="text.secondary">{c.current_queue}</Typography></TableCell>
            <TableCell>{c.created} criados · {c.updated} editados {c.errors>0?`· ${c.errors} erros`:''}</TableCell>
          </TableRow>)}
          {!run.clusters.length && <TableRow><TableCell colSpan={5}>Ainda não foram carregados clusters.</TableCell></TableRow>}
        </TableBody></Table>
      </Paper>
      <Alert severity="info">O reconciliador não exclui monitores órfãos automaticamente. Alterações ainda pendentes na fila transacional têm prioridade e não são sobrescritas nesta passagem.</Alert>
    </>}
  </Stack>;
}
