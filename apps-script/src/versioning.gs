/**
 * versioning.gs — Snapshot, supersede, archive, adopt, and status operations
 */

/**
 * Creates a PDF snapshot of a document, saves it to the Snapshots subfolder,
 * computes a SHA256 hash, updates the Registry, and logs the audit event.
 * @param {string} fileId
 * @param {string} snapshotBy
 * @returns {{snapshotUrl: string, hash: string, snapshotName: string}}
 */
function snapshotDoc(fileId, snapshotBy) {
  const reg = registryFind(fileId);
  if (!reg) throw { code: 'NOT_IN_REGISTRY', message: `File ${fileId} is not in the Registry.` };

  const cfg = getConfig();
  const snapshotsFolderName = cfg.snapshotsFolderName || 'Snapshots';

  // Get or create Snapshots subfolder inside the document's parent folder
  let parentFolder;
  try {
    parentFolder = DriveApp.getFolderById(reg.folder_id);
  } catch (e) {
    // Fall back to file's actual parent
    const file = DriveApp.getFileById(fileId);
    const parents = file.getParents();
    if (parents.hasNext()) {
      parentFolder = parents.next();
    } else {
      throw { code: 'NO_PARENT_FOLDER', message: 'Cannot determine parent folder for snapshot.' };
    }
  }

  let snapshotsFolder;
  const existingFolders = parentFolder.getFoldersByName(snapshotsFolderName);
  if (existingFolders.hasNext()) {
    snapshotsFolder = existingFolders.next();
  } else {
    snapshotsFolder = parentFolder.createFolder(snapshotsFolderName);
  }

  // Export as PDF
  const file = DriveApp.getFileById(fileId);
  const pdfBlob = file.getAs(MimeType.PDF);

  // Generate snapshot name with timestamp
  const now = new Date();
  const ts = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd-HHmm');
  const safeName = (reg.name || 'snapshot').replace(/[^a-zA-Z0-9\-_ ]/g, '');
  const snapshotName = `${safeName}__${ts}.pdf`;

  pdfBlob.setName(snapshotName);
  const snapshotFile = snapshotsFolder.createFile(pdfBlob);

  // Make snapshot read-only (viewer access only; remove editors)
  const snapshotId = snapshotFile.getId();
  snapshotFile.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);

  const snapshotUrl = snapshotFile.getUrl();

  // Compute SHA256 hash of PDF bytes
  const bytes = pdfBlob.getBytes();
  const hashBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  const hash = hashBytes.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');

  // Append snapshot record to snapshots_json in Registry
  const existingSnapshotsJson = reg.snapshots_json || '[]';
  let snapshots;
  try { snapshots = JSON.parse(existingSnapshotsJson); } catch (e) { snapshots = []; }
  if (!Array.isArray(snapshots)) snapshots = [];

  snapshots.push({
    snapshotName,
    snapshotUrl,
    snapshotFileId: snapshotId,
    hash,
    createdAt: now.toISOString(),
    createdBy: snapshotBy
  });

  registryUpdate(fileId, {
    snapshots_json: JSON.stringify(snapshots),
    last_edited_by: snapshotBy,
    last_edited_at: now.toISOString()
  });

  auditLog('snapshotDoc', fileId, reg.doc_id, snapshotBy,
    { snapshotName, snapshotUrl, hash },
    { action: 'deleteSnapshot', fileId: snapshotId, description: `Delete snapshot file ${snapshotId} to undo` }
  );

  return { snapshotUrl, hash, snapshotName };
}

/**
 * Supersedes a document: moves old doc to Archive, creates a new doc from the same template
 * (or copies the old one and clears its content), updates Registry for both, and audits.
 * @param {string} fileId - The file being superseded
 * @param {string} supersededBy - User performing the action
 * @returns {{newFileId: string, newUrl: string, newName: string}}
 */
function supersedeDoc(fileId, supersededBy) {
  const reg = registryFind(fileId);
  if (!reg) throw { code: 'NOT_IN_REGISTRY', message: `File ${fileId} is not in the Registry.` };

  // Archive the old document
  const archiveFolderName = getConfig().archiveFolderName || 'Archive';
  const file = DriveApp.getFileById(fileId);

  let parentFolder;
  try {
    parentFolder = DriveApp.getFolderById(reg.folder_id);
  } catch (e) {
    const parents = file.getParents();
    parentFolder = parents.hasNext() ? parents.next() : null;
  }

  if (!parentFolder) throw { code: 'NO_PARENT_FOLDER', message: 'Cannot determine parent folder.' };

  // Get/create Archive subfolder
  let archiveFolder;
  const existing = parentFolder.getFoldersByName(archiveFolderName);
  if (existing.hasNext()) {
    archiveFolder = existing.next();
  } else {
    archiveFolder = parentFolder.createFolder(archiveFolderName);
  }

  // Move old file to Archive
  file.moveTo(archiveFolder);

  // Create a new document — copy old file and clear its content
  const now = new Date();
  const newName = `${reg.name || 'Untitled'} (v${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')})`;
  const newFile = file.makeCopy(newName, parentFolder);
  const newFileId = newFile.getId();
  const newUrl = newFile.getUrl();

  // Clear content of new file
  const mimeType = newFile.getMimeType();
  if (mimeType === MimeType.GOOGLE_DOCS) {
    const doc = DocumentApp.openById(newFileId);
    doc.getBody().clear();
    doc.saveAndClose();
  } else if (mimeType === MimeType.GOOGLE_SLIDES) {
    const pres = SlidesApp.openById(newFileId);
    const slides = pres.getSlides();
    for (let i = slides.length - 1; i > 0; i--) slides[i].remove();
    if (slides.length > 0) {
      slides[0].getShapes().forEach(s => { try { s.getText().setText(''); } catch (e) {} });
    }
    pres.saveAndClose();
  }

  const nowIso = now.toISOString();

  // Update old doc in registry
  registryUpdate(fileId, {
    status: 'archived',
    superseded_by: newFileId,
    last_edited_by: supersededBy,
    last_edited_at: nowIso,
    folder_id: archiveFolder.getId(),
    folder_path: `${parentFolder.getName()}/${archiveFolderName}`
  });

  // Register new doc
  const newDocId = generateDocId();
  registryAppend({
    doc_id: newDocId,
    file_id: newFileId,
    name: newName,
    category: reg.category,
    folder_path: reg.folder_path,
    folder_id: reg.folder_id,
    template_id: reg.template_id,
    template_version: reg.template_version,
    status: 'draft',
    created_by: supersededBy,
    created_at: nowIso,
    last_edited_by: supersededBy,
    last_edited_at: nowIso,
    owner: reg.owner,
    audience: reg.audience,
    supersedes: fileId,
    url: newUrl
  });

  auditLog('supersedeDoc', fileId, reg.doc_id, supersededBy,
    { supersededFileId: fileId, newFileId, newName },
    {
      action: 'restoreSupersede',
      fileId,
      newFileId,
      description: `Move ${fileId} back from Archive, delete ${newFileId}, and update registry.`
    }
  );

  return { newFileId, newUrl, newName };
}

/**
 * Archives a document: moves it to the Archive subfolder, updates its status in Registry.
 * @param {string} fileId
 * @param {string} archivedBy
 */
function archiveDoc(fileId, archivedBy) {
  const reg = registryFind(fileId);
  if (!reg) throw { code: 'NOT_IN_REGISTRY', message: `File ${fileId} is not in the Registry.` };

  const cfg = getConfig();
  const archiveFolderName = cfg.archiveFolderName || 'Archive';
  const file = DriveApp.getFileById(fileId);

  let parentFolder;
  try {
    parentFolder = DriveApp.getFolderById(reg.folder_id);
  } catch (e) {
    const parents = file.getParents();
    parentFolder = parents.hasNext() ? parents.next() : null;
  }

  if (!parentFolder) throw { code: 'NO_PARENT_FOLDER', message: 'Cannot determine parent folder.' };

  // Get/create Archive subfolder
  let archiveFolder;
  const existing = parentFolder.getFoldersByName(archiveFolderName);
  if (existing.hasNext()) {
    archiveFolder = existing.next();
  } else {
    archiveFolder = parentFolder.createFolder(archiveFolderName);
  }

  // Move to archive
  file.moveTo(archiveFolder);

  const now = new Date().toISOString();
  registryUpdate(fileId, {
    status: 'archived',
    last_edited_by: archivedBy,
    last_edited_at: now,
    folder_id: archiveFolder.getId(),
    folder_path: `${parentFolder.getName()}/${archiveFolderName}`
  });

  auditLog('archiveDoc', fileId, reg.doc_id, archivedBy,
    { archivedBy, originalFolderId: reg.folder_id, originalFolderPath: reg.folder_path },
    {
      action: 'restoreFromArchive',
      fileId,
      originalFolderId: reg.folder_id,
      description: `Move ${fileId} back to folder ${reg.folder_id} to restore`
    }
  );
}

/**
 * Adopts an existing file: moves it from _Imports/ to the correct output folder,
 * renames it per naming convention, converts to Google native format if binary,
 * and registers it.
 * @param {string} fileId
 * @param {string} category
 * @param {string} name
 * @param {string} audience
 * @param {string} adoptedBy
 * @returns {{docId: string, fileId: string, url: string}}
 */
function adoptFile(fileId, category, name, audience, adoptedBy) {
  const cfg = getConfig();
  const file = DriveApp.getFileById(fileId);
  const mimeType = file.getMimeType();

  // Find output folder for the category
  const templates = listTemplates(category);
  let outputFolderId = null;
  let outputFolder;

  if (templates.length > 0 && templates[0].output_folder_id) {
    outputFolderId = templates[0].output_folder_id;
    outputFolder = DriveApp.getFolderById(outputFolderId);
  } else {
    outputFolder = DriveApp.getFolderById(cfg.sharedDriveId);
    outputFolderId = cfg.sharedDriveId;
  }

  // Determine if conversion is needed (binary office formats -> Google native)
  const conversionMap = {
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': MimeType.GOOGLE_DOCS,
    'application/msword': MimeType.GOOGLE_DOCS,
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': MimeType.GOOGLE_SLIDES,
    'application/vnd.ms-powerpoint': MimeType.GOOGLE_SLIDES,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': MimeType.GOOGLE_SHEETS,
    'application/vnd.ms-excel': MimeType.GOOGLE_SHEETS
  };

  const adoptedFileId = fileId;
  const adoptedFile = file;
  const originalFolderId = cfg.importsFolderId;
  // DriveApp cannot convert Office formats to Google native — Drive Advanced Service required.
  // If the caller needs a Google Doc/Sheets/Slides, they must enable Drive Advanced Service.
  const needsConversion = !!conversionMap[mimeType];

  adoptedFile.setName(name);
  adoptedFile.moveTo(outputFolder);

  const url = adoptedFile.getUrl();
  const docId = generateDocId();
  const now = new Date().toISOString();

  registryAppend({
    doc_id: docId,
    file_id: adoptedFileId,
    name: name,
    category: category,
    folder_path: outputFolder.getName(),
    folder_id: outputFolderId,
    template_id: '__adopted',
    template_version: '1',
    status: 'draft',
    created_by: adoptedBy,
    created_at: now,
    last_edited_by: adoptedBy,
    last_edited_at: now,
    owner: adoptedBy,
    audience: audience || '',
    imported_from: originalFolderId,
    url: url
  });

  auditLog('adoptFile', adoptedFileId, docId, adoptedBy,
    { originalFileId: fileId, category, name, audience, mimeType },
    {
      action: 'moveToImports',
      fileId: adoptedFileId,
      folderId: originalFolderId,
      description: `Move ${adoptedFileId} back to _Imports folder ${originalFolderId}`
    }
  );

  const result = { docId, fileId: adoptedFileId, url };
  if (needsConversion) {
    result.conversionWarning = 'File was moved but NOT converted to Google format. Enable the Drive Advanced Service in Apps Script to convert Office documents automatically.';
  }
  return result;
}

/**
 * Updates the status column for a document in the Registry.
 * Valid statuses: draft, review, approved, published, archived.
 * @param {string} fileId
 * @param {string} status
 * @param {string} updatedBy
 */
function updateDocStatus(fileId, status, updatedBy) {
  if (!VALID_DOC_STATUSES.includes(status)) {
    throw { code: 'INVALID_STATUS', message: `Invalid status "${status}". Must be one of: ${VALID_DOC_STATUSES.join(', ')}` };
  }

  const reg = registryFind(fileId);
  if (!reg) throw { code: 'NOT_IN_REGISTRY', message: `File ${fileId} is not in the Registry.` };

  const previousStatus = reg.status;
  const now = new Date().toISOString();

  registryUpdate(fileId, {
    status,
    last_edited_by: updatedBy,
    last_edited_at: now
  });

  auditLog('updateStatus', fileId, reg.doc_id, updatedBy,
    { status, previousStatus },
    { action: 'updateStatus', fileId, status: previousStatus, description: `Restore status to "${previousStatus}"` }
  );
}
