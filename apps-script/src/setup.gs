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
 * Creates the NDA-Kuill-Pilot template as a Google Doc in Doc-templates/Legal/
 * with KUILL SPA legal entity info hardcoded and {{tokens}} for the institution.
 * Based on Chilean NDA legal framework (UDD + UANDES models).
 * Idempotent: if [template] NDA-Kuill-Pilot already exists, trashes it first.
 */
function createNDATemplate() {
  var cfg = getConfig();
  var LEGAL_TEMPLATES_FOLDER = '1-xbMZSpBCZ6qzl6t_cfopI3-7UetibDj';
  var MANIFEST_NDA_OLD_ID = '11pkaSdwE3i_tgPcsKsO3nSzTVLRPaelBdrzk7HrqJQM';
  var templateName = '[template] NDA-Kuill-Pilot';

  // Trash any existing template with this name
  var folder = DriveApp.getFolderById(LEGAL_TEMPLATES_FOLDER);
  var existing = folder.getFilesByName(templateName);
  while (existing.hasNext()) {
    var old = existing.next();
    console.log('Trashing old NDA template: ' + old.getId());
    old.setTrashed(true);
  }
  // Also trash old ID if accessible
  try { DriveApp.getFileById(MANIFEST_NDA_OLD_ID).setTrashed(true); } catch(e) {}

  // Create new Google Doc
  var doc = DocumentApp.create(templateName);
  var docId = doc.getId();
  var body = doc.getBody();

  // Move to correct folder
  var rootFile = DriveApp.getFileById(docId);
  folder.addFile(rootFile);
  rootFile.getParents().next().removeFile(rootFile);

  // Build NDA content
  var lines = [
    'ACUERDO DE CONFIDENCIALIDAD',
    '',
    'En Santiago de Chile, a {{fecha}}, comparecen:',
    '',
    '1. KUILL SPA, RUT N° 78.405.972-3, del giro Desarrollo de Software, representada por don REPRESENTATIVE_NAME, R.U.N. N° REPRESENTATIVE_RUT, ambos domiciliados en Avenida COMPANY_ADDRESS, Santiago; en adelante también "KUILL"; y',
    '',
    '2. {{nombre_institucion}}, RUT N° {{rut_institucion}}, representada por {{nombre_representante}}, {{cargo_representante}}, ambos domiciliados en {{direccion_institucion}}, comuna de {{comuna_institucion}}, Santiago; en adelante también "la INSTITUCIÓN".',
    '',
    'KUILL y la INSTITUCIÓN se denominarán conjuntamente "las Partes".',
    '',
    'Las Partes han convenido celebrar el presente Acuerdo de Confidencialidad, sujeto a las siguientes cláusulas:',
    '',
    '',
    'PRIMERA: DECLARACIONES.',
    '',
    'A. KUILL ha decidido transmitir a la INSTITUCIÓN cierta información confidencial, de su propiedad, en formatos físicos, electrónicos, orales o inmateriales, a la que se denominará "Información Confidencial", con el propósito de llevar a cabo un piloto gratuito de validación de producto, constituyéndose en parte divulgante para los efectos de este acuerdo.',
    '',
    'B. La INSTITUCIÓN declara que, en virtud de la naturaleza de este acuerdo, se constituye como parte receptora de la Información Confidencial.',
    '',
    '',
    'SEGUNDA: DEFINICIÓN DE INFORMACIÓN CONFIDENCIAL.',
    '',
    'Para los efectos del presente Acuerdo, "Información Confidencial" comprende toda información y know-how divulgados por KUILL, sea o no por escrito, en formato digital, tangible o no, que pueda razonablemente entenderse que tiene tal carácter. Esto incluye, de manera ilustrativa y no limitativa: algoritmos, código fuente, arquitectura de software, modelos de lenguaje e inteligencia artificial, metodologías pedagógicas, criterios de evaluación, rúbricas, datos de entrenamiento, documentación técnica, interfaces de usuario (UI/UX), estrategias y planes de negocio, datos financieros, información de clientes y proveedores, y cualquier otro material técnico o comercial vinculado a la plataforma KUILL.',
    '',
    '',
    'TERCERA: OBLIGACIONES DE CONFIDENCIALIDAD.',
    '',
    'La INSTITUCIÓN se obliga a:',
    '',
    'a) No divulgar a terceros la Información Confidencial que reciba de KUILL, dándole el mismo tratamiento que a su propia información confidencial, pero empleando en todo caso un estándar de cuidado no inferior al razonable.',
    '',
    'b) Restringir el acceso a la Información Confidencial a sus directivos, empleados y asesores que tengan estricta necesidad de conocerla para los fines autorizados, informándoles de su carácter confidencial.',
    '',
    'c) No reproducir la Información Confidencial sin autorización escrita previa de KUILL.',
    '',
    'd) No reestructurar, descompilar, desensamblar ni realizar ingeniería inversa sobre ningún componente de la Información Confidencial.',
    '',
    '',
    'CUARTA: PROPIEDAD Y AUSENCIA DE LICENCIA.',
    '',
    'La INSTITUCIÓN acepta que la Información Confidencial es y seguirá siendo propiedad exclusiva de KUILL. Este instrumento no otorga, de manera expresa ni implícita, licencia alguna sobre patentes, derechos de autor, marcas comerciales, secretos industriales u otro derecho de propiedad intelectual o industrial de KUILL.',
    '',
    '',
    'QUINTA: USO PERMITIDO.',
    '',
    'La INSTITUCIÓN se obliga a utilizar la Información Confidencial exclusivamente para evaluar la plataforma KUILL en el marco del piloto gratuito de validación de producto descrito en el Anexo A del presente Acuerdo. Queda prohibido todo otro uso.',
    '',
    '',
    'SEXTA: FEEDBACK, DATOS Y PROPIEDAD INTELECTUAL.',
    '',
    'A. Propiedad del feedback: toda sugerencia, idea de mejora u observación aportada por la INSTITUCIÓN, sus directivos, docentes o estudiantes durante el piloto, será de propiedad exclusiva de KUILL, sin derecho a compensación de ninguna especie.',
    '',
    'B. Datos anonimizados: KUILL queda autorizado para procesar, analizar y utilizar estadísticas agregadas y datos debidamente anonimizados generados durante el piloto, para fines de mejora algorítmica, investigación educativa y elaboración de casos de uso comerciales, en conformidad con la Ley N° 19.628 sobre Protección de la Vida Privada y los principios del Reglamento General de Protección de Datos de la Unión Europea (RGPD).',
    '',
    'C. Datos personales: todo tratamiento de datos personales de estudiantes menores de edad se realizará conforme a la normativa vigente en Chile, con consentimiento informado de sus padres o apoderados.',
    '',
    '',
    'SÉPTIMA: USO DE NOMBRE Y MARCA.',
    '',
    'La INSTITUCIÓN autoriza expresamente a KUILL a mencionar su nombre y utilizar su logotipo en presentaciones a inversionistas, materiales de marketing y publicaciones vinculadas al piloto. Esta autorización podrá ser revocada por escrito con aviso de 15 días de anticipación.',
    '',
    '',
    'OCTAVA: EXCLUSIONES.',
    '',
    'No se considerará "Información Confidencial" aquella que:',
    '',
    'a) La INSTITUCIÓN pruebe que se encontraba en su conocimiento con anterioridad a la fecha del presente Acuerdo.',
    '',
    'b) Sea o llegue a ser de dominio público, siempre que ello no sea consecuencia de un incumplimiento de este Acuerdo por la INSTITUCIÓN.',
    '',
    'c) Sea suministrada a la INSTITUCIÓN por terceros que no se encuentren obligados a mantenerla en reserva.',
    '',
    'd) Deba ser revelada en virtud de una orden judicial o resolución de autoridad competente, en cuyo caso la INSTITUCIÓN deberá notificar a KUILL a la brevedad posible antes de cumplir el requerimiento, para que KUILL pueda ejercer las acciones que estime pertinentes.',
    '',
    'En el supuesto de la letra d), la INSTITUCIÓN empleará sus mejores esfuerzos para que la información revelada sea tratada como confidencial por la autoridad requirente, y divulgará solo aquella información estrictamente necesaria.',
    '',
    '',
    'NOVENA: VIGENCIA.',
    '',
    'La vigencia del presente Acuerdo será de {{duracion_confidencialidad}} contados desde su fecha de suscripción, sin perjuicio de que las obligaciones de confidencialidad establecidas en la Cláusula Tercera subsistirán por un período adicional de 2 (dos) años a partir de la terminación del Acuerdo.',
    '',
    '',
    'DÉCIMA: DEVOLUCIÓN Y DESTRUCCIÓN DE INFORMACIÓN.',
    '',
    'Dentro de los 5 días hábiles siguientes a la fecha en que KUILL lo requiera, o al término del piloto, la INSTITUCIÓN deberá devolver o destruir toda la Información Confidencial tangible, incluyendo sus copias. Si la INSTITUCIÓN optare por la destrucción, KUILL podrá exigir una certificación escrita que acredite dicho acto, indicando fecha y modalidad de destrucción.',
    '',
    '',
    'DÉCIMA PRIMERA: RESPONSABILIDAD E INCUMPLIMIENTO.',
    '',
    'En caso de incumplimiento parcial o total de las obligaciones establecidas en este Acuerdo, la INSTITUCIÓN será responsable de todos los daños y perjuicios que dicho incumplimiento ocasione a KUILL. Las Partes reconocen que el pago de perjuicios podría no ser una indemnización suficiente frente a ciertas infracciones, por lo que KUILL quedará facultada para exigir, además, el cumplimiento específico del Acuerdo.',
    '',
    '',
    'DÉCIMA SEGUNDA: NO CESIÓN.',
    '',
    'Ninguna de las Partes podrá ceder sus derechos y obligaciones derivados del presente Acuerdo sin el consentimiento escrito previo de la otra Parte.',
    '',
    '',
    'DÉCIMA TERCERA: INTEGRIDAD Y MODIFICACIONES.',
    '',
    'Este Acuerdo constituye el entendimiento total entre las Partes respecto a la Información Confidencial y reemplaza cualquier acuerdo previo, oral o escrito, sobre la misma materia. Toda modificación deberá constar por escrito y ser suscrita por ambas Partes.',
    '',
    '',
    'DÉCIMA CUARTA: SOLUCIÓN DE CONTROVERSIAS.',
    '',
    'Las Partes se comprometen a intentar resolver directa y amistosamente cualquier desacuerdo relativo a la interpretación o ejecución del presente Acuerdo.',
    '',
    'De no lograrse acuerdo, toda controversia será sometida a arbitraje conforme al Reglamento Procesal de Arbitraje del Centro de Arbitraje y Mediación de Santiago de la Cámara de Comercio de Santiago A.G. Las Partes confieren poder especial e irrevocable a la Cámara de Comercio de Santiago A.G. para designar a un árbitro arbitrador de entre los integrantes de dicho cuerpo arbitral, a petición de cualquiera de ellas.',
    '',
    'En contra de las resoluciones del árbitro no procederá recurso alguno, a los cuales las Partes renuncian expresamente.',
    '',
    '',
    'DÉCIMA QUINTA: LEY APLICABLE Y DOMICILIO.',
    '',
    'El presente Acuerdo se rige por las leyes de la República de Chile. Para todos sus efectos, las Partes fijan domicilio en la ciudad de Santiago.',
    '',
    '',
    'DÉCIMA SEXTA: EJEMPLARES.',
    '',
    'El presente instrumento se firma en dos ejemplares del mismo tenor y fecha, quedando uno en poder de cada Parte.',
    '',
    'La repería de don REPRESENTATIVE_NAME para representar a KUILL SPA consta en escritura pública de fecha _____________, otorgada ante Notaría de _________________.',
    '',
    'La repería de {{nombre_representante}} para representar a {{nombre_institucion}} consta en ________________________.',
    '',
    'Documentos que no se insertan por ser conocidos de las Partes.',
    '',
    '',
    '',
    '______________________________    ______________________________',
    'KUILL SPA                         {{nombre_institucion}}',
    'REPRESENTATIVE_NAME          {{nombre_representante}}',
    'Representante Legal               {{cargo_representante}}',
    'RUT 78.405.972-3                  RUT {{rut_institucion}}',
    '',
    '',
    'ANEXO A — ESPECIFICACIONES DEL PILOTO',
    '',
    '1. Objeto del piloto',
    '   Validación del funcionamiento de la plataforma KUILL en un contexto educativo chileno. El piloto tiene carácter no comercial durante su duración.',
    '',
    '2. Alcance',
    '   - Asignatura: {{asignatura}}.',
    '   - Nivel educativo: {{nivel_educativo}}.',
    '   - Participantes: {{numero_docentes}} docentes y {{numero_estudiantes}} estudiantes.',
    '   - Duración: {{duracion_semanas}} semanas.',
    '   - Modalidad de acceso: SaaS, vía web.',
    '',
    '3. Soporte técnico',
    '   KUILL proveerá soporte técnico remoto en horario hábil durante todo el período del piloto.',
    '',
    '4. Cronograma tentativo',
    '   - Semana 1: Onboarding y capacitación docente (90 minutos).',
    '   - Semanas 2 a {{duracion_semanas}}: Uso activo de la plataforma.',
    '   - Semana final: Entrega de reporte de resultados y cierre.',
    '',
    '5. Principio rector',
    '   "La IA propone, el docente dispone." Toda calificación publicada y todo feedback entregado al estudiante requiere aprobación explícita del docente participante.'
  ];

  // --- Build content ---
  body.clear();
  lines.forEach(function(line) {
    body.appendParagraph(line);
  });

  // --- Apply KUILL branding ---
  var COLOR_PRIMARY = '#7B1FA2';
  var COLOR_BODY    = '#1A1A1A';
  var COLOR_GRAY    = '#424242';
  var FONT          = 'Inter';
  var LOGO_FILE_ID  = '15RxUERq3Nz3INd_VsKoxYWE882BaC3-_';

  // --- Page margins: 72pt (1 inch) ---
  var style = {};
  style[DocumentApp.Attribute.MARGIN_TOP]    = 72;
  style[DocumentApp.Attribute.MARGIN_BOTTOM] = 72;
  style[DocumentApp.Attribute.MARGIN_LEFT]   = 72;
  style[DocumentApp.Attribute.MARGIN_RIGHT]  = 72;
  body.setAttributes(style);

  // --- Header: logo left + document title right ---
  try {
    var header = doc.addHeader();
    header.clear();
    var headerTable = header.appendTable([['', 'ACUERDO DE CONFIDENCIALIDAD']]);
    headerTable.setBorderWidth(0);

    // Logo cell
    var logoCell = headerTable.getCell(0, 0);
    logoCell.setWidth(180);
    var logoBlob = DriveApp.getFileById(LOGO_FILE_ID).getBlob();
    var logoPara = logoCell.getChild(0).asParagraph();
    var logoImg = logoPara.appendInlineImage(logoBlob);
    logoImg.setWidth(110);
    logoImg.setHeight(Math.round(logoImg.getHeight() * 110 / logoImg.getWidth()));
    logoPara.setAlignment(DocumentApp.HorizontalAlignment.LEFT);

    // Title cell
    var titleCell = headerTable.getCell(0, 1);
    var titleText = titleCell.getChild(0).asParagraph();
    titleText.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
    titleText.editAsText()
      .setFontFamily(FONT).setFontSize(9)
      .setBold(false).setForegroundColor(COLOR_GRAY);

    // Horizontal rule under header via paragraph border
    var rulePara = header.appendParagraph('');
    var ruleAttr = {};
    ruleAttr[DocumentApp.Attribute.BORDER_WIDTH] = 1;
    ruleAttr[DocumentApp.Attribute.BORDER_COLOR] = COLOR_PRIMARY;
    rulePara.setAttributes(ruleAttr);
  } catch(e) {
    console.warn('Header creation error: ' + e.message);
  }

  // --- Footer: company info ---
  try {
    var footer = doc.addFooter();
    footer.clear();
    var footerPara = footer.appendParagraph('KUILL SPA · RUT 78.405.972-3 · admin@example.com · Confidencial');
    footerPara.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    footerPara.editAsText()
      .setFontFamily(FONT).setFontSize(8)
      .setForegroundColor(COLOR_GRAY).setBold(false);
  } catch(e) {
    console.warn('Footer creation error: ' + e.message);
  }

  // --- Style body paragraphs ---
  var HEADING_RE = /^(PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|SÉPTIMA|SÉTIMA|OCTAVA|NOVENA|DÉCIMA|DECIMA|ANEXO\s*A)/i;

  var paragraphs = body.getParagraphs();
  paragraphs.forEach(function(p, idx) {
    var text = p.getText().trim();
    var textEl = p.editAsText();

    if (idx === 0 && text.indexOf('ACUERDO DE CONFIDENCIALIDAD') !== -1) {
      p.setHeading(DocumentApp.ParagraphHeading.HEADING1);
      p.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      p.setSpacingAfter(4);
      textEl.setFontFamily(FONT).setFontSize(20).setBold(true).setForegroundColor(COLOR_PRIMARY);

    } else if (HEADING_RE.test(text) && text.length < 80) {
      p.setHeading(DocumentApp.ParagraphHeading.HEADING2);
      p.setSpacingBefore(12);
      p.setSpacingAfter(4);
      textEl.setFontFamily(FONT).setFontSize(11).setBold(true).setForegroundColor(COLOR_PRIMARY);

    } else if (text === '') {
      // keep empty lines minimal
      p.setSpacingBefore(2);
      p.setSpacingAfter(2);

    } else {
      p.setHeading(DocumentApp.ParagraphHeading.NORMAL);
      textEl.setFontFamily(FONT).setFontSize(11).setBold(false).setForegroundColor(COLOR_BODY);
      p.setSpacingAfter(4);
      p.setLineSpacing(1.15);
    }
  });

  doc.saveAndClose();

  console.log('NDA template created: ' + docId);

  // Update manifest
  updateManifestTemplateFileId('nda-kuill-pilot', docId, cfg);

  // Update tokens_schema and required_inputs in manifest
  var ss = SpreadsheetApp.openById(cfg.manifestSheetId);
  var sheet = ss.getSheetByName('Manifest');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === 'nda-kuill-pilot') {
      var newSchema = JSON.stringify({
        fecha:{type:'string',description:'Fecha del acuerdo (ej: 26 de abril de 2026)',required:true},
        nombre_institucion:{type:'string',description:'Nombre completo del establecimiento',required:true},
        rut_institucion:{type:'string',description:'RUT de la institucion',required:true},
        nombre_representante:{type:'string',description:'Nombre del representante legal',required:true},
        cargo_representante:{type:'string',description:'Cargo del firmante (ej: Directora, Rector)',required:true},
        direccion_institucion:{type:'string',description:'Direccion del establecimiento',required:true},
        comuna_institucion:{type:'string',description:'Comuna del establecimiento',required:true},
        duracion_confidencialidad:{type:'string',description:'Vigencia del acuerdo (default: 3 anos)',required:false},
        nivel_educativo:{type:'string',description:'Nivel educativo (ej: 7mo y 8vo Basico)',required:false},
        asignatura:{type:'string',description:'Asignatura objeto del piloto (ej: Lenguaje y Comunicacion)',required:false},
        numero_docentes:{type:'string',description:'Numero de docentes participantes',required:false},
        numero_estudiantes:{type:'string',description:'Numero aproximado de estudiantes',required:false},
        duracion_semanas:{type:'string',description:'Duracion del piloto en semanas',required:false},
        duracion_piloto:{type:'string',description:'Duracion del piloto (texto libre)',required:false}
      });
      var newRequired = JSON.stringify(['fecha','nombre_institucion','rut_institucion','nombre_representante','cargo_representante','direccion_institucion','comuna_institucion']);
      sheet.getRange(i+1, 8).setValue(newSchema);  // tokens_schema col H
      sheet.getRange(i+1, 9).setValue(newRequired); // required_inputs col I
      console.log('Manifest tokens_schema + required_inputs updated for nda-kuill-pilot');
      break;
    }
  }

  return {
    ok: true,
    fileId: docId,
    url: 'https://docs.google.com/document/d/' + docId + '/edit',
    name: templateName
  };
}
