import { Box, Typography, Paper } from '@mui/material';

export default function HomePage() {
  return (
    <Box sx={{ minHeight: '100vh', p: 4 }}>
      <Paper sx={{ p: 4 }}>
        <Typography variant="h4" gutterBottom>
          RabbitMQ Monitor Portal
        </Typography>

        <Typography variant="body1">
          Base inicial do portal de gerenciamento de monitores RabbitMQ.
        </Typography>
      </Paper>
    </Box>
  );
}
