import { Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../services/api';
import { AuditLog } from '../types/api';

export default function AuditLogPage() {
  const { data: logs = [] } = useQuery({ queryKey: ['audit-logs'], queryFn: () => apiRequest<AuditLog[]>('/audit-logs') });

  return (
    <Stack spacing={2}>
      <Typography variant="h4" fontWeight={800}>
        Audit Log
      </Typography>
      <Paper sx={{ overflow: 'hidden' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Data</TableCell>
              <TableCell>Entidade</TableCell>
              <TableCell>Ação</TableCell>
              <TableCell>Ator</TableCell>
              <TableCell>Resumo</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id} hover>
                <TableCell>{new Date(log.created_at).toLocaleString()}</TableCell>
                <TableCell>
                  {log.entity_type} #{log.entity_id || '-'}
                </TableCell>
                <TableCell>{log.action}</TableCell>
                <TableCell>{log.actor}</TableCell>
                <TableCell>{log.summary}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Stack>
  );
}
