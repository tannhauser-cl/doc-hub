/**
 * templating.gs — Template rendering and blank document creation
 */

/**
 * Renders a template by copying the master file, replacing tokens, registering, and auditing.
 * @param {string} id - Template manifest id
 * @param {Object} inputs - Token values
 * @param {string} createdBy - User email
 * @returns {{docId: string, fileId: string, url: string, name: string}}
 */
function renderTemplate(id, inputs, createdBy) {
  const template = getTemplate(id);
  if (!template) {
    throw { code: 'TEMPLATE_NOT_FOUND', message: `Template with id "${id}" not found or inactive.` };
  }

  // Validate required inputs
  const required = Array.isArray(template.required_inputs) ? template.required_inputs : [];
  const missing = required.filter(field => !inputs[field] && inputs[field] !== 0 && inputs[field] !== false);
  if (missing.length > 0) {
    throw { code: 'MISSING_INPUTS', missing, message: `Missing required inputs: ${missing.join(', ')}` };
  }

  // Resolve output name from naming pattern
  const renderedName = resolveNamingPattern(template.naming_pattern || '{{title}}', inputs) || template.name;

  // Get output folder
  let outputFolder;
  try {
    outputFolder = DriveApp.getFolderById(template.output_folder_id);
  } catch (e) {
    throw { code: 'FOLDER_NOT_FOUND', message: `Output folder ${template.output_folder_id} not found: ${e.message}` };
  }

  // Copy master template file
  let masterFile;
  try {
    masterFile = DriveApp.getFileById(template.template_file_id);
  } catch (e) {
    throw { code: 'TEMPLATE_FILE_NOT_FOUND', message: `Template file ${template.template_file_id} not found: ${e.message}` };
  }

  const copy = masterFile.makeCopy(renderedName, outputFolder);
  const copyId = copy.getId();
  const copyUrl = copy.getUrl();

  // Replace tokens based on mime type
  const mimeType = copy.getMimeType();
  if (mimeType === MimeType.GOOGLE_DOCS) {
    replaceTokensInDoc(copyId, inputs);
  } else if (mimeType === MimeType.GOOGLE_SLIDES) {
    replaceTokensInSlides(copyId, inputs);
  } else if (mimeType === MimeType.GOOGLE_SHEETS) {
    replaceTokensInSheet(copyId, inputs);
  }

  // Register document
  const docId = generateDocId();
  const now = new Date().toISOString();
  const folderPath = outputFolder.getName();

  registryAppend({
    doc_id: docId,
    file_id: copyId,
    name: renderedName,
    category: template.category,
    folder_path: folderPath,
    folder_id: template.output_folder_id,
    template_id: id,
    template_version: template.version || '1',
    status: 'draft',
    created_by: createdBy,
    created_at: now,
    last_edited_by: createdBy,
    last_edited_at: now,
    owner: createdBy,
    audience: template.output_folder_id,
    url: copyUrl
  });

  // Audit log
  auditLog('renderTemplate', copyId, docId, createdBy,
    { templateId: id, inputs, renderedName },
    { action: 'archiveDoc', fileId: copyId, description: 'Delete the rendered copy to undo' }
  );

  return { docId, fileId: copyId, url: copyUrl, name: renderedName };
}

/**
 * Resolves a naming pattern by substituting {{token}} placeholders.
 * Also supports {{YYYY-MM}} for current year-month.
 * @param {string} pattern
 * @param {Object} inputs
 * @returns {string}
 */
function resolveNamingPattern(pattern, inputs) {
  if (!pattern) return '';
  let result = pattern;

  // Replace date-based tokens
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  result = result.replace(/\{\{YYYY-MM\}\}/g, yearMonth);
  result = result.replace(/\{\{YYYY\}\}/g, year);
  result = result.replace(/\{\{MM\}\}/g, month);
  result = result.replace(/\{\{DD\}\}/g, day);

  // Replace input tokens
  for (const [key, value] of Object.entries(inputs || {})) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value !== null && value !== undefined ? String(value) : '');
  }

  // Remove any remaining unresolved tokens
  result = result.replace(/\{\{[^}]+\}\}/g, '');

  return result.trim();
}

/**
 * Replaces {{TOKEN}} placeholders in a Google Doc body.
 * @param {string} fileId
 * @param {Object} inputs
 */
function replaceTokensInDoc(fileId, inputs) {
  const doc = DocumentApp.openById(fileId);
  const body = doc.getBody();

  for (const [key, value] of Object.entries(inputs || {})) {
    const placeholder = `{{${key}}}`;
    const replacement = value !== null && value !== undefined ? String(value) : '';
    body.replaceText(placeholder, replacement);
  }

  // Also replace in headers and footers
  const header = doc.getHeader();
  const footer = doc.getFooter();

  if (header) {
    for (const [key, value] of Object.entries(inputs || {})) {
      header.replaceText(`{{${key}}}`, value !== null && value !== undefined ? String(value) : '');
    }
  }
  if (footer) {
    for (const [key, value] of Object.entries(inputs || {})) {
      footer.replaceText(`{{${key}}}`, value !== null && value !== undefined ? String(value) : '');
    }
  }

  doc.saveAndClose();
}

/**
 * Replaces {{TOKEN}} placeholders in all text ranges of a Google Slides presentation.
 * @param {string} fileId
 * @param {Object} inputs
 */
function replaceTokensInSlides(fileId, inputs) {
  const presentation = SlidesApp.openById(fileId);
  const slides = presentation.getSlides();

  for (const slide of slides) {
    const shapes = slide.getShapes();
    for (const shape of shapes) {
      if (shape.getText) {
        const textRange = shape.getText();
        for (const [key, value] of Object.entries(inputs || {})) {
          const placeholder = `{{${key}}}`;
          const replacement = value !== null && value !== undefined ? String(value) : '';
          textRange.replaceAllText(placeholder, replacement);
        }
      }
    }

    // Also handle tables
    const tables = slide.getTables();
    for (const table of tables) {
      const numRows = table.getNumRows();
      const numCols = table.getNumColumns();
      for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
          const cell = table.getCell(r, c);
          const textRange = cell.getText();
          for (const [key, value] of Object.entries(inputs || {})) {
            textRange.replaceAllText(`{{${key}}}`, value !== null && value !== undefined ? String(value) : '');
          }
        }
      }
    }
  }

  presentation.saveAndClose();
}

/**
 * Replaces {{TOKEN}} placeholders in all cell values of a Google Spreadsheet.
 * @param {string} fileId
 * @param {Object} inputs
 */
function replaceTokensInSheet(fileId, inputs) {
  const spreadsheet = SpreadsheetApp.openById(fileId);
  const sheets = spreadsheet.getSheets();

  for (const sheet of sheets) {
    const range = sheet.getDataRange();
    const values = range.getValues();
    let changed = false;

    for (let r = 0; r < values.length; r++) {
      for (let c = 0; c < values[r].length; c++) {
        let cellValue = String(values[r][c]);
        if (cellValue.includes('{{')) {
          for (const [key, value] of Object.entries(inputs || {})) {
            const placeholder = `{{${key}}}`;
            const replacement = value !== null && value !== undefined ? String(value) : '';
            cellValue = cellValue.split(placeholder).join(replacement);
          }
          values[r][c] = cellValue;
          changed = true;
        }
      }
    }

    if (changed) {
      range.setValues(values);
    }
  }

  SpreadsheetApp.flush();
}

/**
 * Creates a new blank document (Doc, Slides, or Sheet) in the correct output folder.
 * Applies brand cover+footer if Brand Kit masters are available.
 * Registers the new document.
 * @param {string} category
 * @param {string} title
 * @param {string} audience
 * @param {string} docType - 'doc' | 'slides' | 'sheet'
 * @param {string} createdBy
 * @returns {{docId: string, fileId: string, url: string}}
 */
function createBlank(category, title, audience, docType, createdBy) {
  const cfg = getConfig();

  // Find output folder — look for a manifest entry matching the category to get output_folder_id
  let outputFolder;
  const templates = listTemplates(category);
  let outputFolderId = null;

  if (templates.length > 0 && templates[0].output_folder_id) {
    outputFolderId = templates[0].output_folder_id;
    outputFolder = DriveApp.getFolderById(outputFolderId);
  } else {
    // Fall back to shared drive root
    try {
      const drive = DriveApp.getFolderById(cfg.sharedDriveId);
      outputFolder = drive;
      outputFolderId = cfg.sharedDriveId;
    } catch (e) {
      throw { code: 'FOLDER_NOT_FOUND', message: 'Cannot determine output folder. No manifest entry for category and sharedDriveId not accessible.' };
    }
  }

  const type = (docType || 'doc').toLowerCase();
  let newFile;
  let fileId;
  let url;

  if (type === 'slides') {
    // Check if a brand slides master exists in Brand Kit
    const brandMasterFile = findBrandMaster(cfg.brandKitFolderId, 'slides');
    if (brandMasterFile) {
      newFile = brandMasterFile.makeCopy(title, outputFolder);
      fileId = newFile.getId();
      // Clear content but keep structure
      const presentation = SlidesApp.openById(fileId);
      const slides = presentation.getSlides();
      // Remove all slides except first
      for (let i = slides.length - 1; i > 0; i--) {
        slides[i].remove();
      }
      // Clear text from first slide
      if (slides.length > 0) {
        const shapes = slides[0].getShapes();
        shapes.forEach(shape => {
          if (shape.getText) shape.getText().setText('');
        });
      }
      presentation.setName(title);
      presentation.saveAndClose();
    } else {
      const presentation = SlidesApp.create(title);
      fileId = presentation.getId();
      presentation.saveAndClose();
      newFile = DriveApp.getFileById(fileId);
      newFile.moveTo(outputFolder);
    }
  } else if (type === 'sheet') {
    const spreadsheet = SpreadsheetApp.create(title);
    fileId = spreadsheet.getId();
    SpreadsheetApp.flush();
    newFile = DriveApp.getFileById(fileId);
    newFile.moveTo(outputFolder);
  } else {
    // Default: Google Doc
    const brandMasterFile = findBrandMaster(cfg.brandKitFolderId, 'doc');
    if (brandMasterFile) {
      newFile = brandMasterFile.makeCopy(title, outputFolder);
      fileId = newFile.getId();
      // Clear body content
      const doc = DocumentApp.openById(fileId);
      doc.getBody().clear();
      doc.setName(title);
      doc.saveAndClose();
    } else {
      const doc = DocumentApp.create(title);
      fileId = doc.getId();
      doc.saveAndClose();
      newFile = DriveApp.getFileById(fileId);
      newFile.moveTo(outputFolder);
    }
  }

  url = DriveApp.getFileById(fileId).getUrl();

  // Register
  const docId = generateDocId();
  const now = new Date().toISOString();
  const folderPath = outputFolder.getName();

  registryAppend({
    doc_id: docId,
    file_id: fileId,
    name: title,
    category: category,
    folder_path: folderPath,
    folder_id: outputFolderId,
    template_id: '__blank',
    template_version: '1',
    status: 'draft',
    created_by: createdBy,
    created_at: now,
    last_edited_by: createdBy,
    last_edited_at: now,
    owner: createdBy,
    audience: audience || '',
    url: url
  });

  auditLog('createBlank', fileId, docId, createdBy,
    { category, title, audience, docType },
    { action: 'archiveDoc', fileId, description: 'Archive or delete to undo blank creation' }
  );

  return { docId, fileId, url };
}

/**
 * Attempts to find a brand master file in the Brand Kit folder.
 * Looks for files named like "brand-master-doc", "brand-master-slides", etc.
 * Returns the file or null if not found.
 * @param {string} brandKitFolderId
 * @param {string} type - 'doc' | 'slides'
 * @returns {GoogleAppsScript.Drive.File|null}
 */
function findBrandMaster(brandKitFolderId, type) {
  if (!brandKitFolderId) return null;
  try {
    const folder = DriveApp.getFolderById(brandKitFolderId);
    const searchName = `brand-master-${type}`;
    const files = folder.getFilesByName(searchName);
    if (files.hasNext()) return files.next();

    // Also try with display names
    const altName = `Brand Master ${type.charAt(0).toUpperCase() + type.slice(1)}`;
    const altFiles = folder.getFilesByName(altName);
    if (altFiles.hasNext()) return altFiles.next();

    return null;
  } catch (e) {
    return null;
  }
}
