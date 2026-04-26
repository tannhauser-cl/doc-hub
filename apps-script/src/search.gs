/**
 * search.gs — Document search and content reading
 */

/**
 * Searches the Registry for documents matching the query.
 * @param {string|null} q - Text query (matches name)
 * @param {string|null} category
 * @param {string|null} status
 * @param {number} limit
 * @returns {Object[]}
 */
function searchDocs(q, category, status, limit) {
  return registrySearch(q, category, status, limit || 50);
}

/**
 * Reads a document and extracts text, headings, tables, and metadata.
 * Detects file type by MIME type.
 * @param {string} fileId
 * @returns {{text: string, headings: Object[], tables: Array, metadata: Object|null}}
 */
function readDoc(fileId) {
  const file = DriveApp.getFileById(fileId);
  const mimeType = file.getMimeType();
  const metadata = registryFind(fileId);

  if (mimeType === MimeType.GOOGLE_DOCS) {
    return readGoogleDoc(fileId, metadata);
  } else if (mimeType === MimeType.GOOGLE_SLIDES) {
    return readGoogleSlides(fileId, metadata);
  } else if (mimeType === MimeType.GOOGLE_SHEETS) {
    return readGoogleSheet(fileId, metadata);
  } else {
    // For other types, try to read as text export
    return {
      text: `[Binary or unsupported file type: ${mimeType}]`,
      headings: [],
      tables: [],
      metadata
    };
  }
}

/**
 * Reads a Google Doc and extracts structured content.
 * @param {string} fileId
 * @param {Object|null} metadata
 * @returns {{text: string, headings: Object[], tables: Array, metadata: Object|null}}
 */
function readGoogleDoc(fileId, metadata) {
  const doc = DocumentApp.openById(fileId);
  const body = doc.getBody();
  const numChildren = body.getNumChildren();

  const textParts = [];
  const headings = [];
  const tables = [];

  const headingMap = {
    [DocumentApp.ParagraphHeading.HEADING1]: 1,
    [DocumentApp.ParagraphHeading.HEADING2]: 2,
    [DocumentApp.ParagraphHeading.HEADING3]: 3,
    [DocumentApp.ParagraphHeading.HEADING4]: 4,
    [DocumentApp.ParagraphHeading.HEADING5]: 5,
    [DocumentApp.ParagraphHeading.HEADING6]: 6
  };

  for (let i = 0; i < numChildren; i++) {
    const child = body.getChild(i);
    const type = child.getType();

    if (type === DocumentApp.ElementType.PARAGRAPH) {
      const para = child.asParagraph();
      const text = para.getText();
      const heading = para.getHeading();

      if (heading !== DocumentApp.ParagraphHeading.NORMAL && headingMap[heading]) {
        headings.push({ level: headingMap[heading], text: text.trim() });
      }
      textParts.push(text);

    } else if (type === DocumentApp.ElementType.TABLE) {
      const table = child.asTable();
      const tableData = [];
      const numRows = table.getNumRows();
      for (let r = 0; r < numRows; r++) {
        const tableRow = table.getRow(r);
        const rowData = [];
        const numCells = tableRow.getNumCells();
        for (let c = 0; c < numCells; c++) {
          rowData.push(tableRow.getCell(c).getText());
        }
        tableData.push(rowData);
      }
      tables.push(tableData);
      // Also add table text to full text
      textParts.push(tableData.map(row => row.join('\t')).join('\n'));

    } else if (type === DocumentApp.ElementType.LIST_ITEM) {
      textParts.push(child.asListItem().getText());
    }
  }

  const text = textParts.join('\n');
  doc.saveAndClose();

  return { text, headings, tables, metadata };
}

/**
 * Reads a Google Slides presentation and concatenates text from all slides.
 * @param {string} fileId
 * @param {Object|null} metadata
 * @returns {{text: string, headings: Object[], tables: Array, metadata: Object|null}}
 */
function readGoogleSlides(fileId, metadata) {
  const presentation = SlidesApp.openById(fileId);
  const slides = presentation.getSlides();
  const textParts = [];
  const headings = [];
  const tables = [];

  slides.forEach((slide, slideIndex) => {
    const slideTitle = slide.getPageElements()
      .filter(el => el.getPageElementType() === SlidesApp.PageElementType.SHAPE)
      .map(el => {
        try {
          return el.asShape().getText().asString().trim();
        } catch (e) { return ''; }
      })
      .filter(Boolean);

    if (slideTitle.length > 0) {
      headings.push({ level: 1, text: `Slide ${slideIndex + 1}: ${slideTitle[0]}` });
    }

    // Get all text from shapes
    const shapes = slide.getShapes();
    for (const shape of shapes) {
      try {
        const text = shape.getText().asString().trim();
        if (text) textParts.push(text);
      } catch (e) { /* not a text shape */ }
    }

    // Get text from tables
    const slideTables = slide.getTables();
    for (const table of slideTables) {
      const tableData = [];
      const numRows = table.getNumRows();
      const numCols = table.getNumColumns();
      for (let r = 0; r < numRows; r++) {
        const rowData = [];
        for (let c = 0; c < numCols; c++) {
          try {
            rowData.push(table.getCell(r, c).getText().asString().trim());
          } catch (e) { rowData.push(''); }
        }
        tableData.push(rowData);
      }
      tables.push(tableData);
      textParts.push(tableData.map(row => row.join('\t')).join('\n'));
    }
  });

  presentation.saveAndClose();

  return { text: textParts.join('\n\n'), headings, tables, metadata };
}

/**
 * Reads a Google Spreadsheet and serializes cell values.
 * @param {string} fileId
 * @param {Object|null} metadata
 * @returns {{text: string, headings: Object[], tables: Array, metadata: Object|null}}
 */
function readGoogleSheet(fileId, metadata) {
  const spreadsheet = SpreadsheetApp.openById(fileId);
  const sheets = spreadsheet.getSheets();
  const textParts = [];
  const headings = [];
  const tables = [];

  for (const sheet of sheets) {
    const sheetName = sheet.getName();
    headings.push({ level: 1, text: sheetName });

    const data = sheet.getDataRange().getValues();
    tables.push(data);

    // Serialize to text
    const sheetText = data.map(row => row.join('\t')).join('\n');
    textParts.push(`[Sheet: ${sheetName}]\n${sheetText}`);
  }

  SpreadsheetApp.flush();

  return { text: textParts.join('\n\n'), headings, tables, metadata };
}
