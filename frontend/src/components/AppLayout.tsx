import {
  AccountTree,
  Assessment,
  Brightness4,
  Brightness7,
  Dashboard,
  ExpandLess,
  ExpandMore,
  FactCheck,
  Groups,
  Menu as MenuIcon,
  Queue as QueueIcon,
  Rule,
  Settings,
} from '@mui/icons-material';
import {
  AppBar,
  Box,
  Collapse,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import { ReactNode, useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

interface AppLayoutProps {
  children: ReactNode;
  mode: 'light' | 'dark';
  onToggleMode: () => void;
}

const collapsedWidth = 72;
const expandedWidth = 256;

const navItems = [
  { label: 'Dashboard', path: '/', icon: <Dashboard /> },
  { label: 'Clusters', path: '/clusters', icon: <AccountTree /> },
  { label: 'Queues', path: '/queues', icon: <QueueIcon /> },
  { label: 'Templates', path: '/templates', icon: <Rule /> },
  { label: 'Reports', path: '/reports', icon: <Assessment /> },
  { label: 'Audit Log', path: '/audit-logs', icon: <FactCheck /> },
];

const adminItems = [
  { label: 'Grupos SRE', path: '/admin/sre-groups', icon: <Groups /> },
  { label: 'Datadog Orgs', path: '/admin/datadog-orgs', icon: <FactCheck /> },
];

export default function AppLayout({ children, mode, onToggleMode }: AppLayoutProps) {
  const [expanded, setExpanded] = useState(true);
  const [adminOpen, setAdminOpen] = useState(false);
  const theme = useTheme();
  const location = useLocation();
  const drawerWidth = expanded ? expandedWidth : collapsedWidth;
  const isAdminRoute = location.pathname.startsWith('/admin');

  useEffect(() => {
    if (!isAdminRoute) {
      setAdminOpen(false);
    }
  }, [isAdminRoute]);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            overflowX: 'hidden',
            transition: theme.transitions.create('width'),
          },
        }}
      >
        <Toolbar sx={{ gap: 1, justifyContent: expanded ? 'flex-start' : 'center' }}>
          <IconButton onClick={() => setExpanded((value) => !value)}>
            <MenuIcon />
          </IconButton>
          {expanded && (
            <Box>
              <Typography fontWeight={800} lineHeight={1.1}>
                RabbitMQ
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Monitor Portal
              </Typography>
            </Box>
          )}
        </Toolbar>
        <Divider />
        <List sx={{ px: 1 }}>
          {navItems.map((item) => (
            <Tooltip key={item.path} title={expanded ? '' : item.label} placement="right">
              <ListItemButton
                component={NavLink}
                to={item.path}
                end={item.path === '/'}
                onClick={() => setAdminOpen(false)}
                sx={{
                  borderRadius: 2,
                  mb: 0.5,
                  justifyContent: expanded ? 'flex-start' : 'center',
                  '&.active': {
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                    '& .MuiListItemIcon-root': { color: 'inherit' },
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: expanded ? 42 : 'auto' }}>{item.icon}</ListItemIcon>
                {expanded && <ListItemText primary={item.label} />}
              </ListItemButton>
            </Tooltip>
          ))}

          <Tooltip title={expanded ? '' : 'Administração'} placement="right">
            <ListItemButton
              component={NavLink}
              to="/admin"
              onClick={() => setAdminOpen((value) => !value)}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                justifyContent: expanded ? 'flex-start' : 'center',
                '&.active': {
                  bgcolor: isAdminRoute ? 'primary.main' : undefined,
                  color: isAdminRoute ? 'primary.contrastText' : undefined,
                  '& .MuiListItemIcon-root': { color: 'inherit' },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: expanded ? 42 : 'auto' }}>
                <Settings />
              </ListItemIcon>
              {expanded && <ListItemText primary="Administração" />}
              {expanded && (adminOpen || isAdminRoute ? <ExpandLess /> : <ExpandMore />)}
            </ListItemButton>
          </Tooltip>

          <Collapse in={expanded && (adminOpen || isAdminRoute)} timeout="auto" unmountOnExit>
            <List disablePadding sx={{ pl: 2 }}>
              {adminItems.map((item) => (
                <ListItemButton
                  key={item.path}
                  component={NavLink}
                  to={item.path}
                  sx={{
                    borderRadius: 2,
                    mb: 0.5,
                    pl: 2.5,
                    '&.active': {
                      bgcolor: 'primary.main',
                      color: 'primary.contrastText',
                      '& .MuiListItemIcon-root': { color: 'inherit' },
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.label} />
                </ListItemButton>
              ))}
            </List>
          </Collapse>
        </List>
      </Drawer>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <AppBar position="sticky" color="transparent" elevation={0} sx={{ backdropFilter: 'blur(8px)' }}>
          <Toolbar sx={{ justifyContent: 'space-between' }}>
            <Typography variant="h6" fontWeight={700}>
              Gestão de Monitores RabbitMQ
            </Typography>
            <Tooltip title={mode === 'dark' ? 'Usar modo light' : 'Usar modo dark'}>
              <IconButton onClick={onToggleMode}>{mode === 'dark' ? <Brightness7 /> : <Brightness4 />}</IconButton>
            </Tooltip>
          </Toolbar>
        </AppBar>
        <Box component="main" sx={{ p: { xs: 2, md: 3 } }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
