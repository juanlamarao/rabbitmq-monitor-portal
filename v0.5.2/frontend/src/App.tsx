import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
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

const queryClient = new QueryClient();

export default function App() {
  const [mode, setMode] = useState<'light' | 'dark'>('dark');
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
            <Route
              path="*"
              element={
                <AppLayout mode={mode} onToggleMode={() => setMode((value) => (value === 'dark' ? 'light' : 'dark'))}>
                  <Routes>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/clusters" element={<ClustersPage />} />
                    <Route path="/clusters/new" element={<ClusterFormPage />} />
                    <Route path="/clusters/:clusterId/edit" element={<ClusterFormPage />} />
                    <Route path="/clusters/:clusterId/view" element={<ClusterFormPage />} />
                    <Route path="/queues" element={<QueuesPage />} />
                    <Route path="/templates" element={<TemplatesPage />} />
                    <Route path="/bulk-actions" element={<BulkActionsPage />} />
                    <Route path="/reports" element={<ReportsPage />} />
                    <Route path="/audit-logs" element={<AuditLogPage />} />
                    <Route path="/admin" element={<AdminPage />} />
                    <Route path="/admin/sre-groups" element={<SREGroupsPage />} />
                    <Route path="/admin/datadog-orgs" element={<DatadogOrgsPage />} />
                    <Route path="/admin/jobs" element={<JobsPage />} />
                    <Route path="/admin/datadog-sync" element={<DatadogSyncPage />} />
                  </Routes>
                </AppLayout>
              }
            />
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
