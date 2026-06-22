export type Environment = 'prod' | 'uat' | 'dev';
export type Protocol = 'http' | 'https';
export type MonitoringSchedule = '24x7' | 'business_hour' | 'seg-sex' | 'custom';
export type QueueCriticality = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface SREGroupMember {
  id: number;
  email: string;
  position: number;
  created_at: string;
}

export interface SREGroup {
  id: number;
  name: string;
  description?: string | null;
  is_active: boolean;
  members: SREGroupMember[];
  created_at: string;
  updated_at: string;
}

export interface DatadogOrg {
  id: number;
  name: string;
  api_url: string;
  org_url?: string | null;
  description?: string | null;
  is_active: boolean;
  has_credentials: boolean;
  created_at: string;
  updated_at: string;
}

export interface DirectoryPerson {
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
}

export interface ClusterRegex {
  id: number;
  pattern: string;
  position: number;
}

export interface Cluster {
  id: number;
  name: string;
  environment: Environment;
  business_line?: string | null;
  protocol: Protocol;
  dns: string;
  api_port: number;
  api_username: string;
  sre_group_id?: number | null;
  datadog_org_id?: number | null;
  monitor_cluster: boolean;
  monitor_queues: boolean;
  monitor_exchanges: boolean;
  monitor_connections: boolean;
  monitor_nodes: boolean;
  monitor_shovels: boolean;
  is_active: boolean;
  last_discovery_at?: string | null;
  created_at: string;
  updated_at: string;
  temporary_queue_regexes: ClusterRegex[];
  sre_group?: SREGroup | null;
  datadog_org?: DatadogOrg | null;
}

export interface ClusterFormPayload {
  name: string;
  environment: Environment;
  business_line?: string | null;
  protocol: Protocol;
  dns: string;
  api_port: number;
  api_username: string;
  api_password?: string;
  sre_group_id?: number | null;
  datadog_org_id?: number | null;
  temporary_queue_regexes: string[];
  is_active: boolean;
}

export interface DiscoveryResult {
  cluster_id: number;
  fetched: number;
  created: number;
  updated: number;
  restored: number;
  marked_removed: number;
  temporary_matched: number;
}

export interface QueueAppliedTemplate {
  template_id: number;
  code: string;
  enabled: boolean;
  is_customized: boolean;
}

export interface QueueItem {
  id: number;
  cluster_id: number;
  name: string;
  vhost: string;
  type?: string | null;
  durable?: boolean | null;
  auto_delete?: boolean | null;
  exclusive?: boolean | null;
  state?: string | null;
  api_raw?: Record<string, unknown> | null;
  description?: string | null;
  criticality?: QueueCriticality | null;
  owner_email?: string | null;
  journey?: string | null;
  service_name?: string | null;
  monitoring_schedule: MonitoringSchedule;
  monitoring_custom_window?: string | null;
  dev_emails?: string[] | null;
  is_dead_letter: boolean;
  monitor_anomaly: boolean;
  monitor_enabled: boolean;
  is_temporary: boolean;
  is_removed: boolean;
  removed_at?: string | null;
  discovered_at?: string | null;
  created_at: string;
  updated_at: string;
  applied_templates: QueueAppliedTemplate[];
}

export interface MonitorTemplate {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  component_type: string;
  monitor_kind: string;
  default_config: Record<string, unknown>;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface QueueMonitorTemplate {
  id: number;
  queue_id: number;
  template_id: number;
  enabled: boolean;
  overrides?: Record<string, unknown> | null;
  effective_config: Record<string, unknown>;
  template: MonitorTemplate;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: number;
  entity_type: string;
  entity_id?: string | null;
  action: string;
  actor: string;
  summary?: string | null;
  before_data?: Record<string, unknown> | null;
  after_data?: Record<string, unknown> | null;
  created_at: string;
}
