import { API_BASE_URL } from './config';

export interface PortalSession {
  email: string;
  name: string;
  local: boolean;
  is_admin: boolean;
  edit_cluster_ids: number[];
  csrf_token: string;
  groups_overage?: boolean;
}

let csrf = '';
export const setCsrf = (value: string) => { csrf = value; };
export const getCsrf = () => csrf;

export async function loadSession(): Promise<PortalSession | null> {
  const r = await fetch(`${API_BASE_URL}/auth/me`, { credentials: 'include' });
  if (r.status === 401) return null;
  if (!r.ok) throw new Error('Não foi possível validar a sessão.');
  const v: PortalSession = await r.json();
  setCsrf(v.csrf_token);
  return v;
}
