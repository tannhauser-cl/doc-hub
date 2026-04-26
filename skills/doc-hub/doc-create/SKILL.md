---
name: doc-create
description: "Generate a new document from a template, filling in required fields and registering it in the Registry"
version: "1.0.0"
author: doc-hub
license: MIT
category: document-management
tags:
  - drive
  - create
  - templates
department: All
models:
  recommended:
    - claude-opus-4-7
    - claude-sonnet-4-6
mcp:
  server: doc-hub-mcp
  tools:
    - find_templates
    - doc_context
    - doc_create
---

# doc-create

## When to use this skill

Use `doc-create` when the user wants to generate a new document from an existing template. Common triggers:

- "Create an NDA for Colegio San Esteban"
- "Generate a commercial proposal for [client]"
- "Make an offer letter for Carlos Rojas"
- "I need a new pilot agreement for this school"
- "Prepare the fund application document"

**Before calling `doc_create`:**
1. Always call `find_templates` first to confirm the correct template ID and its required fields — never guess template IDs.
2. For anything non-trivial (first time creating a doc type, unclear template, unknown client), run `doc-context` first to gather context and confirm the plan with the user.
3. Never invent values for required input fields. If inputs are missing, ask the user before calling `doc_create`.

## What it does

Clones the specified template in Google Drive, replaces all `{{TOKEN}}` placeholders with the provided values, places the output in the correct category folder, and registers it in the Registry with status `draft`. Returns the Drive URL and the Registry `doc_id`.

## How to use

### Step 1: Identify the template

If the user specifies a template by name or type:
```
find_templates({ query: "NDA" })
// Returns: list of matching templates with id, required_inputs, description
```

If you used `doc-context` in the step before, the template is already resolved — skip this step.

Pick the correct template. Note its `id` (e.g., `nda-kuill-pilot`) and `required_inputs` array.

### Step 2: Collect all required inputs

Compare the template's `required_inputs` against what the user has provided. Common tokens:

- `cliente` — client or entity name (e.g., "Colegio San Esteban")
- `fecha` — date in `YYYY-MM` format (default to current month if not specified, but confirm)
- `scope` — scope description
- `precio_total` — price or fee
- `contacto` — contact person name or email
- `role` — job title (for offer letters)
- `salario` — salary (for offer letters)

If any required input is missing, ask the user for it. Do not call `doc_create` until all required inputs are provided. Never fill in placeholder values like "TBD" or "N/A" without the user's explicit instruction.

### Step 3: Call doc_create

```
doc_create({
  template_id: string,       // e.g., "nda-kuill-pilot"
  inputs: {                  // key-value map of all required tokens
    cliente: string,
    fecha: string,
    scope: string,
    // ... other tokens per template
  },
  created_by?: string        // defaults to current agent identity
})
```

### Step 4: Handle MISSING_INPUTS response

If `doc_create` returns a `MISSING_INPUTS` error (even after pre-validation), extract the missing field names and ask the user:

```
"The template needs a few more details before I can generate the document:
- [missing_field_1]: [description from template schema]
- [missing_field_2]: [description from template schema]

Please provide these and I'll generate the document right away."
```

### Step 5: Present the result

On success, show:
- Document name
- Drive URL (clickable link)
- Registry doc_id
- Current status: `draft`
- Template version used

Then offer next steps:
- "Would you like to review and edit it before sharing?" → `doc-edit`
- "Would you like to take a snapshot when it's ready?" → `doc-snapshot`
- "Would you like me to run a brand check?" → `brand-check`

## Examples

### Example 1: Simple NDA creation

**User:** "Create an NDA for Colegio San Esteban, scope is the Kuill pilot program, for May 2026."

**Agent:**
1. `find_templates({ query: "NDA" })` → finds `nda-kuill-pilot`, requires: `cliente`, `fecha`, `scope`
2. All inputs present: `{ cliente: "Colegio San Esteban", fecha: "2026-05", scope: "Piloto Kuill" }`
3. `doc_create({ template_id: "nda-kuill-pilot", inputs: { cliente: "Colegio San Esteban", fecha: "2026-05", scope: "Piloto Kuill" } })`
4. Returns: "Created: **NDA-Kuill-Pilot-ColegioSanEsteban-2026-05** [Drive link] — Status: `draft`. Would you like to review it or take a snapshot before sending?"

### Example 2: Missing inputs

**User:** "Make an offer letter for Carlos Rojas."

**Agent:**
1. `find_templates({ query: "offer letter" })` → finds `carta-oferta`, requires: `nombre`, `role`, `salario`, `fecha_inicio`
2. Has: `nombre: "Carlos Rojas"`. Missing: `role`, `salario`, `fecha_inicio`
3. Asks: "To generate the offer letter for Carlos Rojas, I need a few details:
   - Role / job title?
   - Monthly salary?
   - Start date?
   Please provide these and I'll create the document."
4. User provides values → calls `doc_create`

### Example 3: Unknown template — use doc-context first

**User:** "I need to send a fund application to Platanus VC."

**Agent:**
1. Recognizes this is non-trivial → runs `doc-context` first (see `doc-context` skill)
2. After user confirms template and inputs → calls `doc_create`

## Error handling

| Situation | Response |
|---|---|
| `MISSING_INPUTS` returned by tool | Extract missing field names from error. Ask user for each one. Re-call only when all are provided. |
| `TEMPLATE_INACTIVE` | "The template '[name]' is currently disabled. Let me check for an alternative." → `find_templates` |
| `NOT_FOUND` template | "I couldn't find a template with that ID. Let me search for the closest match." → `find_templates` |
| `PERMISSION_DENIED` | "The agent lacks permission to create files in the destination folder. Please check that the service account has Editor access to the [category] folder." |
| Duplicate doc suspected | If `doc-context` or `doc_find` revealed an existing active doc with the same client+type, warn the user before creating: "There is already an active [doc type] for [client]. Create a new one anyway?" |
