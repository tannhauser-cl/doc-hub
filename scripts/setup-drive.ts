/**
 * setup-drive.ts
 *
 * One-time script to create the DOC HUB folder structure in a Google Shared Drive.
 * Run with: npx ts-node scripts/setup-drive.ts
 *
 * Prerequisites:
 *   - GOOGLE_APPLICATION_CREDENTIALS pointing to a service account JSON with
 *     domain-wide delegation, OR a user OAuth token with Drive scope.
 *   - Set SHARED_DRIVE_ID env var (the root shared drive to structure).
 *   - The service account must have 'Manager' access on the shared drive.
 *
 * What it creates:
 *   Management/{Finance,Branding,Legal,Investors,Corporate,GTM,Growth,Sales,Talent,Governance}
 *   Product/{Pilot-toolkit,Pilot-projects,LearningOps,Projects}
 *   Doc-templates/{Legal,Comercial,Internos,Governance,Brand-Kit}
 *   _Registry/
 *   _Imports/
 *   _Trash/
 *
 * After running, it prints a tenant.config.json template with all folder IDs filled in.
 */

import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';

const SHARED_DRIVE_ID = process.env.SHARED_DRIVE_ID;
if (!SHARED_DRIVE_ID) {
  console.error('Error: SHARED_DRIVE_ID env var is required');
  process.exit(1);
}

const STRUCTURE: Record<string, string[]> = {
  'Management': ['Finance', 'Branding', 'Legal', 'Investors', 'Corporate', 'GTM', 'Growth', 'Sales', 'Talent', 'Governance'],
  'Product': ['Pilot-toolkit', 'Pilot-projects', 'LearningOps', 'Projects'],
  'Doc-templates': ['Legal', 'Comercial', 'Internos', 'Governance', 'Brand-Kit'],
  '_Registry': [],
  '_Imports': [],
  '_Trash': [],
};

interface FolderIds {
  [key: string]: string | Record<string, string>;
}

async function getAuth() {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return auth.getClient();
}

async function createFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string,
  driveId: string
): Promise<string> {
  const existing = await drive.files.list({
    q: `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    driveId,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    fields: 'files(id,name)',
  });

  if (existing.data.files && existing.data.files.length > 0) {
    const id = existing.data.files[0].id!;
    console.log(`  ✓ Already exists: ${name} (${id})`);
    return id;
  }

  const res = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
      driveId,
    },
    fields: 'id',
  });

  const id = res.data.id!;
  console.log(`  ✓ Created: ${name} (${id})`);
  return id;
}

async function createSheet(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string,
  driveId: string
): Promise<string> {
  const existing = await drive.files.list({
    q: `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    driveId,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    fields: 'files(id,name)',
  });

  if (existing.data.files && existing.data.files.length > 0) {
    const id = existing.data.files[0].id!;
    console.log(`  ✓ Sheet already exists: ${name} (${id})`);
    return id;
  }

  const res = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: [parentId],
    },
    fields: 'id',
  });

  const id = res.data.id!;
  console.log(`  ✓ Created sheet: ${name} (${id})`);
  return id;
}

async function main() {
  console.log('\n🚀 Setting up DOC HUB structure in shared drive:', SHARED_DRIVE_ID);

  const auth = await getAuth();
  const drive = google.drive({ version: 'v3', auth });

  const folderIds: FolderIds = {};
  const registryIds: Record<string, string> = {};

  console.log('\n📁 Creating folder structure...');

  for (const [topName, children] of Object.entries(STRUCTURE)) {
    console.log(`\n  ${topName}/`);
    const topId = await createFolder(drive, topName, SHARED_DRIVE_ID, SHARED_DRIVE_ID);
    folderIds[topName] = topId;

    if (children.length > 0) {
      const childIds: Record<string, string> = {};
      for (const child of children) {
        console.log(`    ${child}/`);
        childIds[child] = await createFolder(drive, child, topId, SHARED_DRIVE_ID);
      }
      folderIds[topName] = { _id: topId, ...childIds };
    }
  }

  console.log('\n📊 Creating Registry sheets...');
  const registryFolderId = typeof folderIds['_Registry'] === 'string'
    ? folderIds['_Registry'] as string
    : (folderIds['_Registry'] as Record<string, string>)._id;

  registryIds['document-registry'] = await createSheet(drive, 'Document-Registry', registryFolderId, SHARED_DRIVE_ID);
  registryIds['audit-trail'] = await createSheet(drive, 'Audit-Trail', registryFolderId, SHARED_DRIVE_ID);

  const docTemplatesFolderId = typeof folderIds['Doc-templates'] === 'string'
    ? folderIds['Doc-templates'] as string
    : (folderIds['Doc-templates'] as Record<string, string>)._id;

  registryIds['manifest'] = await createSheet(drive, '_manifest', docTemplatesFolderId, SHARED_DRIVE_ID);

  const importsFolderId = folderIds['_Imports'] as string;
  const trashFolderId = folderIds['_Trash'] as string;
  const brandKitFolderId = typeof folderIds['Doc-templates'] === 'object'
    ? (folderIds['Doc-templates'] as Record<string, string>)['Brand-Kit']
    : '';

  console.log('\n✅ Setup complete!\n');
  console.log('─'.repeat(60));
  console.log('Paste this into your tenant.config.json:\n');

  const tenantId = process.env.DOC_HUB_TENANT_ID || 'my-tenant';
  const adminEmail = process.env.DOC_HUB_ADMIN_EMAIL || 'admin@example.com';

  const config = {
    tenantId,
    sharedDriveId: SHARED_DRIVE_ID,
    brandKitFolderId,
    registrySheetId: registryIds['document-registry'],
    auditTrailSheetId: registryIds['audit-trail'],
    manifestSheetId: registryIds['manifest'],
    importsFolderId,
    trashFolderId,
    adminEmail,
    notifyEmail: adminEmail,
    trash: { docTtlDays: 30, snapshotTtlDays: 90 },
    lock: { defaultTtlMinutes: 30 },
    linter: {
      enabled: true,
      orphanWarningDays: 7,
      similarityThreshold: 0.85,
      forbiddenPatterns: ['FINAL', '_v\\d+', '\\(\\d+\\)', 'Copy of', 'DRAFT_', 'WIP_', 'OLD_'],
    },
    webAppUrl: 'REPLACE_AFTER_CLASP_DEPLOY',
  };

  console.log(JSON.stringify(config, null, 2));
  console.log('\n' + '─'.repeat(60));

  const outputPath = path.join(process.cwd(), 'tenant.config.generated.json');
  fs.writeFileSync(outputPath, JSON.stringify(config, null, 2));
  console.log(`\n💾 Also saved to: ${outputPath}`);
  console.log('\nNext steps:');
  console.log('  1. cp tenant.config.generated.json tenant.config.json');
  console.log('  2. clasp push from apps-script/');
  console.log('  3. Run setup() in Apps Script editor to initialize sheet headers');
  console.log('  4. Update webAppUrl in tenant.config.json after deploying as Web App');
  console.log('  5. npm run build in mcp-server/');
  console.log('  6. Copy skills/doc-hub/ to .claude/skills/doc-hub/ in your project\n');
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
