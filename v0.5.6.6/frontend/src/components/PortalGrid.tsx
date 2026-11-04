import { Box, type BoxProps } from '@mui/material';
import type { ReactNode } from 'react';

type Span = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
interface PortalGridProps extends Omit<BoxProps, 'component'> {
  container?: boolean;
  item?: boolean;
  xs?: Span;
  sm?: Span;
  md?: Span;
  lg?: Span;
  xl?: Span;
  spacing?: number;
  children?: ReactNode;
}
/**
 * App-wide 12-column layout. Unlike legacy MUI Grid, this does NOT apply
 * negative margins or child padding. Nested grids obey the containing card.
 */
export default function PortalGrid({container, item, xs, sm, md, lg, xl, spacing=0, sx, children, ...props}: PortalGridProps) {
  const spans: Record<string, string> = { xs: `span ${xs ?? 12}` };
  if (sm != null) spans.sm = `span ${sm}`;
  if (md != null) spans.md = `span ${md}`;
  if (lg != null) spans.lg = `span ${lg}`;
  if (xl != null) spans.xl = `span ${xl}`;
  return <Box {...props} sx={{
    boxSizing: 'border-box', width: '100%', minWidth: 0,
    ...(container ? {display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: spacing} : {}),
    ...(item ? {gridColumn: spans} : {}),
    ...(Array.isArray(sx) ? {} : ((sx || {}) as Record<string, unknown>)),
  }}>{children}</Box>;
}
