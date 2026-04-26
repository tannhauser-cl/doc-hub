---
name: find-templates
description: "Discover available document templates, their required inputs, and which template best fits a given need"
version: "1.0.0"
author: doc-hub
license: MIT
category: document-management
tags:
  - drive
  - templates
  - catalog
department: All
models:
  recommended:
    - claude-opus-4-7
    - claude-sonnet-4-6
mcp:
  server: doc-hub-mcp
  tools:
    - find_templates
---

# find-templates

## When to use this skill

Use `find-templates` when the user wants to explore what document templates are available, or when you need to confirm a template exists before calling `doc_create`. Common triggers:

- "What kinds of documents can I create?"
- "Is there a template for [document type]?"
- "What do I need to fill in for a proposal?"
- "Show me all Legal templates"
- "List all active templates"
- "What fields does the NDA template need?"
- "Do you have an offer letter template?"
- "What templates are in the Comercial category?"

**This skill is also called internally** before every `doc-create` call to confirm the template ID and required inputs. Never assume a template ID — always verify with `find_templates` first.

## What it does

Queries the template Manifest (a Google Sheet that catalogs all available templates) and returns matching templates with:

- **id** — stable kebab-case identifier (e.g., `nda-kuill-pilot`)
- **name** — human-readable display name
- **description** — one-sentence description of what the template produces
- **category** — Legal, Comercial, Internos, Governance
- **doc_type** — document, presentation, or spreadsheet
- **required_inputs** — list of field names that must be provided to `doc_create`
- **suggested_sources** — Drive folders or keywords to search for input data
- **version** — template version

Only `active: true` templates are returned by default.

## How to use

### Step 1: Extract the search intent

From the user's message, identify:
- **query** — free-text keyword (e.g., "NDA", "offer letter", "proposal")
- **category** — if specified (Legal, Comercial, Internos, Governance)
- **doc_type** — if specified (document, presentation, spreadsheet)

### Step 2: Call find_templates

```
find_templates({
  query?: string,      // e.g., "NDA" or "offer letter"
  category?: string,   // "Legal" | "Comercial" | "Internos" | "Governance"
  doc_type?: string    // "document" | "presentation" | "spreadsheet"
})
```

Calling with no parameters returns all active templates.

### Step 3: Present the results

**For a catalog browse (user exploring options):**

Group results by category and present a readable list:

```
Available templates (12 total):

LEGAL (3)
- nda-kuill-pilot — NDA for Kuill pilot agreements
  Required: cliente, fecha, scope
- carta-oferta — Employment offer letter
  Required: nombre, role, salario, fecha_inicio
- acuerdo-servicio — Master service agreement
  Required: cliente, fecha, scope, precio_total, duracion

COMERCIAL (4)
- propuesta-comercial — Commercial proposal for educational institutions
  Required: cliente, fecha, scope, precio_total
...
```

**For a specific template lookup (before doc_create):**

Show the single matched template with full detail:

```
Template: nda-kuill-pilot
Name: NDA Kuill Pilot
Category: Legal | Type: Google Doc
Description: Non-disclosure agreement for Kuill pilot programs

Required inputs:
- cliente (string) — Client or institution name, e.g. "Colegio San Esteban"
- fecha (string) — Month in YYYY-MM format, e.g. "2026-05"
- scope (string) — Brief description of the pilot scope

Suggested sources:
- Management/Clients — for client details
- Comercial/ — for existing proposals to the same client

Template version: 1.2.0
```

### Step 4: Help the user decide (if multiple matches)

If multiple templates match a query, briefly explain the differences:
```
"I found 2 templates that could work:
1. nda-kuill-pilot — for pilot program NDAs (3 inputs)
2. nda-general — general purpose NDA (6 inputs, more detailed)

Which fits your situation?"
```

### Step 5: Offer to proceed to doc-create

Once the user has identified their template, offer to create a document:
```
"Ready to generate a document from this template? Tell me the values for:
- cliente: ?
- fecha: ? (today = 2026-05, or specify a different month)
- scope: ?"
```

## Examples

### Example 1: User browses all templates

**User:** "What kinds of documents can I create?"

**Agent:**
1. `find_templates({})` → returns all active templates
2. Presents grouped by category with names and one-line descriptions
3. "There are [N] document templates available across 4 categories. Which type are you interested in?"

### Example 2: Check if a specific template exists

**User:** "Is there a template for a fund application?"

**Agent:**
1. `find_templates({ query: "fund application" })`
2. Found: `fondo-aplicacion` — "Fund application for institutional investors"
3. "Yes! The 'Fondo-Aplicacion' template is available (Governance category). It requires:
   - nombre_fondo, monto_solicitado, objetivo, plazo, contacto
   
   Want me to start filling these in?"

### Example 3: Template not found

**User:** "Is there an invoice template?"

**Agent:**
1. `find_templates({ query: "invoice" })` → no results
2. "There's no invoice template currently available. Options:
   1. Create a blank document from scratch (`doc-create-blank`)
   2. Ask your admin to add an invoice template to the catalog"

### Example 4: Check required fields before creating

**User:** "Create a proposal for Colegio Norte."

**Agent (internal step):**
1. `find_templates({ query: "proposal", category: "Comercial" })` → finds `propuesta-comercial`
2. Required: `cliente`, `fecha`, `scope`, `precio_total`
3. Has: `cliente="Colegio Norte"`, `fecha="2026-05"`. Missing: `scope`, `precio_total`
4. Asks user for the 2 missing values before calling `doc_create`

## Error handling

| Situation | Response |
|---|---|
| No templates match query | "No active templates match '[query]'. Try a broader search, or view all templates with no filter." |
| Template found but `active: false` | "The template '[name]' exists but is currently disabled. Contact your admin to re-activate it, or choose an alternative." |
| Manifest unavailable | "The template catalog couldn't be reached. Check that the MCP server is running and the Manifest Sheet ID is configured correctly." |
| User asks about fields in a template | Show the full `tokens_schema` for that template, describing each field's type and purpose. |
| Multiple categories match | Present results from all matching categories, grouped, and let the user narrow down. |
