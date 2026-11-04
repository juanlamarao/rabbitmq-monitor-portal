import { AdminPanelSettings, Business, Groups, ManageHistory, Palette, Settings, SyncAlt } from '@mui/icons-material';
import type { ReactNode } from 'react';

export interface AdminNavigationEntry {
  label: string;
  path: string;
  icon: ReactNode;
  description?: string;
  action?: string;
}

/** The same order and metadata drives the sidebar and administration cards. */
export const adminLinks: AdminNavigationEntry[] = [
  { label: 'Visão geral', path: '/admin', icon: <Settings /> },
  { label: 'Aparência', path: '/admin/appearance', icon: <Palette />, description: 'Defina o layout Corporate ou Workspace para todos os usuários.', action: 'Configurar aparência' },
  { label: 'Permissões de Acesso', path: '/admin/access', icon: <AdminPanelSettings />, description: 'Associe grupos Microsoft Entra aos clusters editáveis ou à administração.', action: 'Gerenciar permissões' },
  { label: 'Grupos SRE', path: '/admin/sre-groups', icon: <Groups />, description: 'Gerencie grupos responsáveis e pessoas vinculadas por e-mail.', action: 'Abrir grupos SRE' },
  { label: 'Datadog Orgs', path: '/admin/datadog-orgs', icon: <Business />, description: 'Cadastre e valide organizações Datadog com API Key e Application Key.', action: 'Abrir Datadog Orgs' },
  { label: 'Jobs', path: '/admin/jobs', icon: <ManageHistory />, description: 'Acompanhe discoveries recorrentes, falhas e reexecuções.', action: 'Abrir jobs' },
  { label: 'Fila Datadog', path: '/admin/datadog-sync', icon: <SyncAlt />, description: 'Acompanhe a fila automática de criação e atualização de monitores.', action: 'Consultar fila' },
  { label: 'Reconciliação Datadog', path: '/admin/datadog-reconcile', icon: <ManageHistory />, description: 'Valide os monitores gerenciados e acompanhe o progresso por organização, cluster e fila.', action: 'Abrir reconciliação' },
];
