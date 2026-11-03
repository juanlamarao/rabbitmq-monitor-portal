import {
  AccountTree, Assessment, Dashboard as DashboardIcon,
  ExpandLess, ExpandMore, FactCheck, Home, Logout,
  Menu as MenuIcon, PlaylistAddCheck, Queue as QueueIcon, Rule, Settings,
} from '@mui/icons-material';
import {
  AppBar, Avatar, Box, ButtonBase, Chip, Collapse, Divider, Drawer,
  List, ListItemButton, ListItemIcon, ListItemText, Menu, MenuItem,
  Toolbar, Tooltip, Typography, useMediaQuery,
} from '@mui/material';
import { ReactNode, useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { PortalSession } from '../services/auth';
import { adminLinks } from './adminNavigation';
import { useAppearance } from '../services/appearance';

interface AppLayoutProps { children: ReactNode; session: PortalSession; onLogout: () => void }

const expandedWidth = 246;
const collapsedWidth = 64;

const general = [
  { label: 'Dashboard', path: '/dashboard', icon: <DashboardIcon /> },
  { label: 'Clusters', path: '/clusters', icon: <AccountTree /> },
  { label: 'Queues', path: '/queues', icon: <QueueIcon /> },
  { label: 'Audit Logs', path: '/audit-logs', icon: <FactCheck /> },
];
const adminGeneral = [
  { label: 'Templates', path: '/templates', icon: <Rule /> },
  { label: 'Edição em massa', path: '/bulk-actions', icon: <PlaylistAddCheck /> },
  { label: 'Relatórios', path: '/reports', icon: <Assessment /> },
];
export default function AppLayout({ children, session, onLogout }: AppLayoutProps) {
  const { appearance } = useAppearance();
  const workspace = appearance.layout === 'workspace';
  const location = useLocation();
  const navigate = useNavigate();
  const small = useMediaQuery('(max-width:750px)');
  const [expanded, setExpanded] = useState(!small);
  const [adminOpen, setAdminOpen] = useState(location.pathname.startsWith('/admin'));
  const [userMenuAnchor, setUserMenuAnchor] = useState<HTMLElement | null>(null);

  useEffect(() => { if (small) setExpanded(false); }, [small]);
  useEffect(() => {
    if (location.pathname.startsWith('/admin')) setAdminOpen(true);
  }, [location.pathname]);

  const isAdminRoute = location.pathname === '/admin' || location.pathname.startsWith('/admin/');
  const background = workspace ? '#082B5D' : '#FFFFFF';
  const navText = workspace ? '#CBDAEF' : '#61758E';
  const width = expanded ? expandedWidth : collapsedWidth;
  const displayName = session.name?.trim() || session.email?.trim() || 'Usuário';
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join('');
  const role = session.is_admin ? 'Admin' : session.edit_cluster_ids.length ? 'Editor' : 'Viewer';
  const avatarUrl = session.avatar_url || undefined; // Possibilita usar a foto do Entra/LDAP futuramente.

  const navSx = {
    minHeight: 42,
    borderRadius: 2,
    mb: .35,
    px: expanded ? 1.5 : 0,
    justifyContent: expanded ? 'flex-start' : 'center',
    transition: 'background-color .15s ease',
  } as const;

  function nav(entry: { label: string; path: string; icon: React.ReactNode }, indent = false) {
    const active = location.pathname === entry.path ||
      (entry.path !== '/' && entry.path !== '/admin' && location.pathname.startsWith(entry.path + '/'));
    const link = <ListItemButton
      key={entry.path}
      component={NavLink}
      to={entry.path}
      end={entry.path === '/' || entry.path === '/dashboard' || entry.path === '/admin'}
      onClick={() => { if (!entry.path.startsWith('/admin')) setAdminOpen(false); }}
      sx={{
        ...navSx,
        ...(expanded && indent ? { pl: 2.4 } : {}),
        color: active ? (workspace ? '#FFFFFF' : '#0756AE') : (workspace ? '#C0D3EA' : '#5E738E'),
        backgroundColor: active ? (workspace ? 'rgba(255,255,255,.14)' : '#EAF3FF') : 'transparent',
        '&.active': {
          backgroundColor: workspace ? 'rgba(255,255,255,.14)' : '#EAF3FF',
          color: workspace ? '#FFFFFF' : '#0756AE',
          fontWeight: 750,
        },
        '&:hover': { backgroundColor: workspace ? 'rgba(255,255,255,.09)' : '#F1F6FF' },
        '& .MuiListItemIcon-root': { color: 'inherit' },
        fontWeight: active ? 700 : 500,
      }}
    >
      <ListItemIcon sx={{ minWidth: expanded ? 39 : 0, justifyContent: 'center', '& svg': { fontSize: 19 } }}>
        {entry.icon}
      </ListItemIcon>
      {expanded && <ListItemText primary={entry.label} primaryTypographyProps={{ fontSize: 13, fontWeight: active ? 700 : 500 }} />}
    </ListItemButton>;
    return <Tooltip key={entry.path} title={expanded ? '' : entry.label} placement="right">{link}</Tooltip>;
  }

  function openAdmin() {
    // A entrada principal abre a tela administrativa, além de expandir o submenu.
    // Se o menu lateral estiver fechado, abre-o apenas ao clicar, nunca ao passar o mouse.
    if (!expanded) {
      setExpanded(true);
      setAdminOpen(true);
    } else if (location.pathname === '/admin') {
      setAdminOpen(current => !current);
    } else {
      setAdminOpen(true);
    }
    navigate('/admin');
  }

  return <Box sx={{ minHeight: '100vh', display: 'flex', bgcolor: '#F5F8FC' }}>
    <Drawer variant="permanent" sx={{
      width, flexShrink: 0, transition: 'width .2s ease',
      '& .MuiDrawer-paper': {
        width, overflowX: 'hidden', boxSizing: 'border-box', bgcolor: background,
        borderRight: workspace ? 'none' : '1px solid #E3EAF3', transition: 'width .2s ease',
      },
    }}>
      <Box sx={{ px: 1.25, pt: 1.25, pb: 1 }}>
        <Tooltip title={expanded ? 'Recolher menu' : 'Expandir menu'} placement="right">
          <ListItemButton
            aria-label={expanded ? 'Recolher menu lateral' : 'Expandir menu lateral'}
            onClick={() => setExpanded(value => !value)}
            sx={{ ...navSx, mb: 0, color: navText, '&:hover': { backgroundColor: workspace ? 'rgba(255,255,255,.09)' : '#F1F6FF' } }}
          >
            <ListItemIcon sx={{ minWidth: expanded ? 39 : 0, justifyContent: 'center', color: 'inherit' }}>
              <MenuIcon sx={{ fontSize: 19 }} />
            </ListItemIcon>
            {expanded && <Typography sx={{ fontSize: 15, fontWeight: 800, whiteSpace: 'nowrap', color: workspace ? '#FFFFFF' : '#122E54' }}>
              Monitor Portal
            </Typography>}
          </ListItemButton>
        </Tooltip>
      </Box>
      <Divider sx={{ borderColor: workspace ? 'rgba(255,255,255,.12)' : '#E8EEF5' }} />
      <List sx={{ px: 1.25, pt: 1.5 }}>
        {workspace && nav({ label: 'Início', path: '/', icon: <Home /> })}
        {general.map(entry => nav({ ...entry, path: entry.path === '/dashboard' && !workspace ? '/' : entry.path }))}
        {session.is_admin && <>
          {expanded && <Typography sx={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.3, color: workspace ? '#8EABCC' : '#96A6BB', px: 1.5, pt: 2.2, pb: 1 }}>GESTÃO</Typography>}
          {adminGeneral.map(entry => nav(entry))}
          <Tooltip title={expanded ? '' : 'Administração'} placement="right">
            <ListItemButton
              onClick={openAdmin}
              selected={isAdminRoute}
              sx={{
                ...navSx, mt: .5,
                color: isAdminRoute ? (workspace ? '#FFFFFF' : '#0756AE') : navText,
                backgroundColor: isAdminRoute ? (workspace ? 'rgba(255,255,255,.14)' : '#EAF3FF') : 'transparent',
                '& .MuiListItemIcon-root': { color: 'inherit' },
                '&:hover': { backgroundColor: workspace ? 'rgba(255,255,255,.09)' : '#F1F6FF' },
                '&.Mui-selected': { backgroundColor: workspace ? 'rgba(255,255,255,.14)' : '#EAF3FF' },
                '&.Mui-selected:hover': { backgroundColor: workspace ? 'rgba(255,255,255,.18)' : '#E0EEFF' },
              }}
            >
              <ListItemIcon sx={{ minWidth: expanded ? 39 : 0, justifyContent: 'center' }}><Settings sx={{ fontSize: 19 }} /></ListItemIcon>
              {expanded && <ListItemText primary="Administração" primaryTypographyProps={{ fontSize: 13, fontWeight: 700 }} />}
              {expanded && (adminOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />)}
            </ListItemButton>
          </Tooltip>
          <Collapse in={expanded && adminOpen} unmountOnExit>
            <List disablePadding>{adminLinks.map(entry => nav(entry, true))}</List>
          </Collapse>
        </>}
      </List>
    </Drawer>
    <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: '#FFFFFF', borderBottom: '1px solid #E5EDF5', color: '#14345B' }}>
        <Toolbar sx={{ minHeight: '63px!important', justifyContent: 'space-between', gap: 2 }}>
          <Box sx={{ fontSize: 13, fontWeight: 720, color: '#244B7A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {workspace ? 'Workspace' : 'Visão geral'}
            <Box component="span" sx={{ color: '#ABB9C9' }}> / {location.pathname === '/' ? 'Início' : (location.pathname.split('/').filter(Boolean).slice(-1)[0] || 'Dashboard')}</Box>
          </Box>
          <ButtonBase
            onClick={event => setUserMenuAnchor(event.currentTarget)}
            aria-haspopup="menu"
            aria-expanded={Boolean(userMenuAnchor)}
            aria-controls={userMenuAnchor ? 'monitor-portal-user-menu' : undefined}
            sx={{ display: 'flex', alignItems: 'center', gap: 1.3, py: .6, px: 1, borderRadius: 2, minWidth: 0, flexShrink: 0, '&:hover': { bgcolor: '#F3F7FD' } }}
          >
            <Avatar src={avatarUrl} alt={displayName} sx={{ width: 35, height: 35, bgcolor: '#DDEAFB', color: '#17569B', fontSize: 12, fontWeight: 800 }}>
              {initials || 'U'}
            </Avatar>
            <Box sx={{ textAlign: 'left', display: { xs: 'none', sm: 'block' }, maxWidth: { sm: 145, md: 230 }, minWidth: 0 }}>
              <Typography noWrap sx={{ fontSize: 13, fontWeight: 750, color: '#192B44', lineHeight: 1.35 }}>{displayName}</Typography>
              <Typography sx={{ fontSize: 11, fontWeight: 400, color: '#8191A6', lineHeight: 1.35 }}>{role}</Typography>
            </Box>
          </ButtonBase>
          <Menu
            id="monitor-portal-user-menu"
            anchorEl={userMenuAnchor}
            open={Boolean(userMenuAnchor)}
            onClose={() => setUserMenuAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{ paper: { sx: { width: 250, mt: 1, border: '1px solid #E7EDF5', boxShadow: '0 12px 35px rgba(8,43,93,.12)', borderRadius: 2.5 } } }}
            MenuListProps={{ 'aria-label': 'Menu do usuário' }}
          >
            <Box sx={{ px: 2.3, pt: 2, pb: 1.6, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Avatar src={avatarUrl} alt={displayName} sx={{ width: 43, height: 43, mb: 1, bgcolor: '#DDEAFB', color: '#17569B', fontSize: 14, fontWeight: 800 }}>
                {initials || 'U'}
              </Avatar>
              <Typography align="center" sx={{ fontSize: 14, color: '#1A3254', fontWeight: 750, maxWidth: '100%', overflowWrap: 'anywhere' }}>
                {displayName}
              </Typography>
              <Chip label={role} size="small" sx={{ mt: 1, fontSize: 11, fontWeight: 600, color: '#17569B', bgcolor: '#EAF3FF', height: 24 }} />
            </Box>
            <Divider sx={{ borderColor: '#EDF1F6', mx: 1.5, mb: .5 }} />
            <MenuItem onClick={() => { setUserMenuAnchor(null); onLogout(); }} sx={{ mx: 1, my: .6, px: 1.5, py: 1.2, borderRadius: 1.5, gap: 1.3, color: '#354C69', fontSize: 13 }}>
              <Logout sx={{ fontSize: 19, color: '#617A99' }} /> Sign Out
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
      <Box component="main" sx={{ p: { xs: 2, md: 3 }, flex: 1, maxWidth: 1700, width: '100%', boxSizing: 'border-box', mx: 'auto' }}>{children}</Box>
      <Typography component="footer" sx={{ textAlign: 'center', fontSize: 10, letterSpacing: 1.5, color: '#9DABC0', pb: 2.3, pt: 1 }}>OBSERVABILITY PLATFORM</Typography>
    </Box>
  </Box>;
}
