/**
 * types.ts — TypeScript interfaces for doc-hub domain objects.
 * These mirror the JSON schemas in /schemas/ and the Google Sheets column definitions.
 */

export interface TenantConfig {
  tenantId: string;
  sharedDriveId: string;
  brandKitFolderId: string;
  registrySheetId: string;
  auditTrailSheetId?: string;
  manifestSheetId: string;
  importsFolderId: string;
  trashFolderId: string;
  snapshotsFolderName?: string;
  archiveFolderName?: string;
  adminEmail: string;
  notifyEmail?: string;
  webAppUrl?: string;
  trash?: {
    docTtlDays?: number;
    snapshotTtlDays?: number;
  };
  lock?: {
    defaultTtlMinutes?: number;
  };
  linter?: {
    enabled?: boolean;
    orphanWarningDays?: number;
    duplicateLevenshteinThreshold?: number;
    forbiddenNamePatterns?: string[];
  };
}

export interface ManifestRow {
  id: string;
  category: "Legal" | "Comercial" | "Internos" | "Governance" | "__adhoc-blank" | "__adopted";
  name: string;
  description: string;
  template_file_id: string;
  output_folder_id: string;
  naming_pattern: string;
  tokens_schema: string;
  required_inputs: string;
  suggested_sources?: string;
  doc_type?: "document" | "presentation" | "spreadsheet";
  owner: string;
  version: string;
  active: boolean;
}

export interface RegistryRow {
  doc_id: string;
  file_id: string;
  name: string;
  category: "Legal" | "Comercial" | "Internos" | "Governance" | "__adhoc-blank" | "__adopted";
  folder_path: string;
  folder_id?: string;
  template_id: string;
  template_version?: string;
  status: "draft" | "review" | "approved" | "published" | "archived";
  created_by: string;
  created_at: string;
  last_edited_by?: string;
  last_edited_at?: string;
  owner?: string;
  audience?: "internal" | "external";
  locked_by?: string;
  locked_until?: string;
  supersedes?: string;
  superseded_by?: string;
  snapshots_json?: string;
  imported_from?: string;
  brand_check_status?: "ok" | "violations" | "unchecked";
  brand_check_at?: string;
  url?: string;
}

export interface SnapshotRecord {
  url: string;
  hash: string;
  name: string;
  created_by: string;
  created_at: string;
}

export interface AuditEvent {
  event_id: string;
  timestamp: string;
  action: string;
  file_id: string;
  doc_id: string;
  actor: string;
  payload_json: string;
  inverse_op_json: string;
  status: "ok" | "undone" | "error";
}

export interface LinterViolation {
  type: "naming" | "orphan" | "duplicate" | "missing_registry" | "stale_lock";
  file_id?: string;
  file_name?: string;
  message: string;
  severity: "warning" | "error";
}

export interface BrandViolation {
  type: "color" | "font" | "logo" | "spacing" | "tone" | string;
  location?: string;
  expected?: string;
  found?: string;
  message: string;
  severity: "warning" | "error";
}

export class DocHubError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "DocHubError";
    this.code = code;
    this.details = details;
  }
}
