import { Business, Groups } from '@mui/icons-material';
import { Button, Card, CardContent, Grid, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

export default function AdminPage() {
  return (
    <Stack spacing={3}>
      <Typography variant="h4" fontWeight={800}>
        Administração
      </Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
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
        <Grid item xs={12} md={6}>
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
      </Grid>
    </Stack>
  );
}
