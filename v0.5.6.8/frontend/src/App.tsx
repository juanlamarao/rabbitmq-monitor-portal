import { Alert, Box, CircularProgress, CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import AdminPage from './pages/AdminPage';
import AppearancePage from './pages/AppearancePage';
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
import DatadogReconciliationPage from './pages/DatadogReconciliationPage';
import TemplatesPage from './pages/TemplatesPage';
import JobsPage from './pages/JobsPage';
import PublicQueueReferencePage from './pages/PublicQueueReferencePage';
import AccessGroupsPage from './pages/AccessGroupsPage';
import LoginPage from './pages/LoginPage';
import WorkspaceHomePage from './pages/WorkspaceHomePage';
import { loadSession, PortalSession } from './services/auth';
import { apiRequest, API_BASE_URL } from './services/api';
import { AuthContext } from './services/authContext';
import { AppearanceContext, AppearanceSettings, DEFAULT_APPEARANCE } from './services/appearance';

const queryClient = new QueryClient({defaultOptions:{queries:{retry:1,staleTime:30000}}});
const theme=createTheme({
  palette:{mode:'light',primary:{main:'#0756AE',dark:'#082B5D',light:'#EAF3FF',contrastText:'#fff'},
    secondary:{main:'#426D9D'},background:{default:'#F5F8FC',paper:'#FFFFFF'},
    text:{primary:'#192B44',secondary:'#71829A'},success:{main:'#25835B'},warning:{main:'#B77D14'},error:{main:'#C63F49'}},
  typography:{fontFamily:'Inter,system-ui,-apple-system,"Segoe UI",Arial,sans-serif',
    h4:{fontWeight:800,fontSize:'1.65rem',letterSpacing:'-.03em'},h6:{fontWeight:750},button:{textTransform:'none',fontWeight:700}},
  shape:{borderRadius:10},
  components:{
    MuiCssBaseline:{styleOverrides:{body:{backgroundColor:'#F5F8FC'}}},
    MuiCard:{styleOverrides:{root:{boxShadow:'0 2px 10px rgba(15,45,85,.035)',border:'1px solid #E3EAF3',backgroundImage:'none',borderRadius:11}}},
    MuiPaper:{styleOverrides:{root:{backgroundImage:'none'}}},
    MuiButton:{styleOverrides:{root:{borderRadius:8,textTransform:'none',fontWeight:700}}},
    MuiTableHead:{styleOverrides:{root:{backgroundColor:'#F7FAFE'}}},
    MuiTableCell:{styleOverrides:{head:{fontWeight:700,color:'#798AA0',fontSize:12,borderColor:'#E9EEF6'},root:{borderColor:'#EDF2F7'}}},
    MuiTextField:{defaultProps:{size:'small'}},
    MuiFormControl:{defaultProps:{size:'small'}},
    MuiSelect:{defaultProps:{size:'small'}},
  },
});

export default function App(){
  const [session,setSession]=useState<PortalSession|null>(null);
  const [loading,setLoading]=useState(true);
  const [authError,setAuthError]=useState('');
  const [appearance,setAppearance]=useState<AppearanceSettings>(DEFAULT_APPEARANCE);
  async function reloadSession(){try{setSession(await loadSession());setAuthError('');}catch(e){setAuthError(String(e));}finally{setLoading(false)}}
  async function refreshAppearance(){
    try{const r=await fetch(`${API_BASE_URL}/ui/settings`,{credentials:'include',cache:'no-store'});if(r.ok)setAppearance(await r.json());}
    catch{/* retain last known/default style during a temporary connection failure */}
  }
  useEffect(()=>{
    void reloadSession();void refreshAppearance();
    const timer=window.setInterval(()=>void refreshAppearance(),60000);
    const onVisible=()=>{if(document.visibilityState==='visible')void refreshAppearance()};
    const expired=()=>{queryClient.clear();setSession(null)};
    document.addEventListener('visibilitychange',onVisible);window.addEventListener('rmp:session-expired',expired);
    return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('rmp:session-expired',expired)};
  },[]);
  const saveAppearance=async(next:AppearanceSettings)=>{
    const saved=await apiRequest<AppearanceSettings>('/ui/settings',{method:'PUT',body:JSON.stringify({layout:next.layout,theme:next.theme,login_particles:next.login_particles})});
    setAppearance(saved);
  };
  const appearanceStore=useMemo(()=>({appearance,saveAppearance}),[appearance]);
  const admin=Boolean(session?.is_admin);
  const protectedPage=(element:ReactNode)=>admin?element:<Navigate to="/" replace/>;
  return <QueryClientProvider client={queryClient}>
    <ThemeProvider theme={theme}><CssBaseline/>
      <AppearanceContext.Provider value={appearanceStore}>
        <BrowserRouter><Routes>
          <Route path="/public/queue-reference" element={<PublicQueueReferencePage/>}/>
          <Route path="/login" element={session?<Navigate to="/" replace/>:<LoginPage onLogin={reloadSession}/>}/>
          <Route path="*" element={loading?<Box sx={{height:'90vh',display:'grid',placeItems:'center'}}><CircularProgress/></Box>
            :authError?<Alert severity="error">{authError}</Alert>
            :!session?<LoginPage onLogin={reloadSession}/>
            :<AuthContext.Provider value={session}>
              <AppLayout session={session} onLogout={async()=>{await apiRequest('/auth/logout',{method:'POST'});queryClient.clear();setSession(null);}}>
                <Routes>
                  <Route path="/" element={appearance.layout==='workspace'?<WorkspaceHomePage/>:<DashboardPage/>}/>
                  <Route path="/dashboard" element={<DashboardPage/>}/>
                  <Route path="/clusters" element={<ClustersPage/>}/>
                  <Route path="/clusters/new" element={session?.is_admin || session?.is_observability ? <ClusterFormPage/> : <Navigate to="/clusters" replace/>}/>
                  <Route path="/clusters/:clusterId/edit" element={<ClusterFormPage/>}/>
                  <Route path="/clusters/:clusterId/view" element={<ClusterFormPage/>}/>
                  <Route path="/queues" element={<QueuesPage/>}/>
                  <Route path="/templates" element={protectedPage(<TemplatesPage/>)}/>
                  <Route path="/bulk-actions" element={protectedPage(<BulkActionsPage/>)}/>
                  <Route path="/reports" element={protectedPage(<ReportsPage/>)}/>
                  <Route path="/audit-logs" element={<AuditLogPage/>}/>
                  <Route path="/admin" element={protectedPage(<AdminPage/>)}/>
                  <Route path="/admin/sre-groups" element={protectedPage(<SREGroupsPage/>)}/>
                  <Route path="/admin/datadog-orgs" element={protectedPage(<DatadogOrgsPage/>)}/>
                  <Route path="/admin/jobs" element={protectedPage(<JobsPage/>)}/>
                  <Route path="/admin/access" element={protectedPage(<AccessGroupsPage/>)}/>
                  <Route path="/admin/datadog-sync" element={protectedPage(<DatadogSyncPage/>)}/>
                  <Route path="/admin/datadog-reconcile" element={protectedPage(<DatadogReconciliationPage/>)}/>
                  <Route path="/admin/appearance" element={protectedPage(<AppearancePage/>)}/>
                </Routes>
              </AppLayout>
            </AuthContext.Provider>}/>
        </Routes></BrowserRouter>
      </AppearanceContext.Provider>
    </ThemeProvider>
  </QueryClientProvider>;
}
