/**
 * setup.gs — Idempotent system bootstrap
 * Creates Registry, Manifest, and Audit-Trail sheets with correct headers
 * if they do not already exist. Safe to run multiple times.
 */

/**
 * Main setup entry point. Idempotent bootstrap for the entire system.
 * Creates sheets and Drive folders as needed based on TENANT_CONFIG.
 */
function setup() {
  console.log('doc-hub setup starting...');

  const cfg = getConfig();

  // Log all IDs so we can spot missing values immediately
  console.log('Config loaded. Key IDs:');
  console.log('  registrySheetId   = ' + cfg.registrySheetId);
  console.log('  auditTrailSheetId = ' + cfg.auditTrailSheetId);
  console.log('  manifestSheetId   = ' + cfg.manifestSheetId);
  console.log('  brandKitFolderId  = ' + cfg.brandKitFolderId);
  console.log('  importsFolderId   = ' + cfg.importsFolderId);
  console.log('  trashFolderId     = ' + cfg.trashFolderId);

  if (!cfg.registrySheetId) throw new Error('registrySheetId is missing from TENANT_CONFIG');
  if (!cfg.auditTrailSheetId) throw new Error('auditTrailSheetId is missing from TENANT_CONFIG');
  if (!cfg.manifestSheetId) throw new Error('manifestSheetId is missing from TENANT_CONFIG');

  // --- Registry sheet ---
  console.log('Verifying Registry sheet...');
  getOrCreateSheet(cfg.registrySheetId, 'Registry', REGISTRY_HEADERS);

  // --- Audit Trail sheet ---
  console.log('Verifying AuditTrail sheet...');
  getOrCreateSheet(cfg.auditTrailSheetId, 'AuditTrail', AUDIT_HEADERS);

  // --- Manifest sheet ---
  console.log('Verifying Manifest sheet...');
  getOrCreateSheet(cfg.manifestSheetId, 'Manifest', MANIFEST_HEADERS);

  // --- _Imports folder ---
  if (cfg.importsFolderId) {
    try {
      DriveApp.getFolderById(cfg.importsFolderId);
      console.log('_Imports folder verified: ' + cfg.importsFolderId);
    } catch (e) {
      console.warn('_Imports folder not accessible: ' + cfg.importsFolderId + ' — ' + e.message);
    }
  } else {
    console.warn('importsFolderId not set in TENANT_CONFIG. Skipping _Imports folder check.');
  }

  // --- _Trash folder ---
  if (cfg.trashFolderId) {
    try {
      DriveApp.getFolderById(cfg.trashFolderId);
      console.log('_Trash folder verified: ' + cfg.trashFolderId);
    } catch (e) {
      console.warn('_Trash folder not accessible: ' + cfg.trashFolderId + ' — ' + e.message);
    }
  } else {
    console.warn('trashFolderId not set in TENANT_CONFIG. Skipping _Trash folder check.');
  }

  // --- Brand Kit folder ---
  if (cfg.brandKitFolderId) {
    try {
      DriveApp.getFolderById(cfg.brandKitFolderId);
      console.log('Brand Kit folder verified: ' + cfg.brandKitFolderId);
    } catch (e) {
      console.warn('Brand Kit folder not accessible: ' + cfg.brandKitFolderId + ' — ' + e.message);
    }
  }

  console.log('doc-hub setup complete.');
  return { ok: true, message: 'Setup complete.' };
}

/**
 * Gets or creates a sheet with the given name in the given spreadsheet.
 * If the sheet does not exist, creates it and writes the headers row.
 * If the sheet exists but has no headers row, writes the headers.
 * @param {string} spreadsheetId
 * @param {string} sheetName
 * @param {string[]} headers
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getOrCreateSheet(spreadsheetId, sheetName, headers) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    console.log(`Creating sheet "${sheetName}" in spreadsheet ${spreadsheetId}`);
    sheet = ss.insertSheet(sheetName);
  }

  // Write headers if the first row is empty
  const firstRowValues = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const isEmpty = firstRowValues.every(v => v === '' || v === null || v === undefined);

  if (isEmpty) {
    console.log(`Writing headers for "${sheetName}"`);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else {
    console.log(`Sheet "${sheetName}" already has headers, skipping.`);
  }

  return sheet;
}
