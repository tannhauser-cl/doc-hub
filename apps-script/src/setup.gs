/**
 * setup.gs — Idempotent system bootstrap
 * Creates Registry, Manifest, and Audit-Trail sheets with correct headers
 * if they do not already exist. Safe to run multiple times.
 */

/**
 * Main setup entry point. Idempotent bootstrap for the entire system.
 * Creates sheets and Drive folders as needed based on TENANT_CONFIG.
 */
function setup() {
  console.log('doc-hub setup starting...');

  const cfg = getConfig();

  // Log all IDs so we can spot missing values immediately
  console.log('Config loaded. Key IDs:');
  console.log('  registrySheetId   = ' + cfg.registrySheetId);
  console.log('  auditTrailSheetId = ' + cfg.auditTrailSheetId);
  console.log('  manifestSheetId   = ' + cfg.manifestSheetId);
  console.log('  brandKitFolderId  = ' + cfg.brandKitFolderId);
  console.log('  importsFolderId   = ' + cfg.importsFolderId);
  console.log('  trashFolderId     = ' + cfg.trashFolderId);

  if (!cfg.registrySheetId) throw new Error('registrySheetId is missing from TENANT_CONFIG');
  if (!cfg.auditTrailSheetId) throw new Error('auditTrailSheetId is missing from TENANT_CONFIG');
  if (!cfg.manifestSheetId) throw new Error('manifestSheetId is missing from TENANT_CONFIG');

  // --- Registry sheet ---
  console.log('Verifying Registry sheet...');
  getOrCreateSheet(cfg.registrySheetId, 'Registry', REGISTRY_HEADERS);

  // --- Audit Trail sheet ---
  console.log('Verifying AuditTrail sheet...');
  getOrCreateSheet(cfg.auditTrailSheetId, 'AuditTrail', AUDIT_HEADERS);

  // --- Manifest sheet ---
  console.log('Verifying Manifest sheet...');
  getOrCreateSheet(cfg.manifestSheetId, 'Manifest', MANIFEST_HEADERS);

  // --- _Imports folder ---
  if (cfg.importsFolderId) {
    try {
      DriveApp.getFolderById(cfg.importsFolderId);
      console.log('_Imports folder verified: ' + cfg.importsFolderId);
    } catch (e) {
      console.warn('_Imports folder not accessible: ' + cfg.importsFolderId + ' — ' + e.message);
    }
  } else {
    console.warn('importsFolderId not set in TENANT_CONFIG. Skipping _Imports folder check.');
  }

  // --- _Trash folder ---
  if (cfg.trashFolderId) {
    try {
      DriveApp.getFolderById(cfg.trashFolderId);
      console.log('_Trash folder verified: ' + cfg.trashFolderId);
    } catch (e) {
      console.warn('_Trash folder not accessible: ' + cfg.trashFolderId + ' — ' + e.message);
    }
  } else {
    console.warn('trashFolderId not set in TENANT_CONFIG. Skipping _Trash folder check.');
  }

  // --- Brand Kit folder ---
  if (cfg.brandKitFolderId) {
    try {
      DriveApp.getFolderById(cfg.brandKitFolderId);
      console.log('Brand Kit folder verified: ' + cfg.brandKitFolderId);
    } catch (e) {
      console.warn('Brand Kit folder not accessible: ' + cfg.brandKitFolderId + ' — ' + e.message);
    }
  }

  console.log('doc-hub setup complete.');
  return { ok: true, message: 'Setup complete.' };
}

/**
 * Gets or creates a sheet with the given name in the given spreadsheet.
 * If the sheet does not exist, creates it and writes the headers row.
 * If the sheet exists but has no headers row, writes the headers.
 * @param {string} spreadsheetId
 * @param {string} sheetName
 * @param {string[]} headers
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getOrCreateSheet(spreadsheetId, sheetName, headers) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    console.log(`Creating sheet "${sheetName}" in spreadsheet ${spreadsheetId}`);
    sheet = ss.insertSheet(sheetName);
  }

  // Write headers if the first row is empty
  const firstRowValues = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const isEmpty = firstRowValues.every(v => v === '' || v === null || v === undefined);

  if (isEmpty) {
    console.log(`Writing headers for "${sheetName}"`);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else {
    console.log(`Sheet "${sheetName}" already has headers, skipping.`);
  }

  return sheet;
}

/**
 * Seeds the _manifest sheet with KUILL v1 templates.
 * Idempotent: checks if the template ID already exists before inserting.
 * Run once from Apps Script editor after setup().
 */
function seedManifestKuillV1() {
  const cfg = getConfig();
  const ss = SpreadsheetApp.openById(cfg.manifestSheetId);
  const sheet = ss.getSheetByName('Manifest');
  if (!sheet) throw new Error('Manifest sheet not found. Run setup() first.');

  const templates = [
    {
      id: 'nda-kuill-pilot',
      category: 'Legal',
      name: 'NDA Kuill Pilot',
      description: 'Acuerdo de no-divulgacion para instituciones en piloto. Cubre confidencialidad, proteccion de datos (Ley 19.628), uso de marca y arbitraje.',
      template_file_id: '13eXB5CL-O_xcO7g9RWbO5ZrD6RachpFAT0HRfYiMnek',
      output_folder_id: '1KKa0jvp-p-gO14ApTlxvA1Pm-jEhVem_',
      naming_pattern: 'NDA-Kuill-Pilot-{{nombre_institucion_slug}}-{{YYYY-MM}}',
      tokens_schema: JSON.stringify({nombre_institucion:{type:'string',description:'Nombre completo de la institucion',required:true},rut_institucion:{type:'string',description:'RUT de la institucion',required:true},nombre_representante:{type:'string',description:'Nombre del representante legal',required:true},cargo_representante:{type:'string',description:'Cargo del representante',required:true},fecha:{type:'string',description:'Fecha del acuerdo',required:true},duracion_piloto:{type:'string',description:'Duracion del piloto (ej: 6 semanas)',required:false},numero_estudiantes:{type:'string',description:'Numero de estudiantes',required:false},numero_docentes:{type:'string',description:'Numero de docentes',required:false},nivel_educativo:{type:'string',description:'Nivel educativo',required:false},duracion_semanas:{type:'string',description:'Semanas del piloto',required:false}}),
      required_inputs: JSON.stringify(['nombre_institucion','rut_institucion','nombre_representante','cargo_representante','fecha']),
      suggested_sources: JSON.stringify(['Management/Legal','KUILL-legal/09-Pilots-Research']),
      doc_type: 'document',
      owner: 'admin@example.com',
      version: '1.0.0',
      active: true
    },
    {
      id: 'acuerdo-piloto-colegio',
      category: 'Legal',
      name: 'Acuerdo de Colaboracion Piloto',
      description: 'Acuerdo de colaboracion para piloto de validacion de producto. Define alcance, hipotesis pre-registradas, responsabilidades, gobernanza y proteccion de datos.',
      template_file_id: '1FVnxCGX6vsJb16NbWK3WaOSGcS608khfhsMpFxZp9M4',
      output_folder_id: '1KKa0jvp-p-gO14ApTlxvA1Pm-jEhVem_',
      naming_pattern: 'Acuerdo-Piloto-{{nombre_colegio_slug}}-{{YYYY-MM}}',
      tokens_schema: JSON.stringify({nombre_colegio:{type:'string',description:'Nombre completo del establecimiento',required:true},rut_colegio:{type:'string',description:'RUT del colegio',required:true},nombre_director:{type:'string',description:'Nombre del director o representante legal',required:true},cargo_director:{type:'string',description:'Cargo del firmante',required:true},fecha_inicio:{type:'string',description:'Fecha de inicio del piloto',required:true},duracion_semanas:{type:'string',description:'Duracion en semanas',required:false},numero_docentes:{type:'string',description:'Numero de docentes participantes',required:false},numero_estudiantes:{type:'string',description:'Numero aproximado de estudiantes',required:false},nivel_educativo:{type:'string',description:'Nivel educativo involucrado',required:false},piloto_manager_kuill:{type:'string',description:'Nombre del piloto manager de KUILL',required:false},piloto_manager_colegio:{type:'string',description:'Nombre del contacto institucional del colegio',required:false}}),
      required_inputs: JSON.stringify(['nombre_colegio','rut_colegio','nombre_director','cargo_director','fecha_inicio']),
      suggested_sources: JSON.stringify(['KUILL-legal/09-Pilots-Research','Product/Pilot-projects','Product/Pilot-toolkit']),
      doc_type: 'document',
      owner: 'admin@example.com',
      version: '1.0.0',
      active: true
    },
    {
      id: 'propuesta-piloto',
      category: 'Comercial',
      name: 'Propuesta de Piloto',
      description: 'Deck de propuesta para presentar el piloto KUILL a un colegio. Incluye problema, como funciona, propuesta especifica, evidencia a generar y proximos pasos.',
      template_file_id: '1hduDBe7cNCfmG6szSd75LBzFsNGkKr2LNrBDGF-Xjqg',
      output_folder_id: '15e5j1TSNEUbSYAMHLSR25OzzU127YZCi',
      naming_pattern: 'Propuesta-Piloto-{{nombre_colegio_slug}}-{{YYYY-MM}}',
      tokens_schema: JSON.stringify({nombre_colegio:{type:'string',description:'Nombre del establecimiento',required:true},nombre_director:{type:'string',description:'Nombre del director',required:true},fecha_presentacion:{type:'string',description:'Fecha de la propuesta',required:true},numero_docentes:{type:'string',description:'Numero de docentes piloto',required:false},nivel_educativo:{type:'string',description:'Nivel educativo',required:false},duracion_semanas:{type:'string',description:'Duracion propuesta en semanas',required:false}}),
      required_inputs: JSON.stringify(['nombre_colegio','nombre_director','fecha_presentacion']),
      suggested_sources: JSON.stringify(['Product/Pilot-toolkit','Management/Investors','KUILL-handoff/02-product-vision-positioning.md']),
      doc_type: 'document',
      owner: 'admin@example.com',
      version: '1.0.0',
      active: true
    },
    {
      id: 'deck-kickoff-docente',
      category: 'Internos',
      name: 'Deck Kickoff Docente',
      description: 'Presentacion de kickoff para docentes al inicio del piloto. Explica como funciona KUILL, el principio LA IA propone el docente dispone, y los acuerdos operativos.',
      template_file_id: '1ic09kaIJ4KGNGGtPDODWHNgTxig70KmB44LffqSjhBI',
      output_folder_id: '1grPkBuyLDPKm1s2znOFdBuDbgDiePL66',
      naming_pattern: 'Deck-Kickoff-Docente-{{nombre_colegio_slug}}-{{YYYY-MM}}',
      tokens_schema: JSON.stringify({nombre_colegio:{type:'string',description:'Nombre del establecimiento',required:true},fecha_sesion:{type:'string',description:'Fecha de la sesion de kickoff',required:true},nivel_educativo:{type:'string',description:'Nivel del grupo',required:false},nombre_coordinador:{type:'string',description:'Nombre del coordinador KUILL en el colegio',required:false},piloto_manager_kuill:{type:'string',description:'Nombre del piloto manager de KUILL',required:false}}),
      required_inputs: JSON.stringify(['nombre_colegio','fecha_sesion']),
      suggested_sources: JSON.stringify(['Product/Pilot-toolkit','KUILL-handoff/03-personas-and-roles.md']),
      doc_type: 'document',
      owner: 'admin@example.com',
      version: '1.0.0',
      active: true
    },
    {
      id: 'deck-directivos',
      category: 'Comercial',
      name: 'Deck para Directivos',
      description: 'Presentacion ejecutiva para directores y equipos directivos de colegios. Explica el valor de KUILL, el principio de la IA copiloto, la propuesta del piloto y proteccion de datos.',
      template_file_id: '1-mxHHcStulZz7QA-m-izjS2W-_yq78HTUINXAo5vfCI',
      output_folder_id: '15e5j1TSNEUbSYAMHLSR25OzzU127YZCi',
      naming_pattern: 'Deck-Directivos-{{nombre_colegio_slug}}-{{YYYY-MM}}',
      tokens_schema: JSON.stringify({nombre_colegio:{type:'string',description:'Nombre del establecimiento',required:true},nombre_director:{type:'string',description:'Nombre del director',required:false},fecha:{type:'string',description:'Fecha de la presentacion',required:false},nivel_educativo:{type:'string',description:'Nivel educativo propuesto',required:false},duracion_semanas:{type:'string',description:'Duracion del piloto propuesto',required:false}}),
      required_inputs: JSON.stringify(['nombre_colegio']),
      suggested_sources: JSON.stringify(['Management/Investors','Management/Sales','KUILL-handoff/02-product-vision-positioning.md','KUILL-handoff/06-pricing-and-packaging.md']),
      doc_type: 'document',
      owner: 'admin@example.com',
      version: '1.0.0',
      active: true
    }
  ];

  // Get existing IDs to avoid duplicates
  const data = sheet.getDataRange().getValues();
  const existingIds = data.slice(1).map(row => row[0]).filter(Boolean);

  let added = 0;
  templates.forEach(t => {
    if (existingIds.includes(t.id)) {
      console.log('Skipping existing template: ' + t.id);
      return;
    }
    const row = [
      t.id, t.category, t.name, t.description, t.template_file_id,
      t.output_folder_id, t.naming_pattern, t.tokens_schema,
      t.required_inputs, t.suggested_sources, t.doc_type,
      t.owner, t.version, String(t.active)
    ];
    sheet.appendRow(row);
    console.log('Added template: ' + t.id);
    added++;
  });

  console.log('seedManifestKuillV1 complete. Added: ' + added + ', Skipped: ' + (templates.length - added));
  return { added, skipped: templates.length - added };
}

/**
 * Clones a branded source Drive file into destFolder, renames it to [template] {displayName},
 * and replaces old-style literal placeholders with {{token}} notation.
 * Idempotent: skips if [template] {displayName} already exists in dest folder.
 */
function cloneAndTokenizeTemplate(sourceId, destFolderId, displayName, tokenMap) {
  const templateName = '[template] ' + displayName;
  const destFolder = DriveApp.getFolderById(destFolderId);

  const existing = destFolder.getFilesByName(templateName);
  if (existing.hasNext()) {
    const existingFile = existing.next();
    console.log('cloneAndTokenize: skipping existing ' + templateName);
    return { fileId: existingFile.getId(), skipped: true };
  }

  const sourceFile = DriveApp.getFileById(sourceId);
  const copy = sourceFile.makeCopy(templateName, destFolder);
  const newId = copy.getId();
  const mimeType = copy.getMimeType();
  console.log('cloneAndTokenize: created ' + templateName + ' → ' + newId);

  const entries = Object.keys(tokenMap || {});
  if (entries.length === 0) return { fileId: newId, skipped: false };

  try {
    if (mimeType === MimeType.GOOGLE_DOCS) {
      const doc = DocumentApp.openById(newId);
      const body = doc.getBody();
      const header = doc.getHeader();
      const footer = doc.getFooter();
      entries.forEach(function(old) {
        body.replaceText(escapeRegexChars(old), tokenMap[old]);
        if (header) header.replaceText(escapeRegexChars(old), tokenMap[old]);
        if (footer) footer.replaceText(escapeRegexChars(old), tokenMap[old]);
      });
      doc.saveAndClose();
    } else if (mimeType === MimeType.GOOGLE_SLIDES) {
      const pres = SlidesApp.openById(newId);
      entries.forEach(function(old) {
        pres.replaceAllText(old, tokenMap[old]);
      });
      pres.save();
    } else {
      console.log('cloneAndTokenize: unsupported mime for tokenization: ' + mimeType);
    }
  } catch (err) {
    console.error('cloneAndTokenize error for ' + templateName + ': ' + err.message);
  }

  return { fileId: newId, skipped: false };
}

function escapeRegexChars(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function updateManifestTemplateFileId(templateId, newFileId, cfg) {
  const ss = SpreadsheetApp.openById(cfg.manifestSheetId);
  const sheet = ss.getSheetByName('Manifest');
  if (!sheet) throw new Error('Manifest sheet not found');
  const data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === templateId) {
      sheet.getRange(i + 1, 5).setValue(newFileId);
      console.log('Updated manifest ' + templateId + ' -> ' + newFileId);
      return;
    }
  }
  console.warn('Manifest row not found: ' + templateId);
}

function setupBrandedTemplatesKuillV1() {
  const cfg = getConfig();
  const results = [];

  const LEGAL_FOLDER = '1-xbMZSpBCZ6qzl6t_cfopI3-7UetibDj';
  const COMERCIAL_FOLDER = '10JX9h7CPtPajTWQQ0_g6cu722MOQWwWD';
  const OLD_IDS = [
    '13eXB5CL-O_xcO7g9RWbO5ZrD6RachpFAT0HRfYiMnek',
    '1FVnxCGX6vsJb16NbWK3WaOSGcS608khfhsMpFxZp9M4',
    '1hduDBe7cNCfmG6szSd75LBzFsNGkKr2LNrBDGF-Xjqg',
    '1ic09kaIJ4KGNGGtPDODWHNgTxig70KmB44LffqSjhBI',
    '1-mxHHcStulZz7QA-m-izjS2W-_yq78HTUINXAo5vfCI'
  ];

  // STEP 0: Trash old plain-text templates BEFORE clone check so idempotency doesn't match them
  // setTrashed(true) works correctly on Shared Drive files unlike folder.removeFile()
  OLD_IDS.forEach(function(oldId) {
    try {
      var oldFile = DriveApp.getFileById(oldId);
      var name = oldFile.getName();
      oldFile.setTrashed(true);
      console.log('Pre-trashed old template: ' + name + ' (' + oldId + ')');
    } catch (err) {
      console.log('Could not trash ' + oldId + ': ' + err.message);
    }
  });

  var templates = [
    {
      manifestId: 'nda-kuill-pilot',
      sourceId: '1Z0b9fbURmFrAbyCX2256uwYafj4ceFdnT-EAMWo0syw',
      destFolderId: LEGAL_FOLDER,
      displayName: 'NDA-Kuill-Pilot',
      tokenMap: {
        'a [Día] de [Mes] de 2026': 'a {{fecha}}',
        '[Nombre de la Institución]': '{{nombre_institucion}}',
        '[Insertar RUT]': '{{rut_institucion}}',
        '[Nombre del Representante]': '{{nombre_representante}}',
        '[Insertar Dirección]': '{{direccion_institucion}}',
        '[Insertar Comuna]': '{{comuna_institucion}}',
        '[nombre-apellido]': '{{nombre_representante}}',
        '[Insertar Meses]': '{{duracion_piloto}}',
        '[Insertar Número] estudiantes': '{{numero_estudiantes}} estudiantes',
        '[Insertar Número] docentes': '{{numero_docentes}} docentes',
        '[Ej: 3ro a 6to Básico]': '{{nivel_educativo}}',
        '[Ej: 09:00 a 18:00 hrs]': '{{horario_soporte}}',
        '[Insertar número, ej: 2]': '{{numero_sesiones_feedback}}'
      }
    },
    {
      manifestId: 'acuerdo-piloto-colegio',
      sourceId: '1kVAj-wpH3uNAhQK4zQiVgLASP3HCWPtsMf8nrnw2mis',
      destFolderId: LEGAL_FOLDER,
      displayName: 'Acuerdo-Piloto-Colegio',
      tokenMap: {
        'Colegio San Esteban Mártir': '{{nombre_colegio}}',
        'San Esteban Mártir': '{{nombre_colegio}}',
        'san-esteban-martir': '{{nombre_colegio_slug}}',
        '[nombre cofundador docente]': '{{piloto_manager_kuill}}'
      }
    },
    {
      manifestId: 'propuesta-piloto',
      sourceId: '1aCM5E8zmYhPhblO9vhg9pO6RLnuMUdKW3l2BPPn6t9I',
      destFolderId: COMERCIAL_FOLDER,
      displayName: 'Propuesta-Piloto',
      tokenMap: {
        'KUILL × Colegio San Esteban Mártir': 'KUILL × {{nombre_colegio}}',
        'Colegio San Esteban Mártir': '{{nombre_colegio}}',
        'San Esteban Mártir': '{{nombre_colegio}}',
        'san-esteban-martir': '{{nombre_colegio_slug}}',
        'Abril 2026': '{{fecha_inicio}}',
        '[nombre cofundador docente]': '{{piloto_manager_kuill}}'
      }
    },
    {
      manifestId: 'deck-directivos',
      sourceId: '1rEvv6DKU3ASDlWPOLR8OhxLFEQRBWI7YCePk8Bqtlgk',
      destFolderId: COMERCIAL_FOLDER,
      displayName: 'Deck-Directivos',
      tokenMap: {
        'Colegio San Esteban Mártir': '{{nombre_colegio}}',
        'San Esteban Mártir': '{{nombre_colegio}}'
      }
    }
  ];

  templates.forEach(function(tpl) {
    try {
      var result = cloneAndTokenizeTemplate(tpl.sourceId, tpl.destFolderId, tpl.displayName, tpl.tokenMap);
      updateManifestTemplateFileId(tpl.manifestId, result.fileId, cfg);
      results.push({ id: tpl.manifestId, fileId: result.fileId, skipped: result.skipped, ok: true });
    } catch (err) {
      console.error('Error: ' + tpl.manifestId + ' — ' + err.message);
      results.push({ id: tpl.manifestId, ok: false, error: err.message });
    }
  });

  return { ok: true, results: results };
}

/**
 * createNDATemplate is defined in setup-nda-kuill.gs (tenant-specific, not tracked in public repo).
 * To use: add apps-script/src/setup-nda-kuill.gs to your local checkout before clasp push.
 */
function createNDATemplate() {
  throw new Error('createNDATemplate requires setup-nda-kuill.gs — see apps-script/src/setup-nda-kuill.gs.example');
}
