import { AccountTree, Queue as QueueIcon, Rule, WarningAmber } from '@mui/icons-material';
import { Box, Card, CardContent, Grid, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../services/api';
import { Cluster, MonitorTemplate, QueueItem } from '../types/api';

export default function DashboardPage() {
  const { data: clusters = [] } = useQuery({ queryKey: ['clusters'], queryFn: () => apiRequest<Cluster[]>('/clusters') });
  const { data: activeQueues = [] } = useQuery({ queryKey: ['queues', 'active'], queryFn: () => apiRequest<QueueItem[]>('/components/queues') });
  const { data: removedQueues = [] } = useQuery({ queryKey: ['queues', 'removed'], queryFn: () => apiRequest<QueueItem[]>('/components/queues?removed_only=true') });
  const { data: templates = [] } = useQuery({ queryKey: ['templates'], queryFn: () => apiRequest<MonitorTemplate[]>('/templates') });

  const cards = [
    { label: 'Clusters', value: clusters.length, icon: <AccountTree fontSize="large" /> },
    { label: 'Queues ativas', value: activeQueues.length, icon: <QueueIcon fontSize="large" /> },
    { label: 'Templates', value: templates.length, icon: <Rule fontSize="large" /> },
    { label: 'Queues removidas', value: removedQueues.length, icon: <WarningAmber fontSize="large" /> },
  ];

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" fontWeight={800} gutterBottom>
          Dashboard
        </Typography>
      </Box>

      <Grid container spacing={2}>
        {cards.map((card) => (
          <Grid item xs={12} md={3} key={card.label}>
            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography color="text.secondary" variant="body2">
                      {card.label}
                    </Typography>
                    <Typography variant="h4" fontWeight={800}>
                      {card.value}
                    </Typography>
                  </Box>
                  {card.icon}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Stack>
  );
}
