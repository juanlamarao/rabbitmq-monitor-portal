import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, LinearProgress, Paper, Stack, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { CheckCircle, Edit, Error as ErrorIcon, HelpOutline, OpenInNew, Refresh,
  Sync, WarningAmber } from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiRequest } from '../services/api';

type Kind = 'sre_ops' | 'ccbp' | 'vicci';
type Status = 'ok' | 'different' | 'missing' | 'unconfigured' | 'error' | 'unknown';
type WebhookTemplate = {
  kind: Kind; label: string; name: string; url: string; payload: string;
  custom_headers: string; configured: boolean; updated_at: string;
};
type OrgStatus = { status: Status; error?: string|null; checked_at?: string|null };
type Org = {
  id: number; name: string; org_url: string; overall: 'ok'|'partial'|'not_ok';
  is_active: boolean; integrations: Record<Kind, OrgStatus>;
};
type Dashboard = { total:number; ok:number; partial:number; not_ok:number; orgs: Org[] };
type Run = {id:string; status:string; repair:boolean; total:number; processed:number; errors:number;
  current_org?:string; results?:unknown[]; error?:string};
const KINDS: Kind[] = ['sre_ops','ccbp','vicci'];
const LABELS: Record<Kind, string> = {sre_ops:'SRE OPS',ccbp:'CCBP',vicci:'VICCI'};
const statusHelp:Record<Status,string> = {
  ok:'Webhook existe e sua configuração corresponde à configuração do portal.',
  different:'Webhook existe, mas a URL, o payload ou os headers divergem do portal.',
  missing:'Webhook não encontrado nesta organização Datadog.',
  unconfigured:'Configure primeiro a URL do template de webhook no portal.',
  error:'A consulta à API Datadog falhou. Verifique as permissões e os logs do backend.',
  unknown:'Ainda não foi validado ou o template foi alterado após a última validação.',
};
function StatusIcon({item,onClick}:{item:OrgStatus;onClick:()=>void}){
  const s = item.status;
  const color = s === 'ok' ? 'success.main' : s === 'different' ? 'warning.main' : s === 'missing' ? 'error.main' : 'text.disabled';
  const tip = `${statusHelp[s] || statusHelp.unknown}${item.error ? ` (${item.error})` : ''}${item.checked_at ? ` · ${new Date(item.checked_at).toLocaleString('pt-BR')}` : ''}`;
  return <Tooltip title={tip}><IconButton size="small" onClick={onClick} aria-label={tip} sx={{color}}>
    {s === 'ok'?<CheckCircle/>:s==='different'?<WarningAmber/>:s==='missing'?<ErrorIcon/>:<HelpOutline/>}
  </IconButton></Tooltip>;
}
const empty = {name:'',url:'',payload:'{}',custom_headers:'{}'};
function validateJsonObject(value:string,label:string){
  let parsed:unknown;
  try { parsed=JSON.parse(value); } catch { throw new Error(`${label} precisa ser um JSON válido.`); }
  if (!parsed || typeof parsed!=='object' || Array.isArray(parsed)) throw new Error(`${label} precisa ser um objeto JSON.`);
  if(label === 'Custom headers' && Object.values(parsed).some(v => typeof v !== 'string')) throw new Error('Custom headers: valores devem ser strings.');
}
export default function WebhooksPage(){
  const qc=useQueryClient();
  const [editing,setEditing]=useState<WebhookTemplate|null>(null);
  const [detail,setDetail]=useState<{org:Org;kind:Kind}|null>(null);
  const [form,setForm]=useState(empty);
  const [formError,setFormError]=useState<string|null>(null);
  const {data:templates=[]}=useQuery({queryKey:['webhook-templates'],queryFn:()=>apiRequest<WebhookTemplate[]>('/admin/webhooks/templates')});
  const {data:dashboard,isLoading:loadingDash,error:dashError,refetch}=useQuery({queryKey:['webhook-dashboard'],
    queryFn:()=>apiRequest<Dashboard>('/admin/webhooks/dashboard'),refetchInterval:5000});
  const {data:run}=useQuery({queryKey:['webhook-run'],queryFn:()=>apiRequest<Run|null>('/admin/webhooks/runs/latest'),refetchInterval:2000});
  const active=run?.status==='queued'||run?.status==='running';
  const refresh=()=>{void qc.invalidateQueries({queryKey:['webhook-templates']});void qc.invalidateQueries({queryKey:['webhook-dashboard']});void qc.invalidateQueries({queryKey:['webhook-run']});};
  const save=useMutation({mutationFn:()=>apiRequest<WebhookTemplate>(`/admin/webhooks/templates/${editing?.kind}`,
    {method:'PUT',body:JSON.stringify(form)}),onSuccess:()=>{setEditing(null);refresh();},
    onError:(e:Error)=>setFormError(e.message)});
  const start=useMutation({mutationFn:(repair:boolean)=>apiRequest<Run>(repair?'/admin/webhooks/reconcile':'/admin/webhooks/validate',
    {method:'POST'}),onSuccess:refresh});
  const validateOrg=useMutation({mutationFn:({orgId,repair}:{orgId:number;repair:boolean})=>
    apiRequest<Run>(`/admin/webhooks/orgs/${orgId}/${repair?'reconcile':'validate'}`,{method:'POST'}),
    onSuccess:()=>{refresh();setDetail(null);}});
  const openEdit=(t:WebhookTemplate)=>{setEditing(t);setForm({name:t.name,url:t.url,payload:t.payload,custom_headers:t.custom_headers});setFormError(null);};
  function submit(){
    setFormError(null);
    try {
      if(!/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(form.name)) throw new Error('Name aceita letras e números separados por hífen (-), sem espaços.');
      if(form.url){const url=new URL(form.url);if(!['https:','http:'].includes(url.protocol)||!url.hostname)throw new Error('URL HTTP(S) inválida.');}
      validateJsonObject(form.payload,'Payload');validateJsonObject(form.custom_headers,'Custom headers');
      save.mutate();
    }catch(e){setFormError(e instanceof Error?e.message:'Dados inválidos');}
  }
  return <Stack spacing={3}>
    <Stack direction={{xs:'column',md:'row'}} alignItems={{xs:'start',md:'center'}} justifyContent="space-between" spacing={2}>
      <Box><Typography variant="h4">Webhooks</Typography>
        <Typography variant="body2" color="text.secondary">Modelos globais de acionamento e conformidade por organização Datadog. A reconciliação automática é diária.</Typography></Box>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Button size="small" variant="outlined" startIcon={<Refresh/>} onClick={()=>void refetch()}>Atualizar</Button>
        <Button size="small" variant="outlined" startIcon={<CheckCircle/>} disabled={active||start.isPending} onClick={()=>start.mutate(false)}>Validar</Button>
        <Button size="small" variant="contained" startIcon={<Sync/>} disabled={active||start.isPending} onClick={()=>start.mutate(true)}>Sincronizar</Button>
      </Stack>
    </Stack>
    {(dashError||start.error)&&<Alert severity="error">{String(dashError||start.error)}</Alert>}
    <Stack direction={{xs:'column',sm:'row'}} gap={2}>
      {([{label:'Total de orgs',value:dashboard?.total??0},{label:'OK',value:dashboard?.ok??0},
        {label:'Parcial',value:dashboard?.partial??0},{label:'Não OK',value:dashboard?.not_ok??0}]).map(item=><Paper key={item.label} variant="outlined" sx={{p:2,flex:1,minWidth:130}}>
        <Typography variant="caption" color="text.secondary">{item.label}</Typography><Typography variant="h4">{item.value}</Typography>
      </Paper>)}
    </Stack>
    <Paper variant="outlined" sx={{p:2}}><Stack spacing={1.5}>
      <Typography fontWeight={800}>Templates de integração</Typography>
      <Typography variant="body2" color="text.secondary">Configure os três destinos antes da primeira criação. A URL não é chamada pelo portal, apenas registrada na integração Datadog.</Typography>
      <Stack direction={{xs:'column',md:'row'}} gap={1.5}>{templates.map(t=><Paper key={t.kind} variant="outlined" sx={{p:1.5,flex:1}}>
        <Stack direction="row" justifyContent="space-between" alignItems="center"><Typography fontWeight={800}>{t.label}</Typography>
          <Tooltip title={`Editar ${t.label}`}><IconButton size="small" onClick={()=>openEdit(t)}><Edit fontSize="small"/></IconButton></Tooltip></Stack>
        <Typography variant="body2" sx={{overflowWrap:'anywhere'}}>{t.name}</Typography>
        <Chip size="small" variant="outlined" color={t.configured?'success':'warning'} label={t.configured?'Configurado':'URL pendente'}/>
      </Paper>)}</Stack>
    </Stack></Paper>
    <Paper variant="outlined" sx={{overflowX:'auto'}}>
      <Table size="small"><TableHead><TableRow><TableCell>Organização Datadog</TableCell>
        <TableCell align="center">SRE OPS</TableCell><TableCell align="center">CCBP</TableCell><TableCell align="center">VICCI</TableCell><TableCell>Situação</TableCell>
      </TableRow></TableHead><TableBody>
        {dashboard?.orgs.map(org=><TableRow key={org.id} hover>
          <TableCell><Typography fontWeight={700}>{org.name}</Typography>
            <Box component="a" href={org.org_url} target="_blank" rel="noopener noreferrer" sx={{fontSize:12,display:'inline-flex',alignItems:'center',gap:.5,overflowWrap:'anywhere'}}>{org.org_url}<OpenInNew sx={{fontSize:12}}/></Box>
          </TableCell>{KINDS.map(kind=><TableCell key={kind} align="center"><StatusIcon item={org.integrations[kind]} onClick={()=>setDetail({org,kind})}/></TableCell>)}
          <TableCell><Chip size="small" color={org.overall==='ok'?'success':org.overall==='partial'?'warning':'error'}
            label={org.overall==='ok'?'OK':org.overall==='partial'?'Parcial':'Não OK'}/></TableCell>
        </TableRow>)}
        {!dashboard?.orgs.length&&<TableRow><TableCell colSpan={5}>{loadingDash?<CircularProgress size={20}/>: 'Nenhuma organização Datadog cadastrada.'}</TableCell></TableRow>}
      </TableBody></Table>
    </Paper>
    {run && <Paper variant="outlined" sx={{p:2}}><Stack spacing={1}>
      <Stack direction="row" alignItems="center" justifyContent="space-between"><Typography fontWeight={800}>Última execução</Typography>
        <Chip size="small" label={run.status} color={active?'info':run.errors?'warning':'success'}/></Stack>
      <Typography variant="body2" color="text.secondary">{run.repair?'Reconciliação (corrigir divergências)':'Validação (somente leitura)'} · {run.current_org||'—'}</Typography>
      <LinearProgress variant="determinate" value={run.total?run.processed/run.total*100:0}/>
      <Typography variant="caption">{run.processed}/{run.total} organizações processadas · {run.errors} erros</Typography>
    </Stack></Paper>}
    <Dialog open={Boolean(detail)} onClose={()=>setDetail(null)} maxWidth="sm" fullWidth>
      <DialogTitle>{detail?`${detail.org.name} · ${LABELS[detail.kind]}`:'Diagnóstico do webhook'}</DialogTitle>
      <DialogContent dividers><Stack spacing={1.5}>
        <Typography>Status: <strong>{detail?.org.integrations[detail.kind].status}</strong></Typography>
        <Typography variant="body2">{detail?statusHelp[detail.org.integrations[detail.kind].status]:''}</Typography>
        {detail?.org.integrations[detail.kind].error&&<Alert severity="warning">{detail.org.integrations[detail.kind].error}</Alert>}
        <Typography variant="caption" color="text.secondary">Última consulta: {detail?.org.integrations[detail.kind].checked_at ? new Date(detail.org.integrations[detail.kind].checked_at!).toLocaleString('pt-BR') : 'Não validado'}</Typography>
      </Stack></DialogContent>
      <DialogActions><Button onClick={()=>setDetail(null)}>Fechar</Button>
        <Button size="small" variant="outlined" disabled={active||validateOrg.isPending} onClick={()=>detail&&validateOrg.mutate({orgId:detail.org.id,repair:false})}>Validar org</Button>
        <Button size="small" variant="contained" disabled={active||validateOrg.isPending} onClick={()=>detail&&validateOrg.mutate({orgId:detail.org.id,repair:true})}>Sincronizar org</Button>
      </DialogActions>
    </Dialog>
    <Dialog open={Boolean(editing)} onClose={()=>!save.isPending&&setEditing(null)} maxWidth="md" fullWidth>
      <DialogTitle>{editing?`Editar ${LABELS[editing.kind]}`:'Editar webhook'}</DialogTitle>
      <DialogContent dividers><Stack spacing={2} sx={{pt:.5}}>
        {formError&&<Alert severity="error">{formError}</Alert>}
        <TextField label="Name" value={form.name} fullWidth onChange={e=>setForm(f=>({...f,name:e.target.value}))}
          helperText="Identificador do webhook; separe palavras com hífen (-), não com espaços."/>
        <TextField label="URL" value={form.url} fullWidth onChange={e=>setForm(f=>({...f,url:e.target.value}))}
          helperText="Endpoint HTTP(S) de destino. Sem URL, a integração permanece pendente."/>
        <TextField label="Payload (JSON)" multiline minRows={6} value={form.payload} fullWidth
          onChange={e=>setForm(f=>({...f,payload:e.target.value}))}/>
        <TextField label="Custom headers (JSON)" multiline minRows={4} value={form.custom_headers} fullWidth
          onChange={e=>setForm(f=>({...f,custom_headers:e.target.value}))}/>
      </Stack></DialogContent>
      <DialogActions><Button onClick={()=>setEditing(null)} disabled={save.isPending}>Cancelar</Button>
        <Button variant="contained" onClick={submit} disabled={save.isPending}>{save.isPending?'Salvando...':'Salvar'}</Button></DialogActions>
    </Dialog>
    <Dialog open={Boolean(active)} maxWidth="sm" fullWidth><DialogTitle>{run?.repair?'Sincronizando webhooks':'Validando webhooks'}</DialogTitle>
      <DialogContent dividers><Stack spacing={2} sx={{py:1}}><Typography>Consultando as organizações Datadog. O processamento é assíncrono.</Typography>
        <LinearProgress variant={run?.total?'determinate':'indeterminate'} value={run?.total?(run.processed/run.total)*100:0}/>
        <Typography variant="body2" color="text.secondary">{run?.current_org || 'Iniciando...'} · {run?.processed||0}/{run?.total||0} organizações</Typography>
      </Stack></DialogContent></Dialog>
  </Stack>;
}
