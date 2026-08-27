import { Business, Groups, ManageHistory, SyncAlt } from '@mui/icons-material';
import { Button, Card, CardContent, Grid, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

export default function AdminPage() {
  return (
    <Stack spacing={3}>
      <Typography variant="h4" fontWeight={800}>
        Administração
      </Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Groups fontSize="large" />
                <Typography variant="h6" fontWeight={800}>
                  Grupos SRE
                </Typography>
                <Typography color="text.secondary">Gerencie grupos responsáveis e pessoas vinculadas por e-mail.</Typography>
                <Button component={RouterLink} to="/admin/sre-groups" variant="contained">
                  Abrir grupos SRE
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Business fontSize="large" />
                <Typography variant="h6" fontWeight={800}>
                  Datadog Orgs
                </Typography>
                <Typography color="text.secondary">Cadastre organizações Datadog com validação de API key e APP key.</Typography>
                <Button component={RouterLink} to="/admin/datadog-orgs" variant="contained">
                  Abrir Datadog Orgs
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <ManageHistory fontSize="large" />
                <Typography variant="h6" fontWeight={800}>
                  Jobs
                </Typography>
                <Typography color="text.secondary">Acompanhe discoveries recorrentes, falhas, contadores e reexecuções.</Typography>
                <Button component={RouterLink} to="/admin/jobs" variant="contained">
                  Abrir jobs
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <SyncAlt fontSize="large" />
                <Typography variant="h6" fontWeight={800}>
                  Datadog Sync
                </Typography>
                <Typography color="text.secondary">Valide dry-runs de monitores agrupados antes da criação real no Datadog.</Typography>
                <Button component={RouterLink} to="/admin/datadog-sync" variant="contained">
                  Abrir Datadog Sync
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
