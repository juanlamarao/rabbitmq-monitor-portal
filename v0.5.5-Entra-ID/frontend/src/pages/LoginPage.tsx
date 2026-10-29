import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import { FormEvent, useState } from 'react';
import { API_BASE_URL } from '../services/api';

export default function LoginPage({ onLogin }: { onLogin: () => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [localOpen, setLocalOpen] = useState(false);
  async function submitLocal(e: FormEvent) {
    e.preventDefault(); setError('');
    try {
      const r = await fetch(`${API_BASE_URL}/auth/local/login`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
      if (!r.ok) throw new Error(r.status===429?'Muitas tentativas. Tente mais tarde.':'Credenciais inválidas ou acesso local indisponível.');
      await onLogin();
    } catch (err) { setError(err instanceof Error ? err.message : 'Falha no login'); }
  }
  return <Box sx={{minHeight:'90vh',display:'grid',placeItems:'center',p:2}}><Card sx={{maxWidth:430,width:'100%'}}><CardContent>
    <Stack spacing={3}>
      <Typography variant="h5" fontWeight={800}>RabbitMQ Monitor Portal</Typography>
      <Typography color="text.secondary">Acesso restrito — autenticação corporativa</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <Button variant="contained" size="large" onClick={()=>{window.location.href=`${API_BASE_URL}/auth/login`;}}>Entrar com Microsoft Entra ID</Button>
      <Button variant="text" onClick={()=>setLocalOpen(v=>!v)}>Acesso administrativo de emergência</Button>
      {localOpen && <Box component="form" onSubmit={submitLocal}><Stack spacing={2}>
        <TextField type="password" label="Senha de emergência" value={password} onChange={e=>setPassword(e.target.value)} required fullWidth autoComplete="current-password"/>
        <Button type="submit" variant="outlined">Entrar como administrador local</Button>
      </Stack></Box>}
    </Stack>
  </CardContent></Card></Box>;
}
