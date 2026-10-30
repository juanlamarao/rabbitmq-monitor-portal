import { Alert, Box, Button, Card, CardContent, Collapse, Divider, Link, Stack, TextField, Typography } from '@mui/material';
import { FormEvent, useState } from 'react';
import { API_BASE_URL } from '../services/api';
import { BtgLogo, RMark } from '../components/BrandIdentity';
import ParticlesBackground from '../components/ParticlesBackground';

export default function LoginPage({ onLogin }: { onLogin: () => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [localOpen, setLocalOpen] = useState(false);
  const [submitting,setSubmitting] = useState(false);

  async function submitLocal(e: FormEvent) {
    e.preventDefault(); setError('');setSubmitting(true);
    try {
      const r = await fetch(`${API_BASE_URL}/auth/local/login`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
      if (!r.ok) throw new Error(r.status===429?'Muitas tentativas. Tente mais tarde.':'Senha inválida ou login local indisponível.');
      await onLogin();
    } catch (err) { setError(err instanceof Error ? err.message : 'Falha no login'); }
    finally {setSubmitting(false);}
  }

  return <Box sx={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
    position:'relative',overflow:'hidden',p:3,background:'radial-gradient(ellipse at 9% 88%, #DCEBFF 0%, transparent 47%), radial-gradient(ellipse at 92% 10%, #D1E3FB 0%, transparent 43%), #F6F9FD'}}>
    <ParticlesBackground/>
    <Card sx={{zIndex:1,width:'100%',maxWidth:410,borderRadius:'18px',border:'1px solid #E4ECF6',boxShadow:'0 22px 72px rgba(12,43,91,0.12)'}}>
      <CardContent sx={{p:{xs:3.5,md:4.5},'&:last-child':{pb:{xs:3.5,md:4.5}}}}>
        <Stack alignItems="center" spacing={1.2}>
          <Box sx={{alignSelf:'center',display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',mb:2.5}}>
            <BtgLogo/>
            <RMark size={43}/>
          </Box>
          <Typography variant="h5" sx={{fontSize:22,fontWeight:800,color:'#112C52',textAlign:'center'}}>Monitor Portal</Typography>
          <Typography sx={{fontSize:13,color:'#7B8DA5',textAlign:'center',lineHeight:1.7,pb:2.8}}>
            Acesse sua plataforma de gestão de monitores com sua conta corporativa.
          </Typography>
          {error && <Alert severity="error" sx={{width:'100%'}}>{error}</Alert>}
          <Button variant="contained" size="large" fullWidth onClick={()=>{window.location.href=`${API_BASE_URL}/auth/login`;}}
            startIcon={<Box sx={{display:'grid',gridTemplateColumns:'repeat(2,8px)',gap:'2px'}}>
              {['#f25022','#7fba00','#00a4ef','#ffb900'].map(c=><Box key={c} sx={{bgcolor:c,width:8,height:8}}/>)}</Box>}
            sx={{height:50,textTransform:'none',fontWeight:700,fontSize:14,boxShadow:'none'}}>
            Entrar com SSO
          </Button>
          <Divider flexItem sx={{pt:2.8}}/>
          <Typography sx={{fontSize:11,color:'#A1B0C1',pt:.5}}>Acesso restrito ·{' '}
            <Link component="button" type="button" underline="hover" onClick={()=>{setLocalOpen(v=>!v);setError('');}}
              sx={{fontSize:11,fontWeight:600,color:'#8DA0B9',verticalAlign:'baseline'}}>admin</Link>
          </Typography>
        </Stack>
        <Collapse in={localOpen} unmountOnExit>
          <Box component="form" onSubmit={submitLocal} sx={{mt:2.4}}>
            <Stack spacing={1.5}>
              <TextField size="small" type="password" label="Senha" value={password} onChange={e=>setPassword(e.target.value)} required fullWidth autoComplete="current-password" />
              <Button type="submit" variant="outlined" disabled={submitting}>{submitting?'Autenticando...':'Entrar'}</Button>
            </Stack>
          </Box>
        </Collapse>
      </CardContent>
    </Card>
    <Typography sx={{zIndex:1,position:'absolute',bottom:20,color:'#92A5BC',fontSize:11,letterSpacing:'.05em'}}>Observability Platform</Typography>
  </Box>;
}
