import Grid from '../components/PortalGrid';
import { AccountTree, AdminPanelSettings, Assessment, Dashboard, FactCheck, Queue as QueueIcon, Rule } from '@mui/icons-material';
import { Box, Card, CardActionArea, CardContent, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../services/authContext';

export default function WorkspaceHomePage(){
  const navigate=useNavigate();
  const session=useAuth();
  const modules=[
    {name:'Dashboard',desc:'Indicadores e visão geral da operação.',path:'/dashboard',icon:<Dashboard/>},
    {name:'Clusters',desc:'Conexões e grupos RabbitMQ.',path:'/clusters',icon:<AccountTree/>},
    {name:'Queues',desc:'Filas, responsáveis e monitores.',path:'/queues',icon:<QueueIcon/>},
    {name:'Audit Logs',desc:'Histórico de atividades e alterações.',path:'/audit-logs',icon:<FactCheck/>},
    ...(session.is_admin?[
      {name:'Templates',desc:'Catálogo e políticas de monitoramento.',path:'/templates',icon:<Rule/>},
      {name:'Administração',desc:'Permissões, integrações e aparência.',path:'/admin',icon:<AdminPanelSettings/>},
      {name:'Relatórios',desc:'Informações operacionais e exportações.',path:'/reports',icon:<Assessment/>},
    ]:[]),
  ];
  return <Box>
    <Box sx={{borderRadius:3,background:'linear-gradient(110deg,#082B5D,#0758AB)',p:{xs:3,md:4},mb:3,color:'#fff',position:'relative',overflow:'hidden',
      '&:after':{content:'""',position:'absolute',right:-35,top:-125,width:280,height:280,borderRadius:'50%',border:'50px solid rgba(255,255,255,.055)'}}}>
      <Typography sx={{fontSize:11,letterSpacing:1.8,color:'#BBD8F8',mb:1}}>OBSERVABILITY / WORKSPACE</Typography>
      <Typography variant="h4" fontWeight={800} sx={{color:'#fff',fontSize:{xs:24,md:30}}}>Bem-vindo ao seu Workspace</Typography>
      <Typography sx={{color:'#D5E5F9',mt:1,maxWidth:650}}>Gerencie clusters, filas e monitores em uma única plataforma.</Typography>
    </Box>
    <Typography variant="h6" fontWeight={800} sx={{mb:2}}>Áreas de trabalho</Typography>
    <Grid container spacing={2}>
      {modules.map(m=><Grid item xs={12} sm={6} md={4} key={m.path}>
        <Card sx={{height:'100%'}}><CardActionArea onClick={()=>navigate(m.path)} sx={{height:'100%',p:1}}><CardContent>
          <Box sx={{width:44,height:44,display:'grid',placeItems:'center',bgcolor:'#EAF3FF',color:'#0756AE',borderRadius:2,mb:2}}>{m.icon}</Box>
          <Typography fontWeight={800}>{m.name}</Typography><Typography variant="body2" color="text.secondary" sx={{mt:.5}}>{m.desc}</Typography>
        </CardContent></CardActionArea></Card>
      </Grid>)}
    </Grid>
  </Box>;
}
