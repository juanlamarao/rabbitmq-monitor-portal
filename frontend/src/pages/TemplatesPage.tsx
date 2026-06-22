import { Chip, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../services/api';
import { MonitorTemplate } from '../types/api';

export default function TemplatesPage() {
  const { data: templates = [] } = useQuery({ queryKey: ['templates'], queryFn: () => apiRequest<MonitorTemplate[]>('/templates') });

  return (
    <Stack spacing={2}>
      <Typography variant="h4" fontWeight={800}>
        Templates de monitoramento
      </Typography>
      <Typography color="text.secondary">
        Herança dinâmica: alterações no template padrão impactam as queues vinculadas, exceto campos com override local futuro.
      </Typography>

      <Paper sx={{ overflow: 'hidden' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Nome</TableCell>
              <TableCell>Tipo</TableCell>
              <TableCell>Kind</TableCell>
              <TableCell>Configuração padrão</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {templates.map((template) => (
              <TableRow key={template.id} hover>
                <TableCell>
                  <Typography fontWeight={700}>{template.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {template.code}
                  </Typography>
                </TableCell>
                <TableCell>{template.component_type}</TableCell>
                <TableCell>{template.monitor_kind}</TableCell>
                <TableCell>
                  <Typography component="pre" variant="caption" sx={{ m: 0, whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify(template.default_config, null, 2)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip label={template.is_active ? 'Ativo' : 'Inativo'} color={template.is_active ? 'success' : 'default'} size="small" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Stack>
  );
}
