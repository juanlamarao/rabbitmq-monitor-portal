import { Add, Delete, Edit } from '@mui/icons-material';
import { Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography } from '@mui/material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiRequest } from '../services/api';
import { Cluster } from '../types/api';

type Group = {id:number;object_id:string;name:string;description:string|null;is_admin:boolean;is_active:boolean;cluster_ids:number[]};
type Form = Omit<Group,'id'>;
const empty:Form={object_id:'',name:'',description:'',is_admin:false,is_active:true,cluster_ids:[]};
export default function AccessGroupsPage() {
  const queryClient=useQueryClient();
  const {data:groups=[]}=useQuery({queryKey:['access-groups'],queryFn:()=>apiRequest<Group[]>('/access/groups')});
  const {data:clusters=[]}=useQuery({queryKey:['clusters'],queryFn:()=>apiRequest<Cluster[]>('/clusters')});
  const [form,setForm]=useState<Form>(empty); const [active,setActive]=useState<Group|null>(null);
  const [open,setOpen]=useState(false); const [error,setError]=useState(''); const [search,setSearch]=useState('');
  const save=useMutation({mutationFn:()=>apiRequest(`/access/groups${active?`/${active.id}`:''}`,{method:active?'PUT':'POST',body:JSON.stringify(form)}),onSuccess:()=>{queryClient.invalidateQueries({queryKey:['access-groups']});setOpen(false);},onError:e=>setError(String(e))});
  const remove=useMutation({mutationFn:(id:number)=>apiRequest(`/access/groups/${id}`,{method:'DELETE'}),onSuccess:()=>queryClient.invalidateQueries({queryKey:['access-groups']}),onError:e=>setError(String(e))});
  const start=(group?:Group)=>{setActive(group||null);setForm(group?{object_id:group.object_id,name:group.name,description:group.description,is_admin:group.is_admin,is_active:group.is_active,cluster_ids:group.cluster_ids}:empty);setError('');setOpen(true);};
  return <Stack spacing={3}>
    <Stack direction="row" alignItems="center" justifyContent="space-between"><Typography variant="h4" fontWeight={800}>Permissões de Acesso</Typography><Button variant="contained" startIcon={<Add/>} onClick={()=>start()}>Associar grupo Entra</Button></Stack>
    <Typography variant="body2" color="text.secondary">Vincule o Object ID do grupo Entra aos clusters editáveis. Todos os usuários atribuídos ao aplicativo têm leitura; grupos Admin têm acesso global. O portal não altera membros do grupo no Entra. A App Role Portal.Read dá leitura; para editar, associe o Object ID do grupo ao cluster nesta página e habilite a claim groups no token do Entra. Não é necessário criar uma App Role por cluster. Após alterar grupo, faça novo login.</Typography>
    {error && <Alert severity="error">{error}</Alert>}
    <TextField label="Pesquisar grupo" value={search} onChange={e=>setSearch(e.target.value)} fullWidth/>
    <Paper><Table><TableHead><TableRow><TableCell>Grupo</TableCell><TableCell>Object ID</TableCell><TableCell>Tipo</TableCell><TableCell>Clusters de edição</TableCell><TableCell>Ações</TableCell></TableRow></TableHead><TableBody>
      {groups.filter(g=>(g.name+' '+g.object_id).toLowerCase().includes(search.toLowerCase())).map(g=><TableRow key={g.id}><TableCell>{g.name}</TableCell><TableCell sx={{fontFamily:'monospace',fontSize:12}}>{g.object_id}</TableCell><TableCell><Chip size="small" label={g.is_admin?'Admin':'Editor'}/></TableCell><TableCell>{g.is_admin?'Todos':g.cluster_ids.map(id=>clusters.find(c=>c.id===id)?.name||`#${id}`).join(', ')||'Nenhum'}</TableCell><TableCell><Tooltip title="Editar"><IconButton onClick={()=>start(g)}><Edit/></IconButton></Tooltip><Tooltip title="Remover"><IconButton onClick={()=>{if(window.confirm(`Excluir associação ${g.name}?`))remove.mutate(g.id);}}><Delete/></IconButton></Tooltip></TableCell></TableRow>)}
    </TableBody></Table></Paper>
    <Dialog open={open} onClose={()=>setOpen(false)} fullWidth maxWidth="sm"><DialogTitle>{active?'Editar associação':'Novo grupo Entra'}</DialogTitle><DialogContent><Stack spacing={2} sx={{pt:1}}>
      <TextField label="Nome do grupo" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
      <TextField label="Object ID (GUID do Entra)" value={form.object_id} onChange={e=>setForm({...form,object_id:e.target.value})}/>
      <TextField label="Descrição" value={form.description||''} onChange={e=>setForm({...form,description:e.target.value})}/>
      <FormControlLabel control={<Checkbox checked={form.is_admin} onChange={(_,v)=>setForm({...form,is_admin:v})}/>} label="Grupo administrador global"/>
      <FormControlLabel control={<Checkbox checked={form.is_active} onChange={(_,v)=>setForm({...form,is_active:v})}/>} label="Ativo"/>
      {!form.is_admin && <Box><Typography fontWeight={700}>Clusters que o grupo pode editar</Typography>{clusters.map(c=><FormControlLabel key={c.id} sx={{display:'block'}} control={<Checkbox checked={form.cluster_ids.includes(c.id)} onChange={(_,v)=>setForm({...form,cluster_ids:v?[...form.cluster_ids,c.id]:form.cluster_ids.filter(i=>i!==c.id)})}/>} label={c.name}/>)}</Box>}
      {error&&<Alert severity="error">{error}</Alert>}
    </Stack></DialogContent><DialogActions><Button onClick={()=>setOpen(false)}>Cancelar</Button><Button variant="contained" onClick={()=>save.mutate()} disabled={!form.name||!form.object_id||save.isPending}>Salvar</Button></DialogActions></Dialog>
  </Stack>;
}
