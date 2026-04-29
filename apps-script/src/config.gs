/**
 * config.gs — Tenant configuration loader
 * Reads TENANT_CONFIG from PropertiesService.getScriptProperties()
 */

/**
 * Returns the parsed tenant configuration object.
 * Throws if TENANT_CONFIG is not set.
 * @returns {Object}
 */
function getConfig() {
  const raw = PropertiesService.getScriptProperties().getProperty('TENANT_CONFIG');
  if (!raw) {
    throw { code: 'CONFIG_MISSING', message: 'TENANT_CONFIG property is not set. Run setup() first.' };
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw { code: 'CONFIG_INVALID', message: 'TENANT_CONFIG is not valid JSON: ' + e.message };
  }
}

/**
 * Retrieves a nested config value by dot-notation key, returning defaultValue if not found.
 * Example: getCfgVal('trash.docTtlDays', 30)
 * @param {string} key - dot-notation path
 * @param {*} defaultValue
 * @returns {*}
 */
function getCfgVal(key, defaultValue) {
  let cfg;
  try {
    cfg = getConfig();
  } catch (e) {
    return defaultValue;
  }
  const parts = key.split('.');
  let current = cfg;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return defaultValue;
    if (!Object.prototype.hasOwnProperty.call(current, part)) return defaultValue;
    current = current[part];
  }
  return current !== undefined && current !== null ? current : defaultValue;
}

/**
 * Returns the Registry sheet object.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getRegistrySheet() {
  const cfg = getConfig();
  const ss = SpreadsheetApp.openById(cfg.registrySheetId);
  const sheet = ss.getSheetByName('Registry');
  if (!sheet) throw { code: 'SHEET_MISSING', message: 'Registry sheet not found in ' + cfg.registrySheetId };
  return sheet;
}

/**
 * Returns the Audit Trail sheet object.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getAuditSheet() {
  const cfg = getConfig();
  const ss = SpreadsheetApp.openById(cfg.auditTrailSheetId);
  const sheet = ss.getSheetByName('AuditTrail');
  if (!sheet) throw { code: 'SHEET_MISSING', message: 'AuditTrail sheet not found in ' + cfg.auditTrailSheetId };
  return sheet;
}

/**
 * Returns the Manifest sheet object.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getManifestSheet() {
  const cfg = getConfig();
  const ss = SpreadsheetApp.openById(cfg.manifestSheetId);
  const sheet = ss.getSheetByName('Manifest');
  if (!sheet) throw { code: 'SHEET_MISSING', message: 'Manifest sheet not found in ' + cfg.manifestSheetId };
  return sheet;
}

/** Valid lifecycle statuses for Registry documents. */
const VALID_DOC_STATUSES = ['draft', 'review', 'approved', 'published', 'archived'];

/** Registry column order (0-indexed) */
const REGISTRY_COLS = {
  doc_id: 0,
  file_id: 1,
  name: 2,
  category: 3,
  folder_path: 4,
  folder_id: 5,
  template_id: 6,
  template_version: 7,
  status: 8,
  created_by: 9,
  created_at: 10,
  last_edited_by: 11,
  last_edited_at: 12,
  owner: 13,
  audience: 14,
  locked_by: 15,
  locked_until: 16,
  supersedes: 17,
  superseded_by: 18,
  snapshots_json: 19,
  imported_from: 20,
  brand_check_status: 21,
  brand_check_at: 22,
  url: 23
};

const REGISTRY_HEADERS = [
  'doc_id', 'file_id', 'name', 'category', 'folder_path', 'folder_id',
  'template_id', 'template_version', 'status', 'created_by', 'created_at',
  'last_edited_by', 'last_edited_at', 'owner', 'audience', 'locked_by',
  'locked_until', 'supersedes', 'superseded_by', 'snapshots_json',
  'imported_from', 'brand_check_status', 'brand_check_at', 'url'
];

/** Manifest column order (0-indexed) */
const MANIFEST_COLS = {
  id: 0,
  category: 1,
  name: 2,
  description: 3,
  template_file_id: 4,
  output_folder_id: 5,
  naming_pattern: 6,
  tokens_schema: 7,
  required_inputs: 8,
  suggested_sources: 9,
  doc_type: 10,
  owner: 11,
  version: 12,
  active: 13
};

const MANIFEST_HEADERS = [
  'id', 'category', 'name', 'description', 'template_file_id', 'output_folder_id',
  'naming_pattern', 'tokens_schema', 'required_inputs', 'suggested_sources',
  'doc_type', 'owner', 'version', 'active'
];

/** Audit Trail column order (0-indexed) */
const AUDIT_COLS = {
  event_id: 0,
  timestamp: 1,
  action: 2,
  file_id: 3,
  doc_id: 4,
  actor: 5,
  payload_json: 6,
  inverse_op_json: 7,
  status: 8
};

const AUDIT_HEADERS = [
  'event_id', 'timestamp', 'action', 'file_id', 'doc_id',
  'actor', 'payload_json', 'inverse_op_json', 'status'
];
