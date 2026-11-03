import { Alert, Paper, Stack, Typography } from '@mui/material';

export default function ReportsPage() {
  return (
    <Stack spacing={2}>
      <Typography variant="h4" fontWeight={800}>
        Reports
      </Typography>
      <Paper sx={{ p: 3 }}>
        <Alert severity="info">
          Área reservada para relatório geral de configurações e reports predefinidos. A modelagem já considera audit log,
          clusters, queues e templates para suportar essa evolução.
        </Alert>
      </Paper>
    </Stack>
  );
}
