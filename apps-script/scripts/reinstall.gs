/**
 * reinstall.gs — Re-enable doc-hub after an uninstall.
 *
 * Restores triggers. Does not recreate any sheets or folders
 * (they were never deleted). Run from the Apps Script editor.
 */

function reinstall() {
  Logger.log('=== DOC HUB REINSTALL ===');

  var cfg = getConfig();

  // Reinstall triggers
  Logger.log('Installing triggers...');
  var triggerIds = installTriggers();
  Logger.log('✓ Triggers installed: ' + JSON.stringify(triggerIds));

  // Verify sheets are still accessible
  try {
    SpreadsheetApp.openById(cfg.registrySheetId);
    Logger.log('✓ Registry sheet accessible');
  } catch (e) {
    Logger.log('✗ Registry sheet not found — may need to re-run setup()');
  }

  Logger.log('=== REINSTALL COMPLETE ===');
  Logger.log('Re-deploy as Web App if the deployment was deleted during uninstall.');
}
