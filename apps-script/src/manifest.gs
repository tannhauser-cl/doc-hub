/**
 * manifest.gs — Template manifest operations
 */

/**
 * Lists all active templates from the Manifest sheet.
 * Optionally filters by category (case-insensitive).
 * @param {string|null} category
 * @returns {Object[]}
 */
function listTemplates(category) {
  const sheet = getManifestSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const headers = data[0];
  const catLower = category ? category.toLowerCase() : null;
  const results = [];

  for (let i = 1; i < data.length; i++) {
    const row = manifestRowToObject(data[i], headers);

    // Only return active templates
    const isActive = String(row.active).toLowerCase() === 'true' || row.active === true || row.active === 1 || row.active === '1';
    if (!isActive) continue;

    // Category filter
    if (catLower && (row.category || '').toLowerCase() !== catLower) continue;

    // Parse JSON fields
    if (row.tokens_schema && typeof row.tokens_schema === 'string') {
      try { row.tokens_schema = JSON.parse(row.tokens_schema); } catch (e) { /* leave as string */ }
    }
    if (row.required_inputs && typeof row.required_inputs === 'string') {
      try { row.required_inputs = JSON.parse(row.required_inputs); } catch (e) {
        // Try comma-separated string
        row.required_inputs = row.required_inputs.split(',').map(s => s.trim()).filter(Boolean);
      }
    }

    results.push(row);
  }
  return results;
}

/**
 * Returns a single template row by id, or null if not found.
 * @param {string} id
 * @returns {Object|null}
 */
function getTemplate(id) {
  const sheet = getManifestSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return null;

  const headers = data[0];
  const idColIndex = headers.indexOf('id');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idColIndex]) === String(id)) {
      const row = manifestRowToObject(data[i], headers);

      // Parse JSON fields
      if (row.tokens_schema && typeof row.tokens_schema === 'string') {
        try { row.tokens_schema = JSON.parse(row.tokens_schema); } catch (e) { /* leave as string */ }
      }
      if (row.required_inputs && typeof row.required_inputs === 'string') {
        try { row.required_inputs = JSON.parse(row.required_inputs); } catch (e) {
          row.required_inputs = row.required_inputs.split(',').map(s => s.trim()).filter(Boolean);
        }
      }
      return row;
    }
  }
  return null;
}

/**
 * Converts a manifest sheet row array + headers array to a plain object.
 * @param {Array} row
 * @param {string[]} headers
 * @returns {Object}
 */
function manifestRowToObject(row, headers) {
  const obj = {};
  headers.forEach((header, i) => {
    obj[header] = row[i] !== undefined ? row[i] : '';
  });
  return obj;
}
