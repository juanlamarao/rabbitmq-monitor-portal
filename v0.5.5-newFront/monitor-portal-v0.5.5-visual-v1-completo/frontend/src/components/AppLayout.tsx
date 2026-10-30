import {
  AccountTree, AdminPanelSettings, Assessment, Dashboard as DashboardIcon,
  ExpandLess, ExpandMore, FactCheck, Groups, Home, Logout, ManageHistory,
  Menu as MenuIcon, PlaylistAddCheck, Queue as QueueIcon, Rule, Settings, SyncAlt,
  Palette, Business,
} from '@mui/icons-material';
import {
  AppBar, Avatar, Box, Collapse, Divider, Drawer, IconButton, List, ListItemButton,
  ListItemIcon, ListItemText, Stack, Toolbar, Tooltip, Typography, useMediaQuery,
} from '@mui/material';
import { ReactNode, useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { PortalSession } from '../services/auth';
import { useAppearance } from '../services/appearance';
import { BtgLogo, PortalBrand } from './BrandIdentity';

interface AppLayoutProps { children: ReactNode; session:PortalSession; onLogout:()=>void }
const expandedWidth=246, collapsedWidth=72;
const general=[
  {label:'Dashboard',path:'/dashboard',icon:<DashboardIcon/>},
  {label:'Clusters',path:'/clusters',icon:<AccountTree/>},
  {label:'Queues',path:'/queues',icon:<QueueIcon/>},
  {label:'Audit Logs',path:'/audit-logs',icon:<FactCheck/>},
];
const adminGeneral=[
  {label:'Templates',path:'/templates',icon:<Rule/>},
  {label:'Edição em massa',path:'/bulk-actions',icon:<PlaylistAddCheck/>},
  {label:'Relatórios',path:'/reports',icon:<Assessment/>},
];
const adminLinks=[
  {label:'Permissões de Acesso',path:'/admin/access',icon:<AdminPanelSettings/>},
  {label:'Grupos SRE',path:'/admin/sre-groups',icon:<Groups/>},
  {label:'Datadog Orgs',path:'/admin/datadog-orgs',icon:<Business/>},
  {label:'Jobs',path:'/admin/jobs',icon:<ManageHistory/>},
  {label:'Datadog Sync',path:'/admin/datadog-sync',icon:<SyncAlt/>},
  {label:'Aparência',path:'/admin/appearance',icon:<Palette/>},
];

export default function AppLayout({children,session,onLogout}:AppLayoutProps){
  const {appearance}=useAppearance();
  const workspace=appearance.layout==='workspace';
  const location=useLocation();
  const small=useMediaQuery('(max-width:750px)');
  const [expanded,setExpanded]=useState(!small);
  const [adminOpen,setAdminOpen]=useState(false);
  useEffect(()=>{if(small)setExpanded(false)},[small]);
  const isAdminRoute=location.pathname.startsWith('/admin');
  const background=workspace?'#082B5D':'#FFFFFF';
  const text=workspace?'#CBDAEF':'#61758E';
  const width=expanded?expandedWidth:collapsedWidth;
  const displayName=session.name || session.email || 'Usuário';
  const initials=displayName.split(' ').filter(Boolean).slice(0,2).map(x=>x[0].toUpperCase()).join('');

  function nav(entry:{label:string;path:string;icon:React.ReactNode}, indent=false){
    const target=entry.path==='/'?'/':entry.path;
    const isActive=location.pathname===target || (target!=='/' && location.pathname.startsWith(target+'/'));
    return <Tooltip key={entry.path} title={expanded?'':entry.label} placement="right">
      <ListItemButton component={NavLink} to={entry.path} end={entry.path==='/' || entry.path==='/dashboard'}
        onClick={()=>{if(!entry.path.startsWith('/admin'))setAdminOpen(false)}}
        sx={{minHeight:41,borderRadius:2,mb:.35,pl:expanded?(indent?2.4:1.5):1.5,
          justifyContent:expanded?'flex-start':'center',color:workspace?'#C0D3EA':'#5E738E',
          backgroundColor:isActive?(workspace?'rgba(255,255,255,.14)':'#EAF3FF'):'transparent',
          '&.active':{backgroundColor:workspace?'rgba(255,255,255,.14)':'#EAF3FF',color:workspace?'#fff':'#0756AE',fontWeight:750},
          '&:hover':{backgroundColor:workspace?'rgba(255,255,255,.09)':'#F1F6FF'},
          '& .MuiListItemIcon-root':{color:'inherit'},fontWeight:isActive?700:500,
        }}>
        <ListItemIcon sx={{minWidth:expanded?39:0,'& svg':{fontSize:19}}}>{entry.icon}</ListItemIcon>
        {expanded && <ListItemText primary={entry.label} primaryTypographyProps={{fontSize:13,fontWeight:isActive?700:500}}/>}
      </ListItemButton>
    </Tooltip>;
  }
  return <Box sx={{minHeight:'100vh',display:'flex',bgcolor:'#F5F8FC'}}>
    <Drawer variant="permanent" sx={{width,flexShrink:0,'& .MuiDrawer-paper':{width,overflowX:'hidden',boxSizing:'border-box',
      bgcolor:background,borderRight:workspace?'none':'1px solid #E3EAF3',transition:'width .2s ease'}}}>
      <Box sx={{minHeight:77,px:expanded?2:1,display:'flex',alignItems:'center',gap:1}}>
        <Tooltip title="Recolher / expandir menu"><IconButton onClick={()=>setExpanded(v=>!v)} size="small" sx={{color:text}}><MenuIcon fontSize="small"/></IconButton></Tooltip>
        {expanded && <PortalBrand dark={workspace}/>}
      </Box>
      <Divider sx={{borderColor:workspace?'rgba(255,255,255,.12)':'#E8EEF5'}}/>
      <List sx={{px:1.3,pt:2}}>
        {workspace && nav({label:'Início',path:'/',icon:<Home/>})}
        {general.map(entry=>nav({...entry,path:entry.path==='/dashboard'&&!workspace?'/':entry.path}))}
        {session.is_admin && <>
          {expanded && <Typography sx={{fontSize:10,fontWeight:800,letterSpacing:1.3,color:workspace?'#8EABCC':'#96A6BB',px:1.5,pt:2.2,pb:1}}>GESTÃO</Typography>}
          {adminGeneral.map(entry=>nav(entry))}
          <ListItemButton onClick={()=>{if(!expanded)setExpanded(true);setAdminOpen(v=>!v)}}
            sx={{minHeight:41,borderRadius:2,justifyContent:expanded?'flex-start':'center',color:isAdminRoute?(workspace?'#fff':'#0756AE'):text,
              backgroundColor:isAdminRoute?(workspace?'rgba(255,255,255,.14)':'#EAF3FF'):'transparent',mt:.5,'& .MuiListItemIcon-root':{color:'inherit'},'&:hover':{backgroundColor:workspace?'rgba(255,255,255,.09)':'#F1F6FF'}}}>
            <ListItemIcon sx={{minWidth:expanded?39:0}}><Settings sx={{fontSize:19}}/></ListItemIcon>
            {expanded && <ListItemText primary="Administração" primaryTypographyProps={{fontSize:13,fontWeight:700}}/>}
            {expanded && (adminOpen||isAdminRoute?<ExpandLess fontSize="small"/>:<ExpandMore fontSize="small"/>)}
          </ListItemButton>
          <Collapse in={expanded&&(adminOpen||isAdminRoute)} unmountOnExit>
            <List disablePadding>{adminLinks.map(entry=>nav(entry,true))}</List>
          </Collapse>
        </>}
      </List>
      <Box sx={{mt:'auto',p:1.5}}>
        <Box sx={{display:'flex',gap:1.2,alignItems:'center',p:expanded?1.1:.7,borderRadius:2,borderTop:'1px solid',borderColor:workspace?'rgba(255,255,255,.15)':'#EDF1F7'}}>
          <Avatar sx={{width:31,height:31,bgcolor:'#DDEAFB',color:'#17569B',fontSize:11,fontWeight:800}}>{initials||'U'}</Avatar>
          {expanded && <Box sx={{minWidth:0}}><Typography sx={{fontSize:12,fontWeight:750,color:workspace?'#fff':'#233955'}} noWrap>{displayName}</Typography>
            <Typography sx={{fontSize:10,color:workspace?'#A9BFD9':'#92A0B2'}}>{session.is_admin?'Administrador':'Visualização / Edição'}</Typography></Box>}
        </Box>
      </Box>
    </Drawer>
    <Box sx={{flex:1,minWidth:0,display:'flex',flexDirection:'column'}}>
      <AppBar position="sticky" elevation={0} sx={{bgcolor:'#fff',borderBottom:'1px solid #E5EDF5',color:'#14345B'}}>
        <Toolbar sx={{minHeight:'63px!important',justifyContent:'space-between',gap:2}}>
          <Box sx={{fontSize:13,fontWeight:720,color:'#244B7A'}}>
            {workspace?'Workspace':'Visão geral'} <Box component="span" sx={{color:'#ABB9C9'}}> / {location.pathname==='/'?'Início':(location.pathname.split('/').filter(Boolean).slice(-1)[0]||'Dashboard')}</Box>
          </Box>
          <Stack direction="row" alignItems="center" spacing={1.4}>
            <BtgLogo compact/>
            <Divider orientation="vertical" flexItem sx={{borderColor:'#ECF0F5'}}/>
            <Tooltip title="Encerrar sessão"><IconButton onClick={onLogout} size="small" sx={{color:'#617794'}}><Logout fontSize="small"/></IconButton></Tooltip>
          </Stack>
        </Toolbar>
      </AppBar>
      <Box component="main" sx={{p:{xs:2,md:3},flex:1,maxWidth:1700,width:'100%',mx:'auto'}}>{children}</Box>
      <Typography component="footer" sx={{textAlign:'center',fontSize:10,letterSpacing:1.5,color:'#9DABC0',pb:2.3,pt:1}}>OBSERVABILITY PLATFORM</Typography>
    </Box>
  </Box>;
}
