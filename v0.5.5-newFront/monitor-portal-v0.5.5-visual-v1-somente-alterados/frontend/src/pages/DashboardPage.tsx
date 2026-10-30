import { AccountTree, ArrowForward, CheckCircleOutline, ErrorOutline, Queue as QueueIcon, Rule, Refresh } from '@mui/icons-material';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Grid, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiRequest } from '../services/api';

interface Overview {
  total_clusters: number;
  active_clusters: number;
  active_queues: number;
  synced_monitors: number;
  attention_monitors: number;
  clusters: {id:number;name:string;environment:string;is_active:boolean;last_discovery_at:string|null;queue_count:number}[];
  activity: {id:number;summary:string;actor:string;action:string;created_at:string}[];
}

const number = (n: number) => new Intl.NumberFormat('pt-BR').format(n);
const when = (v?: string|null) => v ? new Date(v).toLocaleString('pt-BR') : 'Sem coleta registrada';

export default function DashboardPage() {
  const { data, isPending, error, refetch, isFetching } = useQuery({
    queryKey:['dashboard-overview'],queryFn:()=>apiRequest<Overview>('/dashboard/overview'),refetchInterval:60000,
  });
  const cards=[
    {label:'Clusters',value:data?.total_clusters,foot:data?`${number(data.active_clusters)} ativos`:'',icon:<AccountTree/>,tone:'#0B5FAF'},
    {label:'Queues descobertas',value:data?.active_queues,foot:'Não removidas',icon:<QueueIcon/>,tone:'#216AAF'},
    {label:'Monitores sincronizados',value:data?.synced_monitors,foot:'Datadog · sync OK',icon:<CheckCircleOutline/>,tone:'#23815F'},
    {label:'Pendências',value:data?.attention_monitors,foot:'Monitores para revisão',icon:<ErrorOutline/>,tone:'#C28B1D'},
  ];
  return <Stack spacing={2.5}>
    <Box sx={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:2,flexWrap:'wrap'}}>
      <Box><Typography sx={{fontSize:11,color:'#8797AA',mb:.5}}>Operação / Visão geral</Typography>
        <Typography variant="h4" fontWeight={800}>Dashboard</Typography>
        <Typography color="text.secondary" variant="body2">Indicadores reais do Monitor Portal e atividades recentes.</Typography>
      </Box>
      <Button variant="contained" startIcon={<Refresh/>} onClick={()=>refetch()} disabled={isFetching} sx={{textTransform:'none'}}>Atualizar dados</Button>
    </Box>
    {error && <Alert severity="error">Não foi possível carregar os indicadores. {(error as Error).message}</Alert>}
    <Grid container spacing={2}>
      {cards.map(c=><Grid item xs={12} sm={6} lg={3} key={c.label}>
        <Card sx={{height:'100%'}}><CardContent sx={{p:2.5}}>
          <Stack direction="row" justifyContent="space-between" alignItems="start">
            <Box><Typography variant="body2" color="text.secondary">{c.label}</Typography>
              <Typography sx={{fontSize:{xs:26,md:32},fontWeight:800,mt:1,color:c.label==='Pendências'?'#AF7C16':'#102E56',letterSpacing:'-.04em'}}>{isPending?<CircularProgress size={23}/>:number(c.value??0)}</Typography>
            </Box>
            <Box sx={{bgcolor:'#EEF5FE',color:c.tone,p:1.1,borderRadius:2,display:'flex'}}>{c.icon}</Box>
          </Stack>
          <Typography sx={{fontSize:11,color:'#8B9BAF',mt:1}}>{c.foot || 'Carregando...'}</Typography>
        </CardContent></Card>
      </Grid>)}
    </Grid>
    <Grid container spacing={2}>
      <Grid item xs={12} lg={8}>
        <Card sx={{height:'100%'}}>
          <Box sx={{p:2.5,pb:1,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <Typography fontWeight={800}>Clusters RabbitMQ</Typography>
            <Button size="small" component={Link} to="/clusters" endIcon={<ArrowForward fontSize="small"/>} sx={{textTransform:'none'}}>Ver todos</Button>
          </Box>
          <TableContainer><Table size="small">
            <TableHead><TableRow><TableCell>Cluster</TableCell><TableCell>Estado cadastral</TableCell><TableCell align="right">Queues</TableCell><TableCell>Última coleta</TableCell></TableRow></TableHead>
            <TableBody>
              {(data?.clusters||[]).map(c=><TableRow key={c.id} hover>
                <TableCell><Box component={Link} to={`/clusters/${c.id}/view`} sx={{color:'#165AA8',fontWeight:700,textDecoration:'none'}}>{c.name}</Box>
                  <Typography sx={{fontSize:10,color:'#95A4B4'}}>{c.environment}</Typography></TableCell>
                <TableCell><Chip label={c.is_active?'Ativo':'Inativo'} size="small" color={c.is_active?'success':'default'} variant="outlined"/></TableCell>
                <TableCell align="right">{number(c.queue_count)}</TableCell><TableCell sx={{fontSize:12,color:'text.secondary'}}>{when(c.last_discovery_at)}</TableCell>
              </TableRow>)}
              {!isPending && !data?.clusters.length && <TableRow><TableCell colSpan={4}>Nenhum cluster cadastrado.</TableCell></TableRow>}
            </TableBody>
          </Table></TableContainer>
        </Card>
      </Grid>
      <Grid item xs={12} lg={4}>
        <Card sx={{height:'100%'}}>
          <Box sx={{px:2.5,pt:2.5,pb:1,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <Typography fontWeight={800}>Atividade recente</Typography>
            <Button size="small" component={Link} to="/audit-logs" endIcon={<ArrowForward fontSize="small"/>} sx={{textTransform:'none'}}>Audit</Button>
          </Box>
          <Stack divider={<Box sx={{borderTop:'1px solid #EDF1F6'}}/>}>
            {(data?.activity||[]).map(a=><Box key={a.id} sx={{py:1.45,px:2.5,display:'flex',gap:1.25}}>
              <Box sx={{width:26,height:26,bgcolor:'#EAF3FF',borderRadius:'50%',display:'grid',placeItems:'center',color:'#155BA9',flexShrink:0,fontSize:12,fontWeight:700}}><Rule sx={{fontSize:15}}/></Box>
              <Box sx={{minWidth:0}}><Typography sx={{fontWeight:700,fontSize:12,overflowWrap:'anywhere'}}>{a.summary}</Typography>
                <Typography sx={{fontSize:11,color:'#93A2B5',mt:.5}}>{a.actor} · {when(a.created_at)}</Typography></Box>
            </Box>)}
            {!isPending && !data?.activity.length && <Box sx={{px:2.5,pb:3,color:'text.secondary'}}>Sem atividades recentes.</Box>}
          </Stack>
        </Card>
      </Grid>
    </Grid>
    <Typography sx={{color:'#94A3B7',fontSize:11}}>Indicadores obtidos do MySQL. Status cadastral não substitui teste de conectividade em tempo real.</Typography>
  </Stack>;
}
