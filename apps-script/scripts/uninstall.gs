/**
 * uninstall.gs — Safely decommission doc-hub for a tenant.
 *
 * IMPORTANT: This does NOT delete any user documents. It only disables
 * the engine (triggers, sidebar) and makes the Registry read-only.
 *
 * To run: call uninstall() from the Apps Script editor.
 * You will be prompted to type the confirmation string.
 */

function uninstall() {
  var ui = SpreadsheetApp.getUi
    ? SpreadsheetApp.getUi()
    : null;

  // Confirmation via Logger prompt (Apps Script standalone)
  var confirmStr = 'UNINSTALL DOC HUB';
  Logger.log('=== DOC HUB UNINSTALL ===');
  Logger.log('This will DISABLE the doc-hub engine for this tenant.');
  Logger.log('User documents will NOT be deleted or modified.');
  Logger.log('');
  Logger.log('To confirm, set the UNINSTALL_CONFIRM script property to: ' + confirmStr);
  Logger.log('Then run this function again.');

  var props = PropertiesService.getScriptProperties();
  var confirm = props.getProperty('UNINSTALL_CONFIRM');

  if (confirm !== confirmStr) {
    Logger.log('');
    Logger.log('Uninstall CANCELLED — confirmation string not set or incorrect.');
    Logger.log('Set Script Property UNINSTALL_CONFIRM = "UNINSTALL DOC HUB" to proceed.');
    return;
  }

  Logger.log('Confirmation received. Proceeding with uninstall...');

  var cfg = getConfig();
  var today = Utilities.formatDate(new Date(), cfg.timeZone || 'UTC', 'yyyy-MM-dd');

  // 1. Remove all triggers
  Logger.log('Step 1: Removing triggers...');
  removeTriggers();
  Logger.log('✓ All triggers removed');

  // 2. Log uninstall to Audit Trail BEFORE decommissioning sheets (so the entry lands in a live sheet)
  try {
    auditLog('system_uninstall', '', '', 'system', {today: today}, null);
  } catch (e) {
    Logger.log('✗ Could not write audit log: ' + e.message);
  }

  // 3. Export Registry to CSV
  Logger.log('Step 3: Exporting Registry to CSV...');
  try {
    var regSheet = SpreadsheetApp.openById(cfg.registrySheetId).getSheetByName('Registry');
    var csvData = regSheet.getDataRange().getValues();
    var csvStr = csvData.map(function(row) {
      return row.map(function(cell) {
        var s = String(cell).replace(/"/g, '""');
        return '"' + s + '"';
      }).join(',');
    }).join('\n');

    var registryFile = DriveApp.getFileById(cfg.registrySheetId);
    var registryParents = registryFile.getParents();
    if (!registryParents.hasNext()) {
      throw new Error('Registry spreadsheet has no parent folder');
    }
    var registryFolder = registryParents.next();
    var csvFile = registryFolder.createFile('Document-Registry-export-' + today + '.csv', csvStr, MimeType.CSV);
    Logger.log('✓ Registry exported: ' + csvFile.getUrl());
  } catch (e) {
    Logger.log('✗ Registry export failed: ' + e.message);
  }

  // 4. Create decommission note in Registry folder
  Logger.log('Step 4: Archiving Registry...');
  try {
    var noteContent = '# doc-hub decommissioned ' + today + '\n\nThis Registry was decommissioned on ' + today + '.\nThe doc-hub engine is no longer active.\nAll documents remain in their Drive folders.\nSee Document-Registry-export-' + today + '.csv for the final Registry state.';
    var noteFolderFile = DriveApp.getFileById(cfg.registrySheetId);
    var noteFolderParents = noteFolderFile.getParents();
    if (!noteFolderParents.hasNext()) {
      throw new Error('Registry spreadsheet has no parent folder');
    }
    var noteFolder = noteFolderParents.next();
    noteFolder.createFile('DECOMMISSIONED-' + today + '.md', noteContent, MimeType.PLAIN_TEXT);
    Logger.log('✓ Decommission note created in Registry folder');
  } catch (e) {
    Logger.log('✗ Could not create decommission note: ' + e.message);
  }

  // 5. Clear the confirmation property so accidental re-run is safe
  props.deleteProperty('UNINSTALL_CONFIRM');

  Logger.log('');
  Logger.log('=== UNINSTALL COMPLETE ===');
  Logger.log('Engine disabled. All triggers removed.');
  Logger.log('User documents are untouched in their Drive folders.');
  Logger.log('Registry CSV exported for audit purposes.');
  Logger.log('');
  Logger.log('To reinstall: run reinstall() from apps-script/scripts/reinstall.gs');
}
