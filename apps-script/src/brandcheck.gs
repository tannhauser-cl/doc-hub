/**
 * brandcheck.gs — Brand compliance checking
 */

/**
 * Checks a document against brand tokens for font and color compliance.
 * Supports Google Docs and Google Slides.
 * @param {string} fileId
 * @returns {{status: 'ok'|'violations', violations: Object[]}}
 */
function brandCheck(fileId) {
  const tokens = getBrandTokens();
  const file = DriveApp.getFileById(fileId);
  const mimeType = file.getMimeType();
  const violations = [];

  const brandFonts = extractBrandFonts(tokens);
  const brandColors = extractBrandColors(tokens);

  if (mimeType === MimeType.GOOGLE_DOCS) {
    checkDocBrand(fileId, brandFonts, brandColors, violations);
  } else if (mimeType === MimeType.GOOGLE_SLIDES) {
    checkSlidesBrand(fileId, brandFonts, brandColors, violations);
  } else {
    return {
      status: 'ok',
      violations: [],
      message: `Brand check not supported for MIME type: ${mimeType}`
    };
  }

  return {
    status: violations.length === 0 ? 'ok' : 'violations',
    violations
  };
}

/**
 * Reads and returns the brand-tokens.json content from the Brand Kit folder.
 * @returns {Object}
 */
function getBrandTokens() {
  const cfg = getConfig();
  const brandKitFolderId = cfg.brandKitFolderId;
  if (!brandKitFolderId) {
    throw { code: 'NO_BRAND_KIT', message: 'brandKitFolderId not configured in TENANT_CONFIG.' };
  }

  const folder = DriveApp.getFolderById(brandKitFolderId);
  const files = folder.getFilesByName('brand-tokens.json');

  if (!files.hasNext()) {
    throw { code: 'BRAND_TOKENS_NOT_FOUND', message: 'brand-tokens.json not found in Brand Kit folder.' };
  }

  const file = files.next();
  const content = file.getBlob().getDataAsString();
  try {
    return JSON.parse(content);
  } catch (e) {
    throw { code: 'BRAND_TOKENS_INVALID', message: 'brand-tokens.json is not valid JSON: ' + e.message };
  }
}

/**
 * Extracts the list of allowed font families from brand tokens.
 * Supports structures like: tokens.typography.fontFamilies or tokens.fonts.
 * @param {Object} tokens
 * @returns {string[]}
 */
function extractBrandFonts(tokens) {
  const fonts = new Set();

  // Try common token structures
  if (tokens.typography) {
    if (tokens.typography.fontFamilies) {
      const ff = tokens.typography.fontFamilies;
      if (typeof ff === 'object') {
        Object.values(ff).forEach(f => fonts.add(String(f).toLowerCase().trim()));
      }
    }
    if (tokens.typography.fonts) {
      const ff = tokens.typography.fonts;
      if (Array.isArray(ff)) {
        ff.forEach(f => fonts.add(String(f).toLowerCase().trim()));
      } else if (typeof ff === 'object') {
        Object.values(ff).forEach(f => fonts.add(String(f).toLowerCase().trim()));
      }
    }
  }

  if (tokens.fonts) {
    const ff = tokens.fonts;
    if (Array.isArray(ff)) {
      ff.forEach(f => fonts.add(String(f).toLowerCase().trim()));
    } else if (typeof ff === 'object') {
      Object.values(ff).forEach(f => fonts.add(String(f).toLowerCase().trim()));
    }
  }

  // Fallback: look for any key containing 'font'
  if (fonts.size === 0) {
    const findFonts = (obj, depth) => {
      if (depth > 4 || !obj || typeof obj !== 'object') return;
      Object.entries(obj).forEach(([k, v]) => {
        if (k.toLowerCase().includes('font') && typeof v === 'string') {
          fonts.add(v.toLowerCase().trim());
        } else {
          findFonts(v, depth + 1);
        }
      });
    };
    findFonts(tokens, 0);
  }

  return Array.from(fonts);
}

/**
 * Extracts allowed brand colors (hex strings) from brand tokens.
 * @param {Object} tokens
 * @returns {string[]}
 */
function extractBrandColors(tokens) {
  const colors = new Set();
  const hexPattern = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;

  const findColors = (obj, depth) => {
    if (depth > 6 || !obj || typeof obj !== 'object') return;
    Object.values(obj).forEach(v => {
      if (typeof v === 'string' && hexPattern.test(v.trim())) {
        colors.add(v.trim().toLowerCase());
      } else if (typeof v === 'object') {
        findColors(v, depth + 1);
      }
    });
  };
  findColors(tokens, 0);

  return Array.from(colors);
}

/**
 * Checks a Google Doc for font family compliance.
 * @param {string} fileId
 * @param {string[]} brandFonts - Allowed font families (lowercase)
 * @param {string[]} brandColors - Allowed hex colors (lowercase)
 * @param {Object[]} violations - Accumulator
 */
function checkDocBrand(fileId, brandFonts, brandColors, violations) {
  if (brandFonts.length === 0 && brandColors.length === 0) return;

  const doc = DocumentApp.openById(fileId);
  const body = doc.getBody();
  const numChildren = body.getNumChildren();

  for (let i = 0; i < numChildren; i++) {
    const child = body.getChild(i);
    checkElementBrand(child, brandFonts, brandColors, violations, `Paragraph ${i + 1}`);
  }
  doc.saveAndClose();
}

/**
 * Recursively checks a document element for brand compliance.
 */
function checkElementBrand(element, brandFonts, brandColors, violations, context) {
  const type = element.getType();

  if (type === DocumentApp.ElementType.PARAGRAPH || type === DocumentApp.ElementType.LIST_ITEM) {
    const para = type === DocumentApp.ElementType.PARAGRAPH ? element.asParagraph() : element.asListItem();
    const numKids = para.getNumChildren();
    for (let k = 0; k < numKids; k++) {
      const kid = para.getChild(k);
      if (kid.getType() === DocumentApp.ElementType.TEXT) {
        const textEl = kid.asText();
        const text = textEl.getText();
        if (!text) continue;

        // Check font family
        if (brandFonts.length > 0) {
          const fontFamily = textEl.getFontFamily();
          if (fontFamily) {
            const fontLower = fontFamily.toLowerCase().trim();
            const isBrandFont = brandFonts.some(f => fontLower.includes(f) || f.includes(fontLower));
            if (!isBrandFont) {
              violations.push({
                element: context,
                issue: 'non_brand_font',
                expected: brandFonts.join(' | '),
                found: fontFamily
              });
            }
          }
        }

        // Check foreground color
        if (brandColors.length > 0) {
          const fgColor = textEl.getForegroundColor();
          if (fgColor && fgColor !== '#000000' && fgColor !== '#000') {
            const colorLower = fgColor.toLowerCase();
            const isBrandColor = brandColors.includes(colorLower) ||
              brandColors.includes(normalizeHex(colorLower));
            if (!isBrandColor) {
              violations.push({
                element: context,
                issue: 'non_brand_color',
                expected: brandColors.slice(0, 5).join(' | ') + (brandColors.length > 5 ? '...' : ''),
                found: fgColor
              });
            }
          }
        }
      }
    }
  } else if (type === DocumentApp.ElementType.TABLE) {
    const table = element.asTable();
    for (let r = 0; r < table.getNumRows(); r++) {
      const row = table.getRow(r);
      for (let c = 0; c < row.getNumCells(); c++) {
        const cell = row.getCell(c);
        for (let p = 0; p < cell.getNumChildren(); p++) {
          checkElementBrand(cell.getChild(p), brandFonts, brandColors, violations, `Table[${r},${c}] Para ${p}`);
        }
      }
    }
  }
}

/**
 * Checks a Google Slides presentation for brand color compliance.
 * @param {string} fileId
 * @param {string[]} brandFonts
 * @param {string[]} brandColors
 * @param {Object[]} violations
 */
function checkSlidesBrand(fileId, brandFonts, brandColors, violations) {
  const presentation = SlidesApp.openById(fileId);
  const slides = presentation.getSlides();

  slides.forEach((slide, slideIdx) => {
    const shapes = slide.getShapes();
    shapes.forEach((shape, shapeIdx) => {
      try {
        const textRange = shape.getText();
        const runs = textRange.getRuns();

        runs.forEach((run, runIdx) => {
          const context = `Slide ${slideIdx + 1}, Shape ${shapeIdx + 1}, Run ${runIdx + 1}`;
          const style = run.getTextStyle();

          // Check font
          if (brandFonts.length > 0) {
            const font = style.getFontFamily();
            if (font) {
              const fontLower = font.toLowerCase().trim();
              const isBrandFont = brandFonts.some(f => fontLower.includes(f) || f.includes(fontLower));
              if (!isBrandFont) {
                violations.push({
                  element: context,
                  issue: 'non_brand_font',
                  expected: brandFonts.join(' | '),
                  found: font
                });
              }
            }
          }

          // Check foreground color
          if (brandColors.length > 0) {
            const fgColor = style.getForegroundColor();
            if (fgColor) {
              let hexColor = null;
              try {
                hexColor = fgColor.asRgbColor().asHexString().toLowerCase();
              } catch (e) {}
              if (hexColor && hexColor !== '#000000') {
                const isBrandColor = brandColors.includes(hexColor) ||
                  brandColors.includes(normalizeHex(hexColor));
                if (!isBrandColor) {
                  violations.push({
                    element: context,
                    issue: 'non_brand_color',
                    expected: brandColors.slice(0, 5).join(' | '),
                    found: hexColor
                  });
                }
              }
            }
          }
        });
      } catch (e) {
        // Shape may not have text
      }
    });
  });

  presentation.saveAndClose();
}

/**
 * Normalizes a 3-digit hex color to 6 digits for comparison.
 * @param {string} hex
 * @returns {string}
 */
function normalizeHex(hex) {
  if (!hex) return hex;
  if (/^#[0-9a-f]{3}$/.test(hex)) {
    return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return hex;
}
