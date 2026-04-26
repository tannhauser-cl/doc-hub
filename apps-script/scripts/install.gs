/**
 * install.gs — Bootstrap a new tenant on doc-hub.
 *
 * Run this ONCE after pushing the Apps Script project for the first time.
 * It is idempotent — safe to run again without duplicating data.
 *
 * Prerequisites:
 *   1. Set TENANT_CONFIG in Script Properties (Project Settings → Script Properties)
 *      Key: TENANT_CONFIG, Value: the full JSON from tenant.config.json
 *   2. Run setup() from this file
 */

function install() {
  Logger.log('=== DOC HUB INSTALL ===');

  var cfg = getConfig();
  Logger.log('Tenant: ' + cfg.tenantId);
  Logger.log('Shared Drive: ' + cfg.sharedDriveId);

  // 1. Initialize sheet headers
  setup();

  // 2. Install time-based triggers
  var triggerIds = installTriggers();
  Logger.log('Installed triggers: ' + JSON.stringify(triggerIds));

  // 3. Verify Drive folders are accessible
  try {
    DriveApp.getFolderById(cfg.importsFolderId);
    Logger.log('✓ _Imports/ folder accessible');
  } catch (e) {
    Logger.log('✗ _Imports/ folder NOT found: ' + cfg.importsFolderId);
  }
  try {
    DriveApp.getFolderById(cfg.trashFolderId);
    Logger.log('✓ _Trash/ folder accessible');
  } catch (e) {
    Logger.log('✗ _Trash/ folder NOT found: ' + cfg.trashFolderId);
  }
  try {
    DriveApp.getFolderById(cfg.brandKitFolderId);
    Logger.log('✓ Brand-Kit folder accessible');
  } catch (e) {
    Logger.log('✗ Brand-Kit folder NOT found: ' + cfg.brandKitFolderId);
  }

  Logger.log('=== INSTALL COMPLETE ===');
  Logger.log('Next step: Deploy this script as a Web App (Execute as: User accessing, Access: Anyone in domain)');
  Logger.log('Then copy the Web App URL and update webAppUrl in tenant.config.json AND in Script Properties.');
}
