/**
 * lifecycle.gs — Lifecycle policies, trigger management
 */

/**
 * Runs all lifecycle policies:
 * 1. Purge _Trash/ items past TTL (permanently trashes them in Drive)
 * 2. Scan _Imports/ for stale items past orphanWarningDays
 * Entry point for daily time-based trigger.
 */
function runLifecyclePolicies() {
  console.log('Running lifecycle policies...');
  const cfg = getConfig();
  const now = new Date();

  // --- 1. Purge _Trash items past TTL ---
  const docTtlDays = getCfgVal('trash.docTtlDays', 30);
  const snapshotTtlDays = getCfgVal('trash.snapshotTtlDays', 90);
  const trashFolderId = cfg.trashFolderId;

  if (trashFolderId) {
    try {
      const trashFolder = DriveApp.getFolderById(trashFolderId);
      const trashedFiles = trashFolder.getFiles();
      let purgedCount = 0;

      while (trashedFiles.hasNext()) {
        const file = trashedFiles.next();
        const lastUpdated = file.getLastUpdated();
        const ageDays = (now - lastUpdated) / (1000 * 60 * 60 * 24);
        const fileName = file.getName();

        // Snapshots have __YYYY-MM-DD in name, use longer TTL
        const isSnapshot = fileName.includes('__') && fileName.endsWith('.pdf');
        const ttl = isSnapshot ? snapshotTtlDays : docTtlDays;

        if (ageDays >= ttl) {
          console.log(`Purging "${fileName}" (age: ${Math.floor(ageDays)} days, TTL: ${ttl} days)`);
          try {
            file.setTrashed(true);
            purgedCount++;
          } catch (e) {
            console.warn(`Failed to trash ${file.getId()}: ${e.message}`);
          }
        }
      }
      console.log(`Purged ${purgedCount} files from _Trash.`);
    } catch (e) {
      console.warn(`Cannot access _Trash folder ${trashFolderId}: ${e.message}`);
    }
  } else {
    console.warn('trashFolderId not configured. Skipping trash purge.');
  }

  // --- 2. Scan _Imports for stale items ---
  const importsFolderId = cfg.importsFolderId;
  const orphanWarningDays = getCfgVal('linter.orphanWarningDays', 7);

  if (importsFolderId) {
    try {
      const importsFolder = DriveApp.getFolderById(importsFolderId);
      const importedFiles = importsFolder.getFiles();
      const staleItems = [];

      while (importedFiles.hasNext()) {
        const file = importedFiles.next();
        const createdDate = file.getDateCreated();
        const ageDays = (now - createdDate) / (1000 * 60 * 60 * 24);

        if (ageDays > orphanWarningDays) {
          staleItems.push({
            fileId: file.getId(),
            fileName: file.getName(),
            ageDays: Math.floor(ageDays)
          });
        }
      }

      if (staleItems.length > 0) {
        console.warn(`Found ${staleItems.length} stale items in _Imports:`);
        staleItems.forEach(item => {
          console.warn(`  - "${item.fileName}" (${item.ageDays} days old)`);
        });

        // Optionally notify admin
        const notifyEmail = getCfgVal('notifyEmail', getCfgVal('adminEmail', ''));
        if (notifyEmail && staleItems.length > 0) {
          try {
            sendStaleImportsNotification(notifyEmail, staleItems, orphanWarningDays);
          } catch (e) {
            console.warn('Failed to send stale imports notification: ' + e.message);
          }
        }
      } else {
        console.log('No stale items in _Imports.');
      }
    } catch (e) {
      console.warn(`Cannot access _Imports folder ${importsFolderId}: ${e.message}`);
    }
  } else {
    console.warn('importsFolderId not configured. Skipping stale imports scan.');
  }

  console.log('Lifecycle policies complete.');
}

/**
 * Sends a notification email about stale import files.
 * @param {string} toEmail
 * @param {Object[]} staleItems
 * @param {number} threshold
 */
function sendStaleImportsNotification(toEmail, staleItems, threshold) {
  const subject = `[doc-hub] ${staleItems.length} stale file(s) in _Imports`;
  const rows = staleItems.map(item =>
    `<tr>
      <td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(item.fileName)}</td>
      <td style="padding:4px 8px;border:1px solid #ddd;">${item.ageDays} days</td>
      <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px;color:#666;">${escapeHtml(item.fileId)}</td>
    </tr>`
  ).join('');

  const html = `
    <html><body>
      <h2>doc-hub: Stale Import Files</h2>
      <p>The following files have been in _Imports for more than ${threshold} days and have not been adopted.</p>
      <table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:13px;">
        <thead>
          <tr style="background:#f0f0f0;">
            <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">File Name</th>
            <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Age</th>
            <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">File ID</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#666;font-size:12px;">Generated: ${new Date().toISOString()}</p>
    </body></html>
  `;

  GmailApp.sendEmail(toEmail, subject, 'See HTML version.', { htmlBody: html });
}

/**
 * Installs time-based ScriptApp triggers:
 * - Daily trigger for runLifecyclePolicies
 * - Weekly trigger for scheduledLinterRun
 * Returns a list of created trigger IDs.
 * @returns {{createdTriggers: string[]}}
 */
function installTriggers() {
  // Remove existing triggers for these functions to avoid duplicates
  const fnNames = ['runLifecyclePolicies', 'scheduledLinterRun'];
  const existingTriggers = ScriptApp.getProjectTriggers();
  for (const trigger of existingTriggers) {
    if (fnNames.includes(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
      console.log(`Removed existing trigger for ${trigger.getHandlerFunction()}`);
    }
  }

  const created = [];

  // Daily lifecycle trigger (runs at 2 AM)
  const lifecycleTrigger = ScriptApp.newTrigger('runLifecyclePolicies')
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .create();
  created.push(lifecycleTrigger.getUniqueId());
  console.log(`Created daily lifecycle trigger: ${lifecycleTrigger.getUniqueId()}`);

  // Weekly linter trigger (runs every Monday at 9 AM)
  const linterTrigger = ScriptApp.newTrigger('scheduledLinterRun')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(9)
    .create();
  created.push(linterTrigger.getUniqueId());
  console.log(`Created weekly linter trigger: ${linterTrigger.getUniqueId()}`);

  return { createdTriggers: created };
}

/**
 * Removes all ScriptApp project triggers.
 * Used for clean uninstall.
 * @returns {{removedCount: number}}
 */
function removeTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  let count = 0;
  for (const trigger of triggers) {
    ScriptApp.deleteTrigger(trigger);
    count++;
  }
  console.log(`Removed ${count} trigger(s).`);
  return { removedCount: count };
}
