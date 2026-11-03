import { Alert, Box, Button, Card, CardContent, FormControlLabel, Grid, Radio, RadioGroup, Stack, Switch, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { AppearanceSettings, useAppearance } from '../services/appearance';

function LayoutPreview({type}:{type:'corporate'|'workspace'}){
  return <Box sx={{height:144,display:'flex',bgcolor:'#F5F8FC',border:'1px solid #E2EAF3',borderRadius:2,overflow:'hidden',mb:2}}>
    <Box sx={{width:'24%',bgcolor:type==='corporate'?'#fff':'#082B5D',p:1.3}}>
      {[0,1,2,3,4].map(i=><Box key={i} sx={{height:7,mb:1.7,width:i===0?'70%':'95%',borderRadius:1,bgcolor:i===0?'#4C8CCA':type==='corporate'?'#E2EAF3':'#2C507B'}}/>)}
    </Box>
    <Box sx={{flex:1,p:1.4}}>
      <Box sx={{height:type==='corporate'?9:35,width:type==='corporate'?'52%':'100%',bgcolor:type==='corporate'?'#B9CBDD':'#125AA6',borderRadius:1,mb:2}}/>
      <Stack direction="row" spacing={.8}>{[0,1,2].map(i=><Box key={i} sx={{flex:1,height:45,bgcolor:'#fff',border:'1px solid #E3EAF4',borderRadius:1}}/>)}</Stack>
      <Box sx={{height:17,bgcolor:'#fff',borderRadius:1,mt:1,border:'1px solid #E3EAF4'}}/>
    </Box>
  </Box>;
}

export default function AppearancePage(){
  const {appearance,saveAppearance}=useAppearance();
  const [draft,setDraft]=useState<AppearanceSettings>(appearance);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>setDraft(appearance),[appearance]);
  const save=async()=>{setSaving(true);setError('');setMessage('');try{await saveAppearance(draft);setMessage('Aparência atualizada para todos os usuários.');}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setSaving(false)}};
  return <Stack spacing={3}>
    <Box><Typography sx={{fontSize:11,color:'#8293AA',mb:.7}}>Administração / Configurações globais</Typography>
      <Typography variant="h4" fontWeight={800}>Aparência do portal</Typography>
      <Typography color="text.secondary">Configure o layout global e o visual da tela de login para todos os usuários.</Typography>
    </Box>
    {message && <Alert severity="success">{message}</Alert>}
    {error && <Alert severity="error">{error}</Alert>}
    <Typography fontWeight={800}>Layout global</Typography>
    <RadioGroup value={draft.layout} onChange={(_,layout)=>setDraft(d=>({...d,layout:layout as AppearanceSettings['layout']}))}>
      <Grid container spacing={2}>
        {(['corporate','workspace'] as const).map(layout=><Grid item xs={12} md={6} key={layout}>
          <Card sx={{height:'100%',border:draft.layout===layout?'2px solid #1164B8':'1px solid #E4EAF2',cursor:'pointer',boxShadow:draft.layout===layout?'0 0 0 3px #E9F3FF':undefined}} onClick={()=>setDraft(d=>({...d,layout}))}>
            <CardContent sx={{p:2.5}}>
              <LayoutPreview type={layout}/>
              <Stack direction="row" justifyContent="space-between" alignItems="center"><Typography fontWeight={800}>{layout==='corporate'?'Corporate':'Workspace'}</Typography><FormControlLabel sx={{m:0}} value={layout} control={<Radio size="small"/>} label=""/></Stack>
              <Typography color="text.secondary" variant="body2" sx={{mt:1}}>{layout==='corporate'?'Páginas operacionais e tabelas com navegação direta.':'Home com módulos, destaque azul e navegação visual.'}</Typography>
            </CardContent>
          </Card>
        </Grid>)}
      </Grid>
    </RadioGroup>
    <Card><CardContent sx={{p:3}}>
      <Stack spacing={2}>
        <Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography fontWeight={800}>Paleta de cores</Typography><Typography variant="body2" color="text.secondary">BTG Light · azul e branco</Typography></Box><Stack direction="row" spacing={.8}>{['#082B5D','#0756AE','#EAF3FF','#FFFFFF'].map(c=><Box key={c} sx={{width:25,height:25,bgcolor:c,borderRadius:'50%',border:'1px solid #DCE6F0'}}/>)}</Stack></Stack>
        <Box sx={{borderTop:'1px solid #EAF0F6'}}/>
        <FormControlLabel control={<Switch checked={draft.login_particles} onChange={(_,enabled)=>setDraft(d=>({...d,login_particles:enabled}))}/>} label={<Box><Typography fontWeight={750}>Partículas na tela de login</Typography><Typography variant="body2" color="text.secondary">Animação sutil, respeitando movimento reduzido.</Typography></Box>}/>
      </Stack>
    </CardContent></Card>
    <Stack direction="row" justifyContent="flex-end"><Button variant="contained" size="large" onClick={save} disabled={saving}>{saving?'Salvando...':'Aplicar para todos'}</Button></Stack>
    <Typography variant="body2" color="text.secondary">O layout fica salvo no MySQL e é atualizado periodicamente para usuários conectados. A troca é registrada no Audit Log.</Typography>
  </Stack>;
}
