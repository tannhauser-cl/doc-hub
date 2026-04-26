/**
 * rollback.gs — Undo/rollback operations
 */

/**
 * Undoes a single audit event by executing its inverse_op.
 * @param {string} eventId
 * @returns {{ok: boolean, description: string}}
 */
function undoEvent(eventId) {
  const event = getAuditEvent(eventId);
  if (!event) throw { code: 'EVENT_NOT_FOUND', message: `Audit event ${eventId} not found.` };

  const inverseOp = event.inverse_op;
  if (!inverseOp) {
    return { ok: false, description: `Event ${eventId} has no inverse operation defined.` };
  }

  const description = executeInverseOp(inverseOp, event);

  // Mark the original event as undone in the audit trail
  auditLog('undoEvent', event.file_id, event.doc_id, Session.getActiveUser().getEmail() || 'system',
    { originalEventId: eventId, inverseOp },
    null
  );

  return { ok: true, description };
}

/**
 * Undoes all audit events in a time range, in reverse chronological order.
 * @param {string} since - ISO date string
 * @param {string|null} until - ISO date string
 * @param {string|null} actor - Filter by actor
 * @returns {{results: Array}}
 */
function undoBatch(since, until, actor) {
  if (!since) throw { code: 'MISSING_PARAM', message: 'since is required for undoBatch' };

  const events = getAuditEventsBetween(since, until, actor);

  // Sort descending (most recent first) so we reverse them in order
  events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const results = [];
  for (const event of events) {
    try {
      const result = undoEvent(event.event_id);
      results.push({ eventId: event.event_id, ok: result.ok, description: result.description });
    } catch (err) {
      results.push({
        eventId: event.event_id,
        ok: false,
        description: err.message || JSON.stringify(err)
      });
    }
  }

  return { results };
}

/**
 * Executes an inverse operation as defined in the audit trail.
 * Supports: restoreFromTrash, moveToFolder, archiveDoc, updateStatus, noop, deleteSnapshot, unlockDoc
 * @param {Object} inverseOp
 * @param {Object} originalEvent
 * @returns {string} Human-readable description of what was done
 */
function executeInverseOp(inverseOp, originalEvent) {
  const action = inverseOp.action;

  switch (action) {
    case 'noop':
      return inverseOp.description || 'No-op inverse: nothing to undo.';

    case 'archiveDoc': {
      const fileId = inverseOp.fileId || originalEvent.file_id;
      try {
        archiveDoc(fileId, 'system-undo');
        return `Archived file ${fileId} as part of undo.`;
      } catch (e) {
        return `Failed to archive ${fileId}: ${e.message || JSON.stringify(e)}`;
      }
    }

    case 'updateStatus': {
      const fileId = inverseOp.fileId || originalEvent.file_id;
      const status = inverseOp.status;
      if (!status) return 'No status to restore.';
      registryUpdate(fileId, { status, last_edited_by: 'system-undo', last_edited_at: new Date().toISOString() });
      return `Restored status of ${fileId} to "${status}".`;
    }

    case 'restoreFromTrash': {
      const fileId = inverseOp.fileId || originalEvent.file_id;
      restoreFromTrash(fileId);
      return `Restored file ${fileId} from trash.`;
    }

    case 'moveToFolder': {
      const fileId = inverseOp.fileId || originalEvent.file_id;
      const targetFolderId = inverseOp.folderId;
      if (!targetFolderId) return 'No target folder specified for moveToFolder inverse.';
      const file = DriveApp.getFileById(fileId);
      const targetFolder = DriveApp.getFolderById(targetFolderId);
      file.moveTo(targetFolder);
      registryUpdate(fileId, {
        folder_id: targetFolderId,
        folder_path: targetFolder.getName(),
        last_edited_by: 'system-undo',
        last_edited_at: new Date().toISOString()
      });
      return `Moved file ${fileId} to folder ${targetFolderId}.`;
    }

    case 'restoreFromArchive': {
      const fileId = inverseOp.fileId || originalEvent.file_id;
      const originalFolderId = inverseOp.originalFolderId;
      if (!originalFolderId) return 'No original folder ID for restoreFromArchive.';
      const file = DriveApp.getFileById(fileId);
      const originalFolder = DriveApp.getFolderById(originalFolderId);
      file.moveTo(originalFolder);
      registryUpdate(fileId, {
        status: 'draft',
        folder_id: originalFolderId,
        folder_path: originalFolder.getName(),
        last_edited_by: 'system-undo',
        last_edited_at: new Date().toISOString()
      });
      return `Moved file ${fileId} back from archive to folder ${originalFolderId}.`;
    }

    case 'deleteSnapshot': {
      const snapshotFileId = inverseOp.fileId;
      if (!snapshotFileId) return 'No snapshot file ID to delete.';
      try {
        DriveApp.getFileById(snapshotFileId).setTrashed(true);
        return `Deleted snapshot file ${snapshotFileId}.`;
      } catch (e) {
        return `Failed to delete snapshot ${snapshotFileId}: ${e.message}`;
      }
    }

    case 'unlockDoc': {
      const fileId = inverseOp.fileId || originalEvent.file_id;
      unlockDoc(fileId, 'system-undo');
      return `Unlocked file ${fileId}.`;
    }

    case 'lockDoc': {
      const fileId = inverseOp.fileId || originalEvent.file_id;
      const lockedBy = inverseOp.lockedBy;
      lockDoc(fileId, lockedBy || 'system-undo', 30);
      return `Re-locked file ${fileId} for ${lockedBy || 'system-undo'}.`;
    }

    case 'moveToImports': {
      const fileId = inverseOp.fileId || originalEvent.file_id;
      const importsFolderId = inverseOp.folderId;
      if (!importsFolderId) return 'No imports folder ID specified.';
      try {
        const file = DriveApp.getFileById(fileId);
        const importsFolder = DriveApp.getFolderById(importsFolderId);
        file.moveTo(importsFolder);
        return `Moved file ${fileId} back to _Imports.`;
      } catch (e) {
        return `Failed to move ${fileId} to imports: ${e.message}`;
      }
    }

    default:
      return `Unknown inverse action "${action}". No operation performed.`;
  }
}

/**
 * Soft-deletes a file by moving it to the _Trash/ folder and marking it deleted in Registry.
 * Does NOT permanently delete the Drive file.
 * @param {string} fileId
 * @param {string} registryDocId
 */
function softDelete(fileId, registryDocId) {
  const cfg = getConfig();
  const trashFolderId = cfg.trashFolderId;
  if (!trashFolderId) throw { code: 'NO_TRASH_FOLDER', message: 'trashFolderId not configured in TENANT_CONFIG.' };

  const reg = registryFind(fileId) || { doc_id: registryDocId, folder_id: '', folder_path: '' };

  const file = DriveApp.getFileById(fileId);
  const trashFolder = DriveApp.getFolderById(trashFolderId);

  // Record original location before moving
  let originalFolderId = reg.folder_id;
  if (!originalFolderId) {
    const parents = file.getParents();
    if (parents.hasNext()) originalFolderId = parents.next().getId();
  }

  file.moveTo(trashFolder);

  const now = new Date().toISOString();
  registryUpdate(fileId, {
    status: 'deleted',
    folder_id: trashFolderId,
    folder_path: '_Trash',
    last_edited_at: now
  });

  auditLog('softDelete', fileId, reg.doc_id || registryDocId, Session.getActiveUser().getEmail() || 'system',
    { originalFolderId, trashFolderId },
    { action: 'restoreFromTrash', fileId, originalFolderId, description: `Move ${fileId} back from trash to ${originalFolderId}` }
  );
}

/**
 * Restores a file from the _Trash/ folder back to its original folder.
 * @param {string} fileId
 */
function restoreFromTrash(fileId) {
  // Find the most recent softDelete event for this file to know the original folder
  const sheet = getAuditSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  let originalFolderId = null;
  for (let i = data.length - 1; i >= 1; i--) {
    const row = rowToObject(data[i], headers);
    if (row.file_id === fileId && row.action === 'softDelete') {
      try {
        const payload = JSON.parse(row.payload_json);
        originalFolderId = payload.originalFolderId;
      } catch (e) {}
      break;
    }
  }

  if (!originalFolderId) {
    throw { code: 'NO_ORIGINAL_FOLDER', message: `Cannot find original folder for file ${fileId}. Check audit trail.` };
  }

  const file = DriveApp.getFileById(fileId);
  const originalFolder = DriveApp.getFolderById(originalFolderId);
  file.moveTo(originalFolder);

  const now = new Date().toISOString();
  registryUpdate(fileId, {
    status: 'draft',
    folder_id: originalFolderId,
    folder_path: originalFolder.getName(),
    last_edited_at: now
  });

  auditLog('restoreFromTrash', fileId, '', Session.getActiveUser().getEmail() || 'system',
    { originalFolderId },
    { action: 'softDelete', fileId, description: `Soft-delete to re-trash` }
  );
}
