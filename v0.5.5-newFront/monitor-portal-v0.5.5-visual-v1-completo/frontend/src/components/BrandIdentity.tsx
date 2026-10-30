import { Box, Stack, Typography } from '@mui/material';
import { useState } from 'react';

/** Replace /branding/btg-logo.svg in frontend/public with your approved corporate SVG. */
export function BtgLogo({ compact = false, dark = false }: { compact?: boolean; dark?: boolean }) {
  const [notAvailable, setNotAvailable] = useState(false);
  const color = dark ? '#FFFFFF' : '#082B5D';
  return <Box sx={{display:'inline-flex', alignItems:'center', justifyContent:'center', minWidth:compact?42:65, minHeight:compact?23:32}}>
    {notAvailable ? <Typography sx={{fontSize:compact?14:17,fontWeight:900,letterSpacing:'-.07em',color}}>BTG</Typography>
      : <Box component="img" src="/branding/btg-logo.svg" alt="BTG" onError={()=>setNotAvailable(true)}
           sx={{height:compact?24:32,maxWidth:compact?77:115,objectFit:'contain'}}/>}
  </Box>;
}

export function RMark({ size = 38 }: { size?: number }) {
  return <Box sx={{width:size,height:size,flexShrink:0,borderRadius:'11px',bgcolor:'#082B5D',
    display:'grid',placeItems:'center',color:'#fff',fontSize:size*.57,fontWeight:850,letterSpacing:'-0.08em',
    boxShadow:'0 4px 14px rgba(8,43,93,.13)'}}>R</Box>;
}

export function PortalBrand({ compact=false, dark=false }: { compact?:boolean;dark?:boolean }) {
  return <Stack direction="row" spacing={1.25} alignItems="center" sx={{minWidth:0}}>
    <RMark size={compact?32:38}/>
    {!compact && <Box sx={{minWidth:0}}>
      <Typography sx={{fontSize:15,fontWeight:800,lineHeight:1.15,whiteSpace:'nowrap',color:dark?'#fff':'#122E54'}}>Monitor Portal</Typography>
      <Typography sx={{fontSize:10,color:dark?'#b7c6df':'#8293aa',mt:.25}}>RabbitMQ · Monitoramento</Typography>
    </Box>}
  </Stack>;
}
