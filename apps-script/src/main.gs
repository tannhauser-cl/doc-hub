/**
 * main.gs — Web App entry points
 * Routes GET/POST requests to action handlers.
 * All responses are JSON.
 */

/**
 * HTTP GET handler.
 * Reads `action` from query params.
 */
function doGet(e) {
  try {
    const action = e.parameter && e.parameter.action;
    if (!action) {
      return jsonResponse({ error: 'Missing action parameter' });
    }

    switch (action) {
      case 'listTemplates': {
        const category = e.parameter.category || null;
        const templates = listTemplates(category);
        return jsonResponse({ templates });
      }
      case 'getBrandTokens': {
        const tokens = getBrandTokens();
        return jsonResponse(tokens);
      }
      case 'seedManifest': {
        const result = seedManifestKuillV1();
        return jsonResponse(result);
      }
      case 'getStats': {
        const cfg = getConfig();
        const regSheet = getRegistrySheet();
        const mfSheet = SpreadsheetApp.openById(cfg.manifestSheetId).getSheetByName('Manifest');
        return jsonResponse({
          registry_rows: Math.max(0, regSheet.getLastRow() - 1),
          manifest_rows: mfSheet ? Math.max(0, mfSheet.getLastRow() - 1) : 0,
          tenant: cfg.tenantId
        });
      }
      default:
        return jsonResponse({ error: `Unknown GET action: ${action}` });
    }
  } catch (err) {
    return jsonResponse(serializeError(err));
  }
}

/**
 * HTTP POST handler.
 * Reads `action` from JSON body.
 */
function doPost(e) {
  try {
    let body = {};
    if (e.postData && e.postData.contents) {
      try {
        body = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        return jsonResponse({ error: 'Invalid JSON body: ' + parseErr.message });
      }
    }

    const action = body.action;
    if (!action) {
      return jsonResponse({ error: 'Missing action field in request body' });
    }

    switch (action) {
      case 'renderTemplate': {
        const result = renderTemplate(body.id, body.inputs || {}, body.createdBy);
        return jsonResponse(result);
      }
      case 'searchDocs': {
        const docs = searchDocs(body.q || null, body.category || null, body.status || null, body.limit || 50);
        return jsonResponse({ docs });
      }
      case 'readDoc': {
        const result = readDoc(body.fileId);
        return jsonResponse(result);
      }
      case 'editDoc': {
        const result = editDoc(body.fileId, body.ops || [], body.editedBy);
        return jsonResponse(result);
      }
      case 'snapshotDoc': {
        const result = snapshotDoc(body.fileId, body.snapshotBy);
        return jsonResponse(result);
      }
      case 'supersedeDoc': {
        const result = supersedeDoc(body.fileId, body.supersededBy);
        return jsonResponse(result);
      }
      case 'archiveDoc': {
        archiveDoc(body.fileId, body.archivedBy);
        return jsonResponse({ ok: true });
      }
      case 'adoptFile': {
        const result = adoptFile(body.fileId, body.category, body.name, body.audience, body.adoptedBy);
        return jsonResponse(result);
      }
      case 'createBlank': {
        const result = createBlank(body.category, body.title, body.audience, body.docType, body.createdBy);
        return jsonResponse(result);
      }
      case 'lockDoc': {
        const result = lockDoc(body.fileId, body.lockedBy, body.ttlMinutes || null);
        return jsonResponse(result);
      }
      case 'unlockDoc': {
        const result = unlockDoc(body.fileId, body.unlockedBy);
        return jsonResponse(result);
      }
      case 'undoEvent': {
        const result = undoEvent(body.eventId);
        return jsonResponse(result);
      }
      case 'undoBatch': {
        const result = undoBatch(body.since, body.until || null, body.actor || null);
        return jsonResponse(result);
      }
      case 'brandCheck': {
        const result = brandCheck(body.fileId);
        return jsonResponse(result);
      }
      case 'runLinter': {
        const result = runLinter();
        return jsonResponse(result);
      }
      case 'updateStatus': {
        updateDocStatus(body.fileId, body.status, body.updatedBy);
        return jsonResponse({ ok: true });
      }
      default:
        return jsonResponse({ error: `Unknown POST action: ${action}` });
    }
  } catch (err) {
    return jsonResponse(serializeError(err));
  }
}

/**
 * Wraps an object as a JSON ContentService output.
 * @param {Object} obj
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Converts a thrown error (object or Error instance) to a serializable object.
 * @param {*} err
 * @returns {Object}
 */
function serializeError(err) {
  if (err && typeof err === 'object') {
    if (err.code) {
      // Structured error thrown by our code
      return { error: err.message || err.code, code: err.code, details: err };
    }
    if (err instanceof Error) {
      return { error: err.message, stack: err.stack };
    }
    return { error: JSON.stringify(err) };
  }
  return { error: String(err) };
}

/**
 * editDoc — Applies a list of edit operations to a Google Doc.
 * ops: [{type: "replace"|"append"|"prepend", section?: string, content: string}]
 * @param {string} fileId
 * @param {Array} ops
 * @param {string} editedBy
 * @returns {{revisionId: string}}
 */
function editDoc(fileId, ops, editedBy) {
  const reg = registryFind(fileId);
  const lock = checkLock(fileId);
  if (lock && lock.lockedBy !== editedBy) {
    throw { code: 'DOC_LOCKED', message: `Document is locked by ${lock.lockedBy} until ${lock.lockedUntil}` };
  }

  const file = DriveApp.getFileById(fileId);
  const mimeType = file.getMimeType();

  if (mimeType === MimeType.GOOGLE_DOCS) {
    const doc = DocumentApp.openById(fileId);
    const body = doc.getBody();

    for (const op of ops) {
      if (op.type === 'append') {
        body.appendParagraph(op.content);
      } else if (op.type === 'prepend') {
        body.insertParagraph(0, op.content);
      } else if (op.type === 'replace') {
        if (op.section) {
          body.replaceText(op.section, op.content);
        } else {
          // Replace entire body text
          body.clear();
          body.appendParagraph(op.content);
        }
      }
    }
    doc.saveAndClose();
  } else {
    throw { code: 'UNSUPPORTED_MIME', message: `editDoc only supports Google Docs. Got: ${mimeType}` };
  }

  // Update registry
  const now = new Date().toISOString();
  registryUpdate(fileId, { last_edited_by: editedBy, last_edited_at: now });

  // Log audit
  const eventId = auditLog('editDoc', fileId, reg ? reg.doc_id : '', editedBy,
    { ops, editedBy },
    { action: 'noop', fileId, description: 'Edit operations cannot be automatically reversed' }
  );

  // Return a pseudo revision ID (Drive API revision IDs require Drive Advanced Service)
  const revisionId = `rev_${fileId}_${Date.now()}`;
  return { revisionId };
}
