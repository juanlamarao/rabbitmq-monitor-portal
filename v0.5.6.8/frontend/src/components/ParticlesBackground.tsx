import { Box } from '@mui/material';
import type { CSSProperties } from 'react';
import { useAppearance } from '../services/appearance';

const PARTICLES = Array.from({ length: 30 }, (_, i) => ({
  left: `${(i * 37 + 11) % 100}%`,
  size: `${3 + (i * 7) % 7}px`,
  duration: `${16 + (i * 11) % 15}s`,
  delay: `-${(i * 13) % 30}s`,
}));

export default function ParticlesBackground() {
  const { appearance } = useAppearance();
  return <Box aria-hidden="true" className="rmp-particles-field" sx={{position:'absolute',inset:0,pointerEvents:'none',overflow:'hidden'}}>
    {appearance.login_particles && PARTICLES.map((p,i)=><Box key={i} className="rmp-particle" sx={{
      '--left':p.left,'--size':p.size,'--duration':p.duration,'--delay':p.delay,
    } as CSSProperties}/>)}
  </Box>;
}
