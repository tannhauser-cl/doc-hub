# Tenant Onboarding

How to set up a new organization on doc-hub from scratch.

## Prerequisites

- Google Workspace account with a Shared Drive created
- Node.js 18+ installed
- `clasp` installed globally: `npm install -g @google/clasp`
- `clasp login` completed (or service account configured)

## Step 1 — Run Drive setup script

```bash
SHARED_DRIVE_ID=0AO_V31CVzrqnUk9PVA npx ts-node scripts/setup-drive.ts
```

This creates the full folder structure in your Shared Drive and prints the IDs you need.

## Step 2 — Configure tenant.config.json

```bash
cp tenant.config.example.json tenant.config.json
# fill in the IDs printed by the setup script
```

## Step 3 — Deploy Apps Script engine

```bash
cd apps-script
clasp create --title "DOC HUB Engine" --type standalone
clasp push
```

Then in the Apps Script editor:
1. Open the project
2. Run the `setup()` function to initialize sheet headers
3. Deploy as Web App: Execute as "User accessing the web app", Access "Anyone in your domain"
4. Copy the Web App URL

## Step 4 — Update webAppUrl

Edit `tenant.config.json` and set `webAppUrl` to the URL from step 3.

## Step 5 — Store config in Apps Script properties

In the Apps Script editor, go to Project Settings → Script Properties, add:
- Key: `TENANT_CONFIG`
- Value: the full contents of your `tenant.config.json`
- Key: `API_TOKEN`
- Value: a strong random secret (e.g., `openssl rand -hex 32`). This token authenticates every MCP → Apps Script call. Keep it secret.

## Step 6 — Build and configure MCP server

```bash
cd mcp-server
npm install
npm run build
```

Add to Claude Code's MCP config (`~/.claude/mcp.json` or project `.claude/mcp.json`):

```json
{
  "mcpServers": {
    "doc-hub": {
      "command": "node",
      "args": ["path/to/doc-hub/mcp-server/dist/server.js"],
      "env": {
        "DOC_HUB_WEB_APP_URL": "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec",
        "DOC_HUB_TENANT_ID": "kuill",
        "DOC_HUB_API_TOKEN": "your-secret-token-from-step-5"
      }
    }
  }
}
```

## Step 7 — Install agent skills

```bash
cp -r skills/doc-hub /path/to/your-project/.claude/skills/doc-hub
```

Or for the KUILL monorepo:
```bash
cp -r skills/doc-hub D:/PROGRAMMING/KUILL/.claude/skills/doc-hub
```

## Step 8 — Upload Brand Kit

In the Google Drive `DOC HUB/Doc-templates/Brand-Kit/` folder:
1. Upload `brand-tokens.json` (see format below)
2. Upload logo files (SVG preferred, PNG fallback)
3. Create master templates: `Cover-page` (Google Doc), `Slide-master` (Google Slides)

### brand-tokens.json format

```json
{
  "colors": {
    "primary": "#6c47b8",
    "secondary": "#1a1a2e",
    "accent": "#e8e0f5",
    "text": "#1a1a2e",
    "background": "#ffffff",
    "surface": "#f8f5ff"
  },
  "typography": {
    "heading": "Inter",
    "body": "Inter",
    "mono": "JetBrains Mono"
  },
  "logo": {
    "primary": "REPLACE_WITH_DRIVE_FILE_ID",
    "dark": "REPLACE_WITH_DRIVE_FILE_ID",
    "light": "REPLACE_WITH_DRIVE_FILE_ID"
  },
  "spacing": {
    "pagePaddingPt": 72,
    "sectionGapPt": 24
  },
  "voice": {
    "tone": "professional, warm, clear",
    "avoid": ["jargon", "passive voice", "bullet points as prose"]
  }
}
```

## Step 9 — Add first templates

Add rows to the `_manifest` sheet in `_Registry/`. Required columns (in order):

`id | category | name | description | template_file_id | output_folder_id | naming_pattern | tokens_schema | required_inputs | suggested_sources | doc_type | owner | version | active`

Example first row (NDA):
- id: `nda-kuill-pilot`
- category: `Legal`
- name: `NDA Kuill Pilot`
- description: `Non-disclosure agreement for institutional pilot programs`
- template_file_id: `[Google Doc ID of your NDA template]`
- output_folder_id: `[folder ID of Management/Legal]`
- naming_pattern: `NDA-Kuill-Pilot-{{cliente}}-{{YYYY-MM}}`
- tokens_schema: `{"cliente":{"type":"string","description":"Institution name","required":true},"firmante":{"type":"string","description":"Signatory full name","required":true},"scope":{"type":"string","description":"Pilot scope description","required":false}}`
- required_inputs: `["cliente","firmante"]`
- suggested_sources: `["Management/Legal","KUILL-handoff"]`
- doc_type: `document`
- owner: `admin@example.com`
- version: `1.0.0`
- active: `TRUE`

## Step 10 — Verify

Test the full flow:
```
# In Claude Code (after MCP configured):
doc-find --query "test"
find-templates
doc-create --template nda-kuill-pilot --inputs '{"cliente":"Test Corp","firmante":"Juan Test"}'
```

You should see the NDA appear in `Management/Legal/` in your Drive.
