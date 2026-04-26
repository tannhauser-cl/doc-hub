/**
 * linter.gs — Drive linter for naming violations, orphans, duplicates, and stale imports
 */

/**
 * Scans all files in the shared drive and returns a list of violations.
 * Checks: forbidden name patterns, Registry orphans, similar filenames, stale imports.
 * @returns {{violations: Object[]}}
 */
function runLinter() {
  const cfg = getConfig();
  const sharedDriveId = cfg.sharedDriveId;
  const importsFolderId = cfg.importsFolderId;
  const orphanWarningDays = getCfgVal('linter.orphanWarningDays', 7);
  const duplicateThreshold = getCfgVal('linter.duplicateLevenshteinThreshold', 5);
  const forbiddenPatterns = getCfgVal('linter.forbiddenNamePatterns', [
    'Copy of ', ' copy', ' - kopie', 'Untitled', '\\(\\d+\\)$'
  ]);

  const violations = [];

  // Collect all files
  const allFiles = [];
  try {
    const root = DriveApp.getFolderById(sharedDriveId);
    collectFilesRecursive(root, allFiles);
  } catch (e) {
    violations.push({
      fileId: sharedDriveId,
      fileName: '[Shared Drive]',
      folderId: sharedDriveId,
      type: 'error',
      severity: 'error',
      message: `Cannot access shared drive: ${e.message}`
    });
    return { violations };
  }

  // Build a set of all registered file IDs
  const registeredFileIds = new Set();
  try {
    const sheet = getRegistrySheet();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const fileIdCol = headers.indexOf('file_id');
    const statusCol = headers.indexOf('status');
    for (let i = 1; i < data.length; i++) {
      const rowStatus = String(data[i][statusCol]).toLowerCase();
      if (rowStatus !== 'deleted') {
        registeredFileIds.add(data[i][fileIdCol]);
      }
    }
  } catch (e) {
    violations.push({
      fileId: '',
      fileName: 'Registry',
      folderId: '',
      type: 'error',
      severity: 'error',
      message: `Cannot read Registry: ${e.message}`
    });
  }

  const now = new Date();

  for (const fileInfo of allFiles) {
    const { fileId, fileName, folderId, createdDate } = fileInfo;

    // 1. Check forbidden name patterns
    for (const pattern of forbiddenPatterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(fileName)) {
          violations.push({
            fileId,
            fileName,
            folderId,
            type: 'naming',
            severity: 'warning',
            message: `File name matches forbidden pattern "${pattern}"`
          });
          break;
        }
      } catch (e) {
        // Invalid regex pattern — skip
      }
    }

    // 2. Check orphans (files not in Registry)
    // Skip internal system folders: _Trash, Snapshots, Archive
    const isSystemFolder = isInSystemFolder(fileInfo.folderPath || '');
    if (!isSystemFolder && !registeredFileIds.has(fileId)) {
      violations.push({
        fileId,
        fileName,
        folderId,
        type: 'orphan',
        severity: 'warning',
        message: `File "${fileName}" has no Registry entry.`
      });
    }

    // 3. Check stale imports
    if (folderId === importsFolderId && createdDate) {
      const ageMs = now - new Date(createdDate);
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      if (ageDays > orphanWarningDays) {
        violations.push({
          fileId,
          fileName,
          folderId,
          type: 'stale_import',
          severity: 'warning',
          message: `File in _Imports for ${Math.floor(ageDays)} days (threshold: ${orphanWarningDays} days). Consider adopting or deleting.`
        });
      }
    }
  }

  // 4. Check for similar filename pairs using Levenshtein
  for (let i = 0; i < allFiles.length; i++) {
    for (let j = i + 1; j < allFiles.length; j++) {
      const a = allFiles[i].fileName;
      const b = allFiles[j].fileName;
      // Only compare files in the same folder
      if (allFiles[i].folderId !== allFiles[j].folderId) continue;
      const dist = levenshtein(a.toLowerCase(), b.toLowerCase());
      if (dist > 0 && dist <= duplicateThreshold) {
        violations.push({
          fileId: allFiles[i].fileId,
          fileName: a,
          folderId: allFiles[i].folderId,
          type: 'duplicate',
          severity: 'warning',
          message: `Possible duplicate: "${a}" vs "${b}" (edit distance: ${dist})`
        });
      }
    }
  }

  return { violations };
}

/**
 * Recursively collects all files under a folder.
 * @param {GoogleAppsScript.Drive.Folder} folder
 * @param {Array} result - accumulator
 * @param {string} [pathPrefix='']
 */
function collectFilesRecursive(folder, result, pathPrefix) {
  const path = pathPrefix ? `${pathPrefix}/${folder.getName()}` : folder.getName();
  const folderId = folder.getId();

  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    result.push({
      fileId: file.getId(),
      fileName: file.getName(),
      folderId,
      folderPath: path,
      createdDate: file.getDateCreated()
    });
  }

  const subfolders = folder.getFolders();
  while (subfolders.hasNext()) {
    const sub = subfolders.next();
    collectFilesRecursive(sub, result, path);
  }
}

/**
 * Returns true if a folder path contains a system folder name (Archive, Snapshots, _Trash).
 * @param {string} folderPath
 * @returns {boolean}
 */
function isInSystemFolder(folderPath) {
  const systemNames = ['/Archive', '/Snapshots', '/_Trash', '/Archive/', '/Snapshots/', '/_Trash/'];
  return systemNames.some(name => folderPath.includes(name));
}

/**
 * Computes the Levenshtein edit distance between two strings.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Limit comparison to strings of similar length to avoid O(n^2) on very different lengths
  if (Math.abs(a.length - b.length) > 10) return Math.abs(a.length - b.length);

  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Sends an HTML email report of linter violations to the admin email.
 * @param {Object[]} violations
 */
function sendLinterReport(violations) {
  if (!violations || violations.length === 0) return;

  const adminEmail = getCfgVal('adminEmail', '');
  const notifyEmail = getCfgVal('notifyEmail', adminEmail);
  if (!notifyEmail) {
    console.warn('No notifyEmail configured. Skipping linter report email.');
    return;
  }

  const errorCount = violations.filter(v => v.severity === 'error').length;
  const warningCount = violations.filter(v => v.severity === 'warning').length;

  const subject = `[doc-hub] Linter Report: ${errorCount} errors, ${warningCount} warnings`;

  const rows = violations.map(v => `
    <tr>
      <td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(v.severity)}</td>
      <td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(v.type)}</td>
      <td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(v.fileName)}</td>
      <td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(v.message)}</td>
      <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px;color:#666;">${escapeHtml(v.fileId)}</td>
    </tr>
  `).join('');

  const html = `
    <html><body>
      <h2>doc-hub Linter Report</h2>
      <p>Generated: ${new Date().toISOString()}</p>
      <p><strong>${errorCount} errors</strong>, <strong>${warningCount} warnings</strong></p>
      <table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:13px;">
        <thead>
          <tr style="background:#f0f0f0;">
            <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Severity</th>
            <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Type</th>
            <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">File</th>
            <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Message</th>
            <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">File ID</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </body></html>
  `;

  GmailApp.sendEmail(notifyEmail, subject, 'See HTML version.', { htmlBody: html });
}

/**
 * Entry point for the weekly time-based trigger.
 * Runs the linter and sends the report.
 */
function scheduledLinterRun() {
  try {
    const { violations } = runLinter();
    sendLinterReport(violations);
    console.log(`Scheduled linter run complete. ${violations.length} violations found.`);
  } catch (e) {
    console.error('Scheduled linter run failed: ' + (e.message || JSON.stringify(e)));
  }
}

/**
 * Escapes HTML special characters.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
