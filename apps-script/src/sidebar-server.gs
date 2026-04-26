/**
 * sidebar-server.gs — Server-side functions callable from the sidebar via google.script.run
 * All functions must return plain, JSON-serializable objects (no class instances).
 */

/**
 * Returns active templates for the sidebar catalog, optionally filtered by category.
 * @param {string|null} category
 * @returns {Array<{id, name, description, tokens_schema, required_inputs}>}
 */
function listTemplatesForSidebar(category) {
  try {
    const templates = listTemplates(category || null);
    return templates.map(t => ({
      id: String(t.id),
      name: String(t.name || ''),
      description: String(t.description || ''),
      category: String(t.category || ''),
      doc_type: String(t.doc_type || 'doc'),
      tokens_schema: t.tokens_schema || {},
      required_inputs: Array.isArray(t.required_inputs) ? t.required_inputs : []
    }));
  } catch (e) {
    // Return empty array on error — sidebar handles gracefully
    console.error('listTemplatesForSidebar error: ' + (e.message || JSON.stringify(e)));
    return [];
  }
}

/**
 * Renders a template and returns the result for the sidebar Done view.
 * @param {string} id
 * @param {Object} inputs
 * @returns {{url: string, name: string, error?: string}}
 */
function renderTemplateFromSidebar(id, inputs) {
  try {
    const userEmail = Session.getActiveUser().getEmail() || 'unknown';
    const result = renderTemplate(id, inputs || {}, userEmail);
    return { url: result.url, name: result.name, docId: result.docId, fileId: result.fileId };
  } catch (e) {
    const errMsg = e.message || (e.code ? `${e.code}: ${JSON.stringify(e)}` : JSON.stringify(e));
    console.error('renderTemplateFromSidebar error: ' + errMsg);
    return { url: null, name: null, error: errMsg };
  }
}

/**
 * Creates a blank document of the specified type.
 * @param {string} category
 * @param {string} title
 * @param {string} audience
 * @param {string} docType - 'doc' | 'slides' | 'sheet'
 * @returns {{url: string, name: string, error?: string}}
 */
function createBlankFromSidebar(category, title, audience, docType) {
  try {
    const userEmail = Session.getActiveUser().getEmail() || 'unknown';
    const result = createBlank(category || 'General', title || 'Nuevo documento', audience || '', docType || 'doc', userEmail);
    return { url: result.url, name: title || 'Nuevo documento', docId: result.docId, fileId: result.fileId };
  } catch (e) {
    const errMsg = e.message || (e.code ? `${e.code}: ${JSON.stringify(e)}` : JSON.stringify(e));
    console.error('createBlankFromSidebar error: ' + errMsg);
    return { url: null, name: null, error: errMsg };
  }
}

/**
 * Updates the status of a document.
 * @param {string} fileId
 * @param {string} status
 * @returns {{ok: boolean, error?: string}}
 */
function updateStatusFromSidebar(fileId, status) {
  try {
    const userEmail = Session.getActiveUser().getEmail() || 'unknown';
    updateDocStatus(fileId, status, userEmail);
    return { ok: true };
  } catch (e) {
    const errMsg = e.message || (e.code ? `${e.code}: ${JSON.stringify(e)}` : JSON.stringify(e));
    console.error('updateStatusFromSidebar error: ' + errMsg);
    return { ok: false, error: errMsg };
  }
}

/**
 * Returns info for the currently selected Drive file (if available in context).
 * In a Drive sidebar, DriveApp.getActiveFile() returns the currently selected file.
 * @returns {{fileId: string, name: string, registryRow: Object|null}|null}
 */
function getSelectedFileInfo() {
  try {
    const file = DriveApp.getActiveFile();
    if (!file) return null;
    const fileId = file.getId();
    const name = file.getName();
    const registryRow = registryFind(fileId);
    return { fileId, name, registryRow };
  } catch (e) {
    // No active file in context (e.g., sidebar opened from Script Editor)
    return null;
  }
}

/**
 * Returns the active UI context (Sheets, Docs, Forms, or Script Editor fallback).
 */
function getUiContext() {
  try { return SpreadsheetApp.getUi(); } catch(e) {}
  try { return DocumentApp.getUi(); } catch(e) {}
  try { return SlidesApp.getUi(); } catch(e) {}
  return null;
}

/**
 * Opens the DOC HUB sidebar. Works in Sheets, Docs, and Slides.
 */
function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('src/Sidebar')
    .setTitle('🦊 DOC HUB')
    .setWidth(340);
  var ui = getUiContext();
  if (ui) {
    ui.showSidebar(html);
  } else {
    throw new Error('Abre DOC HUB desde un Google Doc, Sheet o Slides.');
  }
}

/**
 * Adds the DOC HUB menu when a Sheets/Docs file is opened.
 */
function onOpen(e) {
  var ui = getUiContext();
  if (!ui) return;
  ui.createMenu('🦊 DOC HUB')
    .addItem('Abrir panel', 'showSidebar')
    .addSeparator()
    .addItem('Nuevo documento en blanco', 'showSidebarBlank')
    .addToUi();
}

function showSidebarBlank() {
  showSidebar();
}

// --- Workspace Add-on homepage triggers ---

function onDriveHomepage(e) {
  return buildAddOnCard();
}

function onSheetsHomepage(e) {
  return buildAddOnCard();
}

function onDocsHomepage(e) {
  return buildAddOnCard();
}

function onDriveItemsSelected(e) {
  return buildAddOnCard();
}

/**
 * Builds a simple card UI for the Workspace Add-on panel.
 * Users click "Abrir DOC HUB" to open the sidebar in their current doc/sheet.
 */
function buildAddOnCard() {
  var card = CardService.newCardBuilder()
    .setName('DOC HUB')
    .setHeader(CardService.newCardHeader()
      .setTitle('🦊 DOC HUB')
      .setSubtitle('Sistema de gestión documental KUILL')
      .setImageStyle(CardService.ImageStyle.CIRCLE));

  var section = CardService.newCardSection()
    .addWidget(CardService.newTextParagraph()
      .setText('Crea, busca y gestiona documentos corporativos de KUILL desde un solo lugar.'))
    .addWidget(CardService.newButtonSet()
      .addButton(CardService.newTextButton()
        .setText('Abrir panel')
        .setOnClickAction(CardService.newAction().setFunctionName('showSidebar'))
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)));

  card.addSection(section);
  return card.build();
}
