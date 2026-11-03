import { Box, Stack, Typography } from '@mui/material';
import { useState } from 'react';

/** Place the approved corporate logo at frontend/public/branding/btg-logo.svg. */
export function BtgLogo({
  compact = false,
  dark = false,
  hideTextFallback = false,
}: {
  compact?: boolean;
  dark?: boolean;
  hideTextFallback?: boolean;
}) {
  const [notAvailable, setNotAvailable] = useState(false);
  const color = dark ? '#FFFFFF' : '#082B5D';
  return <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: compact ? 42 : 150, minHeight: compact ? 23 : 60 }}>
    {notAvailable ? (hideTextFallback ? null : <Typography sx={{ fontSize: compact ? 14 : 17, fontWeight: 900, letterSpacing: '-.07em', color }}>BTG</Typography>)
      : <Box component="img" src="/branding/btg-logo.svg" alt="Logo BTG" onError={() => setNotAvailable(true)}
        sx={{ height: compact ? 24 : 58, maxWidth: compact ? 77 : 195, maxHeight: 58, objectFit: 'contain' }} />}
  </Box>;
}

// Mantidos para compatibilidade com integrações ou componentes antigos.
export function RMark({ size = 38 }: { size?: number }) {
  return <Box sx={{ width: size, height: size, flexShrink: 0, borderRadius: '11px', bgcolor: '#082B5D', display: 'grid', placeItems: 'center', color: '#fff', fontSize: size * .57, fontWeight: 850, letterSpacing: '-0.08em' }}>R</Box>;
}

export function PortalBrand({ compact = false, dark = false }: { compact?: boolean; dark?: boolean }) {
  return <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
    <RMark size={compact ? 32 : 38} />
    {!compact && <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 15, fontWeight: 800, lineHeight: 1.15, whiteSpace: 'nowrap', color: dark ? '#fff' : '#122E54' }}>Monitor Portal</Typography>
    </Box>}
  </Stack>;
}
