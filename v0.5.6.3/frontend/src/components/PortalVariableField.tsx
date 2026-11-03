import { Box, List, ListItemButton, ListItemText, Paper, TextField, Typography } from '@mui/material';
import { useRef, useState } from 'react';

export const PORTAL_VARIABLES: { key: string; description: string }[] = [
  { key: 'queue.name', description: 'Nome da fila RabbitMQ' },
  { key: 'vhost.name', description: 'Vhost da fila' },
  { key: 'rabbitmq_cluster.name', description: 'Identificador do cluster no Datadog' },
  { key: 'cluster_name', description: 'Nome do cluster no Portal' },
  { key: 'service_name', description: 'Serviço da fila' },
  { key: 'criticality', description: 'Criticidade da fila' },
  { key: 'tag.service_name', description: 'Serviço sanitizado para tag Datadog' },
  { key: 'tag.criticality', description: 'Criticidade sanitizada para tag Datadog' },
  { key: 'tag.journey', description: 'Jornada sanitizada para tag Datadog' },
  { key: 'journey', description: 'Jornada de negócio' },
  { key: 'public_reference_url', description: 'URL pública de referência da fila' },
  { key: 'template_code', description: 'Código do template' },
  { key: 'template_name', description: 'Nome do template' },
  { key: 'metric_messages', description: 'Métrica de mensagens' },
  { key: 'metric_consumers', description: 'Métrica de consumidores' },
  { key: 'datadog_scope', description: 'Escopo dedicado: cluster/vhost/queue' },
  { key: 'threshold', description: 'Threshold configurado' },
  { key: 'window', description: 'Janela de avaliação' },
  { key: 'rabbitmq_cluster_tag', description: 'Valor da tag do cluster' },
  { key: 'queue_name', description: 'Nome da fila (alias)' },
  { key: 'vhost', description: 'Vhost (alias)' },
  { key: 'portal_public_base_url', description: 'Base URL pública do Portal' },
];

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  minRows?: number;
  helperText?: string;
}

export default function PortalVariableField({ label, value, onChange, disabled, minRows = 4, helperText }: Props) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [match, setMatch] = useState<{ start: number; end: number; text: string } | null>(null);
  const [highlighted, setHighlighted] = useState(0);

  function detect(next: string, caret: number) {
    const found = /\[\[([\w.]*)$/.exec(next.slice(0, caret));
    setMatch(found ? { start: caret - found[0].length, end: caret, text: found[1] } : null);
    setHighlighted(0);
  }
  const options = (match ? PORTAL_VARIABLES.filter(v => v.key.toLowerCase().includes(match.text.toLowerCase())).slice(0, 9) : []);
  function insert(variable: string) {
    if (!match) return;
    const next = value.slice(0, match.start) + `[[${variable}]]` + value.slice(match.end);
    const caret = match.start + variable.length + 4;
    onChange(next);
    setMatch(null);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(caret, caret);
    });
  }

  return <Box sx={{ position: 'relative' }}>
    <TextField fullWidth multiline minRows={minRows} label={label} value={value} disabled={disabled}
      inputRef={inputRef} helperText={helperText || 'Digite [[ para ver as variáveis do Portal; {{...}} é reservado ao Datadog.'}
      onChange={event => { onChange(event.target.value); detect(event.target.value, event.target.selectionStart || 0); }}
      onClick={event => { const el = event.target as HTMLTextAreaElement; detect(value, el.selectionStart || 0); }}
      onKeyUp={event => {
        if (['ArrowDown','ArrowUp','Enter','Escape'].includes(event.key)) return;
        const el = event.target as HTMLTextAreaElement;
        detect(value, el.selectionStart || 0);
      }}
      onKeyDown={event => {
        if (!options.length) return;
        if (event.key === 'ArrowDown') { event.preventDefault(); setHighlighted(i => (i+1) % options.length); }
        if (event.key === 'ArrowUp') { event.preventDefault(); setHighlighted(i => (i-1+options.length) % options.length); }
        if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); insert(options[highlighted].key); }
        if (event.key === 'Escape') { event.preventDefault(); setMatch(null); }
      }}
    />
    {!disabled && options.length > 0 && <Paper elevation={6} sx={{ position:'absolute', top:'100%', zIndex:1500, width:'100%', maxHeight:260, overflow:'auto', border:'1px solid #dce6f2' }}>
      <Typography variant="caption" sx={{ display:'block', px:2, pt:1, color:'text.secondary' }}>Variáveis do Portal · selecionar com Enter</Typography>
      <List dense disablePadding>
        {options.map((item, idx) => <ListItemButton key={item.key} selected={highlighted === idx}
          onMouseDown={event => event.preventDefault()} onClick={() => insert(item.key)}>
          <ListItemText primary={`[[${item.key}]]`} secondary={item.description}
            primaryTypographyProps={{fontFamily:'monospace',fontSize:12}} secondaryTypographyProps={{fontSize:11}} />
        </ListItemButton>)}
      </List>
    </Paper>}
  </Box>;
}
