import { Assessment, Download, FilterAlt, PictureAsPdf, Refresh } from '@mui/icons-material';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, FormControl,
  InputLabel, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiRequest, API_BASE_URL } from '../services/api';
import type { Cluster } from '../types/api';

type Definition = { id: string; name: string; description: string; columns: string[]; cluster_filter: boolean };
type Preview = { name: string; columns: string[]; rows: string[][]; total: number; preview_limit: number };

function filenameFromHeader(header: string | null, fallback: string) {
  const match = header?.match(/filename="?([^";]+)"?/i);
  return match?.[1] || fallback;
}

export default function ReportsPage() {
  const [reportId, setReportId] = useState('queues_unsynced');
  const [clusterId, setClusterId] = useState('');
  const [downloading, setDownloading] = useState<'csv' | 'pdf' | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const { data: definitions = [] } = useQuery({ queryKey: ['reports-catalog'], queryFn: () => apiRequest<Definition[]>('/reports') });
  const { data: clusters = [] } = useQuery({ queryKey: ['clusters'], queryFn: () => apiRequest<Cluster[]>('/clusters') });
  const activeDefinition = definitions.find((report) => report.id === reportId);
  const queryString = activeDefinition?.cluster_filter && clusterId ? `?cluster_id=${encodeURIComponent(clusterId)}` : '';
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ['report-preview', reportId, queryString],
    queryFn: () => apiRequest<Preview>(`/reports/${reportId}${queryString}`),
    enabled: Boolean(activeDefinition),
  });

  async function download(format: 'csv' | 'pdf') {
    setDownloading(format);
    setDownloadError(null);
    try {
      const resource = `/reports/${reportId}/export.${format}${queryString}`;
      const response = await fetch(`${API_BASE_URL}${resource}`, { credentials: 'include' });
      if (!response.ok) {
        if (response.status === 401) window.dispatchEvent(new Event('rmp:session-expired'));
        throw new Error(`Não foi possível exportar ${format.toUpperCase()} (HTTP ${response.status}).`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filenameFromHeader(response.headers.get('content-disposition'), `monitor-portal-${reportId}.${format}`);
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Falha no download.');
    } finally {
      setDownloading(null);
    }
  }

  return (
    <Stack spacing={2.5} sx={{ minWidth: 0 }}>
      <Box>
        <Typography variant="h4" fontWeight={800}>Reports</Typography>
        <Typography variant="body2" color="text.secondary">Relatórios administrativos de filas, templates, sincronização e monitores Datadog.</Typography>
      </Box>
      {downloadError && <Alert severity="error" onClose={() => setDownloadError(null)}>{downloadError}</Alert>}
      <Paper sx={{ p: { xs: 2, md: 2.5 } }}>
        <Stack spacing={2}>
          <Stack direction="row" alignItems="center" spacing={1}><FilterAlt color="primary" fontSize="small"/><Typography fontWeight={800}>Filtros do relatório</Typography></Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'minmax(0,2fr) minmax(0,1fr)' }, gap: 2, width: '100%' }}>
            <FormControl fullWidth size="small">
              <InputLabel>Relatório</InputLabel>
              <Select value={reportId} label="Relatório" onChange={event => setReportId(String(event.target.value))}>
                {definitions.map(report => <MenuItem key={report.id} value={report.id}>{report.name}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small" disabled={!activeDefinition?.cluster_filter}>
              <InputLabel>Cluster</InputLabel>
              <Select value={activeDefinition?.cluster_filter ? clusterId : ''} label="Cluster" onChange={event => setClusterId(String(event.target.value))}>
                <MenuItem value="">Todos os clusters</MenuItem>
                {clusters.map(cluster => <MenuItem key={cluster.id} value={String(cluster.id)}>{cluster.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>
          <Typography color="text.secondary" variant="body2">{activeDefinition?.description || 'Selecione um relatório.'}</Typography>
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
            <Button variant="outlined" startIcon={<Refresh/>} onClick={() => refetch()} disabled={!activeDefinition || isFetching}>Atualizar prévia</Button>
            <Button variant="contained" startIcon={<Download/>} onClick={() => download('csv')} disabled={!data || downloading !== null}>Exportar CSV</Button>
            <Button variant="outlined" startIcon={<PictureAsPdf/>} onClick={() => download('pdf')} disabled={!data || downloading !== null}>Exportar PDF</Button>
            {downloading && <CircularProgress size={20}/>}
          </Stack>
        </Stack>
      </Paper>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'repeat(3,minmax(0,1fr))' }, gap: 2 }}>
        <Card sx={{ minWidth: 0 }}><CardContent><Stack direction="row" spacing={1} alignItems="center"><Assessment color="primary"/><Typography color="text.secondary" variant="body2">Registros encontrados</Typography></Stack><Typography variant="h4" fontWeight={800} sx={{ mt: 1 }}>{data?.total.toLocaleString('pt-BR') ?? '-'}</Typography></CardContent></Card>
        <Card sx={{ minWidth: 0 }}><CardContent><Typography color="text.secondary" variant="body2">Exibidos na prévia</Typography><Typography variant="h4" fontWeight={800} sx={{ mt: 1 }}>{data?.rows.length ?? '-'}</Typography></CardContent></Card>
        <Card sx={{ minWidth: 0 }}><CardContent><Typography color="text.secondary" variant="body2">Formato de exportação</Typography><Stack direction="row" spacing={1} sx={{ mt: 2 }}><Chip label="CSV completo" size="small" color="primary" variant="outlined"/><Chip label="PDF até 1.000" size="small" variant="outlined"/></Stack></CardContent></Card>
      </Box>
      {error && <Alert severity="error">Falha ao carregar relatório: {(error as Error).message}</Alert>}
      <Paper sx={{ minWidth: 0, overflow: 'hidden' }}>
        <Box sx={{ px: 2.5, py: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="h6" fontWeight={800}>Prévia — {activeDefinition?.name || 'Relatório'}</Typography>
          <Typography color="text.secondary" variant="caption">Primeiros {data?.preview_limit ?? 100} resultados</Typography>
        </Box>
        {isPending ? <Box sx={{ py: 5, textAlign: 'center' }}><CircularProgress size={28}/></Box> : (
          <TableContainer sx={{ maxHeight: 510 }}>
            <Table size="small" stickyHeader aria-label="Dados do relatório">
              <TableHead><TableRow>{data?.columns.map(column => <TableCell key={column} sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{column}</TableCell>)}</TableRow></TableHead>
              <TableBody>
                {data?.rows.map((row, index) => <TableRow key={index} hover>{row.map((value, column) => <TableCell key={column} sx={{ maxWidth: 310, overflowWrap: 'anywhere', fontSize: 12 }}>{value || '—'}</TableCell>)}</TableRow>)}
                {!data?.rows.length && <TableRow><TableCell colSpan={data?.columns.length || 1}>Nenhum registro para os filtros selecionados.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Stack>
  );
}
