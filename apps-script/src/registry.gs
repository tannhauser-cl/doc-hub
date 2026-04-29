/**
 * registry.gs — Registry sheet operations and audit trail
 */

/**
 * Acquires the script-level lock, runs fn(), then releases.
 * Serializes concurrent writes to any sheet to prevent race conditions.
 * @param {Function} fn
 * @param {number} [timeoutMs=20000]
 * @returns {*} Return value of fn()
 */
function withScriptLock(fn, timeoutMs) {
  const lock = LockService.getScriptLock();
  const acquired = lock.tryLock(timeoutMs || 20000);
  if (!acquired) {
    throw { code: 'LOCK_TIMEOUT', message: 'Could not acquire script lock within timeout. Try again shortly.' };
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/**
 * Updates the status column of an audit trail event row.
 * Used to mark events as 'undone' after a successful undo.
 * @param {string} eventId
 * @param {string} status - e.g. 'undone'
 */
function markEventStatus(eventId, status) {
  return withScriptLock(function() {
    const sheet = getAuditSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    const eventIdRange = sheet.getRange(1, 1, lastRow, 1);
    const cell = eventIdRange.createTextFinder(eventId).matchEntireCell(true).findNext();
    if (!cell) return;

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const statusCol = headers.indexOf('status') + 1; // 1-indexed
    if (statusCol <= 0) return;
    sheet.getRange(cell.getRow(), statusCol).setValue(status);
  });
}

/**
 * Appends a new row to the Registry sheet.
 * @param {Object} row - Plain object with Registry fields (uses REGISTRY_HEADERS for column ordering)
 */
function registryAppend(row) {
  return withScriptLock(function() {
    const sheet = getRegistrySheet();
    const rowArray = REGISTRY_HEADERS.map(col => {
      const val = row[col];
      return val !== undefined && val !== null ? val : '';
    });
    sheet.appendRow(rowArray);
  });
}

/**
 * Finds a Registry row by file_id and updates the specified columns.
 * Serialized with script lock to prevent concurrent read-modify-write races.
 * @param {string} fileId
 * @param {Object} updates - Key/value pairs of columns to update
 * @returns {boolean} true if found and updated, false if not found
 */
function registryUpdate(fileId, updates) {
  return withScriptLock(function() {
    const sheet = getRegistrySheet();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const fileIdColIndex = headers.indexOf('file_id');

    for (let i = 1; i < data.length; i++) {
      if (data[i][fileIdColIndex] === fileId) {
        for (const [key, value] of Object.entries(updates)) {
          const colIndex = headers.indexOf(key);
          if (colIndex >= 0) {
            sheet.getRange(i + 1, colIndex + 1).setValue(value !== null && value !== undefined ? value : '');
          }
        }
        return true;
      }
    }
    return false;
  });
}

/**
 * Finds and returns a Registry row as a plain object, or null if not found.
 * @param {string} fileId
 * @returns {Object|null}
 */
function registryFind(fileId) {
  const sheet = getRegistrySheet();
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return null;
  const headers = data[0];
  const fileIdColIndex = headers.indexOf('file_id');

  for (let i = 1; i < data.length; i++) {
    if (data[i][fileIdColIndex] === fileId) {
      return rowToObject(data[i], headers);
    }
  }
  return null;
}

/**
 * Searches Registry rows with optional text query, category filter, status filter, and limit.
 * Text match is against name and category columns (case-insensitive).
 * Excludes 'archived' rows by default (unless status filter is explicitly 'archived').
 * @param {string|null} q - Text query
 * @param {string|null} category - Category filter
 * @param {string|null} status - Status filter (null excludes 'archived')
 * @param {number} limit - Max results (default 50)
 * @returns {Object[]}
 */
function registrySearch(q, category, status, limit) {
  const sheet = getRegistrySheet();
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const headers = data[0];
  const maxRows = limit || 50;
  const results = [];
  const qLower = q ? q.toLowerCase() : null;
  const catLower = category ? category.toLowerCase() : null;
  const statusLower = status ? status.toLowerCase() : null;

  for (let i = 1; i < data.length; i++) {
    const row = rowToObject(data[i], headers);

    // Default: exclude archived unless explicitly requested
    const rowStatus = (row.status || '').toLowerCase();
    if (!statusLower && rowStatus === 'archived') continue;
    if (statusLower && rowStatus !== statusLower) continue;

    // Category filter
    if (catLower && (row.category || '').toLowerCase() !== catLower) continue;

    // Text query
    if (qLower) {
      const nameMatch = (row.name || '').toLowerCase().includes(qLower);
      const catMatch = (row.category || '').toLowerCase().includes(qLower);
      if (!nameMatch && !catMatch) continue;
    }

    results.push(row);
    if (results.length >= maxRows) break;
  }
  return results;
}

/**
 * Appends an event to the Audit Trail sheet.
 * Returns the generated eventId.
 * @param {string} action
 * @param {string} fileId
 * @param {string} docId
 * @param {string} actor
 * @param {Object} payload
 * @param {Object|null} inverseOp
 * @returns {string} eventId
 */
function auditLog(action, fileId, docId, actor, payload, inverseOp, status) {
  return withScriptLock(function() {
    const sheet = getAuditSheet();
    const eventId = generateEventId();
    const timestamp = new Date().toISOString();

    const row = [
      eventId,
      timestamp,
      action,
      fileId || '',
      docId || '',
      actor || '',
      payload ? JSON.stringify(payload) : '',
      inverseOp ? JSON.stringify(inverseOp) : '',
      status || 'ok'
    ];
    sheet.appendRow(row);
    return eventId;
  });
}

/**
 * Retrieves a single audit event row by event_id.
 * Uses TextFinder on the event_id column (A) for O(1) amortized lookup.
 * @param {string} eventId
 * @returns {Object|null}
 */
function getAuditEvent(eventId) {
  const sheet = getAuditSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  // Search only in column A (event_id) to avoid false matches in payload JSON
  const eventIdRange = sheet.getRange(1, 1, lastRow, 1);
  const cell = eventIdRange.createTextFinder(eventId).matchEntireCell(true).findNext();
  if (!cell) return null;

  const row = cell.getRow();
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const data = sheet.getRange(row, 1, 1, lastCol).getValues()[0];

  const obj = rowToObject(data, headers);
  if (obj.payload_json) {
    try { obj.payload = JSON.parse(obj.payload_json); } catch (e) { obj.payload = null; }
  }
  if (obj.inverse_op_json) {
    try { obj.inverse_op = JSON.parse(obj.inverse_op_json); } catch (e) { obj.inverse_op = null; }
  }
  return obj;
}

/**
 * Generates a UUID v4.
 * @returns {string}
 */
function generateDocId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generates an event ID in the format evt_YYYYMMDD_HHMMSS_randomHex.
 * @returns {string}
 */
function generateEventId() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timePart = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const randomHex = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  return `evt_${datePart}_${timePart}_${randomHex}`;
}

/**
 * Converts a sheet row array + headers array to a plain object.
 * @param {Array} row
 * @param {string[]} headers
 * @returns {Object}
 */
function rowToObject(row, headers) {
  const obj = {};
  headers.forEach((header, i) => {
    obj[header] = row[i] !== undefined ? row[i] : '';
  });
  return obj;
}

/**
 * Finds all audit events in a time range, optionally filtered by actor.
 * @param {string} since - ISO date string
 * @param {string|null} until - ISO date string
 * @param {string|null} actor
 * @returns {Object[]}
 */
function getAuditEventsBetween(since, until, actor) {
  const sheet = getAuditSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const headers = data[0];
  const sinceDate = new Date(since);
  const untilDate = until ? new Date(until) : new Date();
  const results = [];

  for (let i = 1; i < data.length; i++) {
    const row = rowToObject(data[i], headers);
    const ts = new Date(row.timestamp);
    if (isNaN(ts.getTime())) continue;
    if (ts < sinceDate || ts > untilDate) continue;
    if (actor && row.actor !== actor) continue;
    // Skip already-undone events and undo meta-events
    if (row.status === 'undone' || row.action === 'undoEvent') continue;

    if (row.payload_json) {
      try { row.payload = JSON.parse(row.payload_json); } catch (e) { row.payload = null; }
    }
    if (row.inverse_op_json) {
      try { row.inverse_op = JSON.parse(row.inverse_op_json); } catch (e) { row.inverse_op = null; }
    }
    results.push(row);
  }
  return results;
}
