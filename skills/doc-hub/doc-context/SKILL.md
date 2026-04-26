---
name: doc-context
description: "Research and prepare context before creating a document — finds related existing docs and the best template options"
version: "1.0.0"
author: doc-hub
license: MIT
category: document-management
tags:
  - drive
  - research
  - planning
  - context
department: All
models:
  recommended:
    - claude-opus-4-7
    - claude-sonnet-4-6
mcp:
  server: doc-hub-mcp
  tools:
    - doc_context
    - doc_find
    - find_templates
---

# doc-context

## When to use this skill

Use `doc-context` as a preparation step before creating any non-trivial document. It answers two questions before you touch `doc_create`:

1. What similar documents already exist? (avoid duplication)
2. What is the best template to use, and what inputs does it need?

Common triggers:

- "I need to create a fund application for [investor]"
- "Help me put together a proposal for Colegio Norte"
- "I have to write a budget report for the board"
- "We need a new playbook for onboarding teachers"
- "Prepare everything to send an offer to Carlos"

**Rule:** For any document creation request that is not a simple, clearly scoped repeat (e.g., "create another NDA for client X using the same template as last time"), run `doc-context` first. Present the assembled context to the user and ask for confirmation before calling `doc-create`.

## What it does

`doc_context` assembles a **context pack** for a given intent:

- Searches the Registry for existing documents in the same category and topic
- Identifies the best matching template(s) from the Manifest, including required inputs and suggested sources
- Returns a structured summary: what exists, what template to use, what fields to fill

This prevents duplicate document creation and ensures the agent selects the right template with full awareness of what already exists.

## How to use

### Step 1: Understand the user's intent

Extract from the user message:
- **intent** — the purpose (e.g., "fund application for Platanus VC")
- **category** — if inferable (Legal, Comercial, Internos, Governance)
- **audience** — internal or external
- **target entity** — client, partner, investor, employee name (if applicable)

### Step 2: Call doc_context

```
doc_context({
  intent: string,        // natural language description of what needs to be created
  category?: string,     // narrows the template search
  audience?: string      // "internal" | "external"
})
```

### Step 3: Review the context pack

The response includes:
- **existing_docs** — list of Registry entries that are topically related
- **recommended_templates** — ranked list of matching templates with descriptions
- **missing_inputs** — fields required by the top template that are not yet known
- **suggested_sources** — Drive folders or docs the user should reference to fill in the inputs

### Step 4: Present a plan to the user

Summarize what you found:

```
"Before creating this document, here's what I found:

Existing related docs:
- [Comercial Proposal ColegioNorte 2025-11] — status: archived
- (No active proposals for this client)

Recommended template: 'Propuesta Comercial Kuill' (Comercial)
Required inputs:
- cliente: [need from user]
- fecha: [today = 2026-04-25 ✓]
- scope: [need from user — e.g. "Piloto IA Lenguaje 6to Básico"]
- precio_total: [need from user]

Suggested sources to pull data from:
- Management/Finance (for pricing)
- Comercial/ColegioNorte (for past context)

Should I proceed with this template? If so, please confirm or provide:
- scope
- precio_total"
```

### Step 5: Wait for user confirmation

Do NOT call `doc_create` until the user has:
1. Confirmed the template choice (or selected an alternative)
2. Provided all missing required inputs

### Step 6: Hand off to doc-create

Once confirmed, call the `doc-create` skill with the resolved template and complete inputs.

## Examples

### Example 1: Fund application

**User:** "I need to create a fund application for Platanus VC."

**Agent:**
1. `doc_context({ intent: "fund application for Platanus VC", category: "Governance", audience: "external" })`
2. Finds: existing Platanus relationship docs in Management/Investors folder
3. Finds template: "Fondo-Aplicacion" with required inputs: `nombre_fondo`, `monto_solicitado`, `objetivo`, `plazo`, `contacto`
4. Presents plan: "I found 1 related document (a previous Platanus update from 2025-Q3). The best template is 'Fondo-Aplicacion'. I need 4 more inputs from you: [lists them]. Shall I proceed once you provide these?"

### Example 2: Proposal for a new client

**User:** "Help me put together a commercial proposal for Colegio Norte."

**Agent:**
1. `doc_context({ intent: "commercial proposal for Colegio Norte", category: "Comercial" })`
2. Finds: one archived proposal from 2025-11 — shows it as reference
3. Finds template: "Propuesta-Comercial-Kuill" — lists required inputs
4. Asks user to confirm scope and price before proceeding

### Example 3: User wants to start immediately

**User:** "Create a playbook for onboarding new teachers."

**Agent:**
1. Before touching `doc_create`: runs `doc_context({ intent: "teacher onboarding playbook", category: "Internos" })`
2. Finds: "Teacher-Onboarding-Playbook-v1" already exists with status `draft`
3. Presents: "There is already a teacher onboarding playbook in draft (last edited 2026-03-15). Would you like to edit that one instead of creating a new document? Or should I create a separate new version?"
4. Waits for user decision before proceeding

## Error handling

| Situation | Response |
|---|---|
| No templates found for intent | "I couldn't find a template that matches this intent. Options: (1) use `doc-create-blank` to start from scratch, (2) ask your admin to create a template for this type of document." |
| No existing docs found | "No related documents found in the Registry. This will be the first document of this type. Proceeding with template selection..." |
| Multiple equally good templates | Present the top 2-3 with their descriptions and ask the user to pick |
| User skips context and goes straight to doc-create | If called with ambiguous intent and no template specified, run `doc_context` implicitly before proceeding |
