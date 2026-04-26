---
name: doc-create-blank
description: "Create a new branded document without a template when starting from scratch"
version: "1.0.0"
author: doc-hub
license: MIT
category: document-management
tags:
  - drive
  - create
  - blank
  - branding
department: All
models:
  recommended:
    - claude-opus-4-7
    - claude-sonnet-4-6
mcp:
  server: doc-hub-mcp
  tools:
    - doc_create_blank
---

# doc-create-blank

## When to use this skill

Use `doc-create-blank` when the user wants to start a new document from scratch — no template, no predefined structure — but still wants it to be brand-consistent and registered in the system.

Common triggers:

- "Create a blank doc for my meeting notes"
- "I want to start a new spreadsheet for tracking candidates"
- "Make a fresh presentation, I'll write the content myself"
- "Create a new internal memo — I'll fill it in"
- "I need a blank slide deck with our branding"

**Prefer `doc-create` over `doc-create-blank` when a relevant template exists.** Only use blank creation when:
- The user explicitly says they don't want a template
- No matching template is found via `find_templates`
- The content is too ad-hoc or unique to fit any template

## What it does

Creates a new Google Doc, Slides, or Sheet in the correct category folder, applies the organization's brand kit (fonts, colors, logo placement), and registers it in the Registry with status `draft` and category `__adhoc-blank`. The document is immediately editable in Drive.

## How to use

### Step 1: Collect required parameters

Ask the user for the following if not already provided:

| Parameter | Description | Example |
|---|---|---|
| `title` | Display name for the document | "Meeting Notes — Board Q2 2026" |
| `category` | Content category for folder placement | `Internos`, `Comercial`, `Legal`, `Governance` |
| `doc_type` | Type of document | `document` (Google Doc), `presentation` (Slides), `spreadsheet` (Sheet) |
| `audience` | Who will see this document | `internal`, `external` |

Do not silently default these values — if any are ambiguous, ask. The category determines which folder the file is placed in; getting it wrong means the document is misclassified.

For `title`: guide the user toward a descriptive, kebab-friendly name (no "v1", "FINAL", "draft", dates, or status words in the title).

### Step 2: Confirm before creating

For blank docs (which have no template to fall back on), briefly confirm the parameters with the user before calling the tool:

```
"I'll create a blank Google Doc titled 'Meeting-Notes-Board-Q2-2026' in the Internos folder, for internal use. Shall I proceed?"
```

This prevents misclassification and wasted Registry entries.

### Step 3: Call doc_create_blank

```
doc_create_blank({
  title: string,           // e.g., "Meeting-Notes-Board-Q2-2026"
  category: string,        // "Legal" | "Comercial" | "Internos" | "Governance"
  doc_type: string,        // "document" | "presentation" | "spreadsheet"
  audience: string,        // "internal" | "external"
  created_by?: string      // defaults to current agent identity
})
```

### Step 4: Present the result

On success, show:
- Document name and Drive URL
- Registry doc_id
- Status: `draft`
- Category: `__adhoc-blank`

Remind the user that the doc is live and editable right now via the Drive link.

Offer next steps:
- "The document is open and ready. You can edit it directly in Drive, or tell me what content to add and I'll edit it via the agent." → `doc-edit`
- "When you're done, let me know and I can run a brand check before you share it." → `brand-check`

## Examples

### Example 1: Quick meeting notes doc

**User:** "Create a blank doc for board meeting notes."

**Agent:**
1. Infers: title="Board-Meeting-Notes", category=`Internos`, doc_type=`document`, audience=`internal`
2. Confirms: "I'll create a blank Google Doc titled 'Board-Meeting-Notes' in the Internos folder. Proceed?"
3. User confirms → calls `doc_create_blank`
4. Returns: "Created: **Board-Meeting-Notes** [Drive link] — Status: `draft`. The document is empty and ready for you to write. Want me to add a structure or agenda template?"

### Example 2: Branded slide deck from scratch

**User:** "Make me a blank presentation with our branding — I'll write all the slides myself."

**Agent:**
1. Asks: "What's the title of this presentation, and is it for internal use or external (clients/investors)?"
2. User: "Quarterly Review 2026 — external"
3. Confirms: "Creating a blank Slides presentation titled 'Quarterly-Review-2026' in the Comercial folder, external audience. Correct?"
4. `doc_create_blank({ title: "Quarterly-Review-2026", category: "Comercial", doc_type: "presentation", audience: "external" })`
5. Returns URL + reminds user: "Before sharing, I recommend running a brand check once you've added content."

### Example 3: Spreadsheet with no template

**User:** "I need a new spreadsheet to track the pilot cohort candidates."

**Agent:**
1. Asks: "Internal use only, or will this be shared externally?"
2. User: "Internal."
3. `doc_create_blank({ title: "Pilot-Cohort-Candidates-Tracker", category: "Internos", doc_type: "spreadsheet", audience: "internal" })`
4. Returns link and status.

## Error handling

| Situation | Response |
|---|---|
| Title contains version markers ("v1", "FINAL", "draft", dates) | Warn: "I'd recommend not including version markers in the title — status is tracked in the Registry, not in the filename. How about '[cleaned title]'?" |
| Category unclear | Ask: "Which folder should this go in? Options: Legal, Comercial, Internos, Governance." |
| Audience unclear | Ask: "Is this document for internal use only, or will it be shared with external parties?" |
| `PERMISSION_DENIED` | "The agent can't create files in that folder. Please check that the service account has Editor access to the [category] folder in the Shared Drive." |
