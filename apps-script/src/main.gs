/**
 * main.gs — Web App entry points
 * Routes GET/POST requests to action handlers.
 * All responses are JSON.
 *
 * AUTH MODEL:
 *   - doGet: serves sidebar and read-only endpoints (listTemplates, getBrandTokens) without auth.
 *     Apps Script Web Apps don't expose HTTP headers, so GET auth is impractical.
 *   - doPost: ALL actions require a valid `token` field in the JSON body, checked against
 *     the API_TOKEN Script Property (set in Apps Script Editor → Project Settings).
 *     Administrative actions (seedManifest, setupBrandedTemplates, createNDATemplate, getStats)
 *     have been moved from GET to POST to prevent side-effects from crawlers/link-previewers.
 */

/**
 * Validates the token in a POST body against API_TOKEN Script Property.
 * Throws an error object (caught by doPost) if invalid.
 * @param {Object} body - Parsed POST JSON body
 */
function requireAuth(body) {
  var expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!expected) {
    throw { code: 'SERVER_MISCONFIGURED', message: 'API_TOKEN not set in Script Properties. See setup docs.' };
  }
  var token = body.token || null;
  if (!token || token !== expected) {
    throw { code: 'UNAUTHORIZED', message: 'Missing or invalid token.' };
  }
}

/**
 * HTTP GET handler.
 * Serves the sidebar and read-only, non-sensitive endpoints without auth.
 * All mutating/administrative actions have been moved to doPost.
 */
function doGet(e) {
  try {
    const action = e.parameter && e.parameter.action;

    // Serve sidebar as standalone web page (no action or action='sidebar')
    if (!action || action === 'sidebar') {
      try {
        const webAppUrl = ScriptApp.getService().getUrl();
        let html = HtmlService.createHtmlOutputFromFile('src/Sidebar').getContent();
        html = html.split('{{WEB_APP_URL}}').join(webAppUrl);
        return HtmlService.createHtmlOutput(html)
          .setTitle('🦊 DOC HUB')
          .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
      } catch(htmlErr) {
        return HtmlService.createHtmlOutput(
          '<html><body style="font-family:sans-serif;padding:24px">' +
          '<h2 style="color:#7B1FA2">🦊 DOC HUB</h2>' +
          '<p>Error loading sidebar: ' + htmlErr.message + '</p>' +
          '</body></html>'
        ).setTitle('DOC HUB - Error');
      }
    }

    switch (action) {
      case 'listTemplates': {
        const category = e.parameter.category || null;
        const templates = listTemplates(category);
        return jsonResponse({ ok: true, templates });
      }
      case 'getBrandTokens': {
        const tokens = getBrandTokens();
        return jsonResponse({ ok: true, ...tokens });
      }
      default:
        return jsonResponse({ ok: false, error: `Unknown GET action: ${action}. Administrative actions require POST with token.` });
    }
  } catch (err) {
    return jsonResponse(serializeError(err));
  }
}

/**
 * HTTP POST handler.
 * ALL actions require a valid `token` field in the JSON body.
 * Administrative/mutating actions that were previously on GET are now here.
 */
function doPost(e) {
  try {
    let body = {};
    if (e.postData && e.postData.contents) {
      try {
        body = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        return jsonResponse({ ok: false, error: 'Invalid JSON body: ' + parseErr.message });
      }
    }

    const action = body.action;
    if (!action) {
      return jsonResponse({ ok: false, error: 'Missing action field in request body' });
    }

    // All POST actions require a valid token
    requireAuth(body);

    switch (action) {
      // --- Document operations ---
      case 'renderTemplate': {
        const result = renderTemplate(body.id, body.inputs || {}, body.createdBy);
        return jsonResponse(result);
      }
      case 'searchDocs': {
        const docs = searchDocs(body.q || null, body.category || null, body.status || null, body.limit || 50);
        return jsonResponse({ ok: true, docs });
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

      // --- Administrative actions (moved from GET) ---
      case 'getStats': {
        const cfg = getConfig();
        const regSheet = getRegistrySheet();
        const mfSheet = SpreadsheetApp.openById(cfg.manifestSheetId).getSheetByName('Manifest');
        return jsonResponse({
          ok: true,
          registry_rows: Math.max(0, regSheet.getLastRow() - 1),
          manifest_rows: mfSheet ? Math.max(0, mfSheet.getLastRow() - 1) : 0,
          tenant: cfg.tenantId
        });
      }
      case 'seedManifest': {
        const result = seedManifestKuillV1();
        return jsonResponse(result);
      }
      case 'setupBrandedTemplates': {
        const result = setupBrandedTemplatesKuillV1();
        return jsonResponse(result);
      }
      case 'createNDATemplate': {
        const result = createNDATemplate();
        return jsonResponse(result);
      }

      default:
        return jsonResponse({ ok: false, error: `Unknown POST action: ${action}` });
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
      return { ok: false, error: err.message || err.code, code: err.code, details: err };
    }
    if (err instanceof Error) {
      return { ok: false, error: err.message, stack: err.stack };
    }
    return { ok: false, error: JSON.stringify(err) };
  }
  return { ok: false, error: String(err) };
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
          body.clear();
          body.appendParagraph(op.content);
        }
      }
    }
    doc.saveAndClose();
  } else {
    throw { code: 'UNSUPPORTED_MIME', message: `editDoc only supports Google Docs. Got: ${mimeType}` };
  }

  const now = new Date().toISOString();
  registryUpdate(fileId, { last_edited_by: editedBy, last_edited_at: now });

  const eventId = auditLog('editDoc', fileId, reg ? reg.doc_id : '', editedBy,
    { ops, editedBy },
    { action: 'noop', fileId, description: 'Edit operations cannot be automatically reversed' }
  );

  const revisionId = `rev_${fileId}_${Date.now()}`;
  return { revisionId };
}
