import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo, useState, useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import AdminPage from './pages/AdminPage';
import AuditLogPage from './pages/AuditLogPage';
import BulkActionsPage from './pages/BulkActionsPage';
import ClusterFormPage from './pages/ClusterFormPage';
import ClustersPage from './pages/ClustersPage';
import DashboardPage from './pages/DashboardPage';
import QueuesPage from './pages/QueuesPage';
import ReportsPage from './pages/ReportsPage';
import SREGroupsPage from './pages/SREGroupsPage';
import DatadogOrgsPage from './pages/DatadogOrgsPage';
import DatadogSyncPage from './pages/DatadogSyncPage';
import TemplatesPage from './pages/TemplatesPage';
import JobsPage from './pages/JobsPage';
import PublicQueueReferencePage from './pages/PublicQueueReferencePage';
import AccessGroupsPage from './pages/AccessGroupsPage';
import LoginPage from './pages/LoginPage';
import { loadSession, PortalSession } from './services/auth';
import { CircularProgress, Box, Alert } from '@mui/material';
import { Navigate } from 'react-router-dom';
import { apiRequest } from './services/api';
import { AuthContext } from './services/authContext';

const queryClient = new QueryClient();

export default function App() {
  const [mode, setMode] = useState<'light' | 'dark'>('dark');
  const [session,setSession]=useState<PortalSession|null>(null);
  const [loading,setLoading]=useState(true);
  const [authError,setAuthError]=useState('');
  async function reloadSession(){try {setSession(await loadSession());setAuthError('');} catch(e){setAuthError(String(e));}finally{setLoading(false);}}
  useEffect(()=>{reloadSession();const listener=()=>{queryClient.clear();setSession(null);};window.addEventListener('rmp:session-expired',listener);return ()=>window.removeEventListener('rmp:session-expired',listener);},[]);
  const admin=Boolean(session?.is_admin);
  const protectedPage=(element:React.ReactNode)=>admin?element:<Navigate to="/" replace/>;
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: { main: '#f97316' },
          background: {
            default: mode === 'dark' ? '#0f172a' : '#f5f7fb',
            paper: mode === 'dark' ? '#111827' : '#ffffff',
          },
        },
        shape: { borderRadius: 12 },
        components: {
          MuiPaper: {
            styleOverrides: {
              root: { backgroundImage: 'none' },
            },
          },
        },
      }),
    [mode],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          <Routes>
            <Route path="/public/queue-reference" element={<PublicQueueReferencePage />} />
            <Route path="/login" element={session?<Navigate to="/" replace/>:<LoginPage onLogin={reloadSession}/>} />
            <Route
              path="*"
              element={
                loading ? <Box sx={{display:'grid',placeItems:'center',height:'90vh'}}><CircularProgress/></Box> :
                authError ? <Alert severity="error">{authError}</Alert> :
                !session ? <LoginPage onLogin={reloadSession}/> :
                <AuthContext.Provider value={session}><AppLayout mode={mode} onToggleMode={() => setMode((value) => (value === 'dark' ? 'light' : 'dark'))} session={session} onLogout={async()=>{await apiRequest('/auth/logout',{method:'POST'});queryClient.clear();setSession(null);}}>
                  <Routes>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/clusters" element={<ClustersPage />} />
                    <Route path="/clusters/new" element={protectedPage(<ClusterFormPage />)} />
                    <Route path="/clusters/:clusterId/edit" element={<ClusterFormPage />} />
                    <Route path="/clusters/:clusterId/view" element={<ClusterFormPage />} />
                    <Route path="/queues" element={<QueuesPage />} />
                    <Route path="/templates" element={protectedPage(<TemplatesPage />)} />
                    <Route path="/bulk-actions" element={protectedPage(<BulkActionsPage />)} />
                    <Route path="/reports" element={protectedPage(<ReportsPage />)} />
                    <Route path="/audit-logs" element={<AuditLogPage />} />
                    <Route path="/admin" element={protectedPage(<AdminPage />)} />
                    <Route path="/admin/sre-groups" element={protectedPage(<SREGroupsPage />)} />
                    <Route path="/admin/datadog-orgs" element={protectedPage(<DatadogOrgsPage />)} />
                    <Route path="/admin/jobs" element={protectedPage(<JobsPage />)} />
                    <Route path="/admin/access" element={protectedPage(<AccessGroupsPage />)} />
                    <Route path="/admin/datadog-sync" element={protectedPage(<DatadogSyncPage />)} />
                  </Routes>
                </AppLayout></AuthContext.Provider>
              }
            />
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
