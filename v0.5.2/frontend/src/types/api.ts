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
  datadog_monitor_type?: string | null;
  datadog_query_template?: string | null;
  datadog_message_template?: string | null;
  datadog_tags_template?: string[] | null;
  datadog_options?: Record<string, unknown> | null;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}


export interface MonitorTemplatePayload {
  code?: string;
  name: string;
  description?: string | null;
  component_type?: string;
  monitor_kind: string;
  default_config: Record<string, unknown>;
  datadog_monitor_type?: string | null;
  datadog_query_template?: string | null;
  datadog_message_template?: string | null;
  datadog_tags_template?: string[] | null;
  datadog_options?: Record<string, unknown> | null;
  is_active?: boolean;
}

export interface TemplateUsageQueue {
  binding_id: number;
  queue_id: number;
  queue_name: string;
  vhost: string;
  cluster_id: number;
  cluster_name: string;
  enabled: boolean;
  is_customized: boolean;
  overrides?: Record<string, unknown> | null;
  is_removed: boolean;
}

export interface TemplateUsage {
  template_id: number;
  total_bindings: number;
  enabled_bindings: number;
  disabled_bindings: number;
  customized_bindings: number;
  inherited_bindings: number;
  active_queues: number;
  removed_queues: number;
  queues: TemplateUsageQueue[];
}

export interface TemplateImpact {
  template_id: number;
  changed_keys: string[];
  removed_keys: string[];
  added_keys: string[];
  total_bindings: number;
  inherited_bindings: number;
  customized_bindings: number;
  affected_inherited_bindings: number;
  protected_by_override_bindings: number;
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


export interface JobHistory {
  id: number;
  job_type: string;
  status: string;
  cluster_id?: number | null;
  summary?: string | null;
  details?: Record<string, unknown> | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
}

export interface JobBulkEnqueueResult {
  enqueued: number;
  skipped: number;
  errors: Array<Record<string, unknown>>;
  jobs: JobHistory[];
  skipped_jobs: JobHistory[];
}

export interface QueueBulkFilter {
  cluster_id?: number | null;
  queue_ids?: number[] | null;
  search?: string | null;
  vhost?: string | null;
  name_regex?: string | null;
  criticality?: QueueCriticality | null;
  owner_email?: string | null;
  service_name?: string | null;
  template_id?: number | null;
  customized_only?: boolean;
  include_removed?: boolean;
  removed_only?: boolean;
  sample_limit?: number;
}

export interface QueueBulkQueuePreview {
  id: number;
  cluster_id: number;
  cluster_name?: string | null;
  vhost: string;
  name: string;
  criticality?: string | null;
  owner_email?: string | null;
  service_name?: string | null;
  is_removed: boolean;
  applied_templates: QueueAppliedTemplate[];
}

export interface QueueBulkPreview {
  matched_count: number;
  sample_count: number;
  sample_limit: number;
  queues: QueueBulkQueuePreview[];
}

export type QueueBulkAction =
  | 'update_metadata'
  | 'apply_template'
  | 'remove_template'
  | 'update_template_overrides'
  | 'clear_template_overrides'
  | 'set_template_enabled';

export interface QueueBulkApplyResult {
  action: QueueBulkAction;
  matched_count: number;
  affected_count: number;
  skipped_count: number;
  errors: string[];
  details: Record<string, unknown>;
}


export interface DatadogPlanQueueSample {
  queue_id: number;
  cluster_id: number;
  cluster_name: string;
  rabbitmq_cluster_tag: string;
  vhost: string;
  queue: string;
  service_name?: string | null;
  criticality?: string | null;
  owner_email?: string | null;
  is_customized: boolean;
}

export interface DatadogPlanBucket {
  bucket_key: string;
  datadog_org_id: number;
  datadog_org_name: string;
  template_id: number;
  template_code: string;
  template_name: string;
  monitor_type: string;
  monitor_kind: string;
  strategy: string;
  effective_config: Record<string, unknown>;
  queue_count: number;
  customized_queue_count: number;
  inherited_queue_count: number;
  query?: string | null;
  message?: string | null;
  tags: string[];
  options: Record<string, unknown>;
  grouping_tags: string[];
  scope_tags_used: string[];
  public_reference_url_template: string;
  warnings: string[];
  errors: string[];
  sample_queues: DatadogPlanQueueSample[];
  desired_config_hash: string;
  saved_monitor_id?: number | null;
  saved_sync_status?: string | null;
  saved_desired_config_hash?: string | null;
  saved_applied_config_hash?: string | null;
  saved_last_planned_at?: string | null;
  plan_state: 'new' | 'unchanged' | 'changed';
}

export interface DatadogPlanSummary {
  total_buckets: number;
  total_queues_covered: number;
  buckets_with_errors: number;
  buckets_with_warnings: number;
  templates_without_query: number;
  orgs: string[];
  new_buckets: number;
  unchanged_buckets: number;
  changed_buckets: number;
  saved_buckets: number;
}

export interface DatadogPlan {
  dry_run: boolean;
  summary: DatadogPlanSummary;
  buckets: DatadogPlanBucket[];
}

export interface DatadogPlanPersistResult {
  planned: number;
  created: number;
  updated: number;
  unchanged: number;
  orphaned: number;
  skipped_with_errors: number;
  active_saved_monitors: number;
}

export interface GeneratedMonitor {
  id: number;
  datadog_org_id?: number | null;
  datadog_org_name?: string | null;
  template_id?: number | null;
  template_code?: string | null;
  provider: string;
  monitor_scope_type: string;
  grouping_key?: string | null;
  name?: string | null;
  query?: string | null;
  message?: string | null;
  tags: string[];
  options: Record<string, unknown>;
  covered_queues_count: number;
  desired_config_hash?: string | null;
  applied_config_hash?: string | null;
  sync_status: string;
  external_monitor_id?: string | null;
  external_monitor_url?: string | null;
  last_planned_at?: string | null;
  last_synced_at?: string | null;
  last_error?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PublicAppliedTemplate {
  binding_id: number;
  template_id: number;
  code: string;
  name: string;
  enabled: boolean;
  is_customized: boolean;
  effective_config: Record<string, unknown>;
  overrides?: Record<string, unknown> | null;
}

export interface PublicQueueReference {
  cluster_id: number;
  cluster_name: string;
  rabbitmq_cluster_tag: string;
  environment: string;
  business_line?: string | null;
  vhost: string;
  queue: string;
  type?: string | null;
  state?: string | null;
  service_name?: string | null;
  criticality?: string | null;
  owner_email?: string | null;
  sre_group_name?: string | null;
  sre_group_members: string[];
  dev_emails: string[];
  journey?: string | null;
  description?: string | null;
  monitoring_schedule?: string | null;
  is_removed: boolean;
  removed_at?: string | null;
  discovered_at?: string | null;
  updated_at: string;
  applied_templates: PublicAppliedTemplate[];
}
