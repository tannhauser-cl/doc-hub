---
name: brand-check
description: "Audit a document against the organization's brand kit and report violations with remediation suggestions"
version: "1.0.0"
author: doc-hub
license: MIT
category: document-management
tags:
  - drive
  - brand
  - compliance
  - audit
department: All
models:
  recommended:
    - claude-opus-4-7
    - claude-sonnet-4-6
mcp:
  server: doc-hub-mcp
  tools:
    - doc_find
    - brand_check
    - doc_edit
---

# brand-check

## When to use this skill

Use `brand-check` any time you want to verify that a document complies with the organization's brand standards before it is published or shared externally. Common triggers:

- "Check this proposal for brand compliance before I send it"
- "Does the new playbook follow our brand guidelines?"
- "Run a brand audit on the NDA"
- "Make sure the slide deck uses the right fonts"
- "Check all external documents for brand issues"
- "Is this document ready to publish?"

**Recommend running brand-check proactively:**
- Before taking a `doc-snapshot` for external distribution
- Before promoting a document to `published` status
- For any `external` audience document before it leaves the organization

## What it does

`brand_check` audits a document against the tenant's brand kit tokens (fonts, colors, logo placement, spacing, tone). It returns a structured list of violations, each with:

- **type** — what kind of violation: `color`, `font`, `logo`, `spacing`, `tone`, or custom
- **location** — where in the document (e.g., "Slide 3, heading", "Page 2, footer")
- **expected** — the brand-compliant value (e.g., "Montserrat 24px")
- **found** — what was actually found (e.g., "Arial 22px")
- **message** — human-readable description
- **severity** — `warning` (can publish, but suboptimal) or `error` (should fix before publishing)

The Registry's `brand_check_status` field is updated to `ok` or `violations` after the check.

## How to use

### Step 1: Identify the document

Resolve the `file_id` from the user's reference. If the user gives a name, use `doc_find` to locate it.

### Step 2: Call brand_check

```
brand_check({
  file_id: string    // Drive file ID or doc_id
})
```

### Step 3: Interpret the results

**Zero violations:**
```
"Brand check passed. No violations found.
Brand status updated to `ok` in the Registry.
This document is ready for external distribution."
```

**Warnings only (no errors):**
```
"Brand check complete. [N] warnings found (no blocking errors):
[list warnings]

The document can be published as-is, but fixing these warnings is recommended
for full brand consistency."
```

**Errors present:**
```
"Brand check found [N] issue(s) that should be fixed before publishing:

Errors (fix before publishing):
- [error 1 description] — Location: [location], Expected: [expected], Found: [found]
- [error 2 description] ...

Warnings (optional):
- [warning 1] ...

Would you like me to fix the errors automatically where possible?"
```

### Step 4: Offer to fix violations (where possible)

For violations that can be fixed via `doc_edit` (text-based issues like wrong status markers in content, incorrect boilerplate, missing disclaimers):
- Offer to fix them automatically: "I can correct [X] of these via an edit. Fix now?"
- Execute via `doc-edit`

For violations that require manual intervention in Google Drive (font changes, color corrections, image replacement):
- List them clearly and say: "These [N] violations require manual edits in Google Drive — they can't be changed through the agent."
- Provide the Drive URL for direct access

### Step 5: Re-run after fixes (if applicable)

If the agent made automatic corrections, offer to re-run the brand check:
"Fixes applied. Run the brand check again to confirm?"

### Step 6: Update Registry status

After a passed check (or after fixes), the Registry `brand_check_status` is automatically updated by the tool. Confirm this to the user.

## Examples

### Example 1: Pre-send check on a proposal

**User:** "Check the Colegio Norte proposal for brand compliance before I send it."

**Agent:**
1. `doc_find({ query: "Colegio Norte proposal" })` → resolves file_id
2. `brand_check({ file_id: "..." })`
3. Returns: 2 errors (wrong font in heading, missing logo in footer), 1 warning (slightly off-brand blue in a table)
4. "Found 2 errors and 1 warning:
   - ERROR: Heading on page 1 uses Arial 24px. Should be Montserrat 24px. (Fix manually in Drive)
   - ERROR: Footer on page 3 is missing the company logo. (Fix manually in Drive)
   - WARNING: Table on page 2 uses #1A5276 instead of brand blue #154360. (Minor — can publish)
   
   The 2 errors should be fixed before sending. Drive link: [url]. Once fixed, I can re-run the check."

### Example 2: All clear

**User:** "Is the Q1 board report brand-compliant?"

**Agent:**
1. Finds and reads file_id
2. `brand_check({ file_id: "..." })`
3. "Brand check passed — no violations found. The report is brand-compliant and ready for distribution. Registry updated: `brand_check_status: ok`."

### Example 3: Proactive check before snapshot

**User:** "Take a snapshot of the investor deck."

**Agent:**
1. Before snapping: "Before I freeze this as a PDF, would you like me to run a brand check? It only takes a moment and ensures the external PDF is on-brand."
2. User: "Yes, go ahead."
3. Runs `brand_check` → reports results → if clean, proceeds to `doc-snapshot`
4. If violations found: "Found [N] issues. Fix them first, or proceed with the snapshot as-is? (Snapshot will record the current state including violations.)"

### Example 4: Fix a text-based violation automatically

**User:** "Run a brand check on the service agreement."

**Agent:**
1. `brand_check` returns: 1 error — missing required legal disclaimer paragraph at the end of the document
2. "Found 1 error: The required legal disclaimer is missing. I can add it automatically. Shall I?"
3. User confirms → `doc_edit` with `append` operation to add the disclaimer paragraph
4. Re-runs `brand_check` → clean pass
5. "All clear. Registry updated to `brand_check_status: ok`."

## Error handling

| Situation | Response |
|---|---|
| Brand kit not configured | "The brand check couldn't run — no brand kit is configured for this tenant. Ask your admin to set up the Brand-Kit folder in the Shared Drive." |
| Document is not a Google Doc/Slides/Sheet | "Brand check only works on Google Workspace documents (Docs, Slides, Sheets). This file type ([type]) cannot be audited automatically." |
| `NOT_FOUND` | Run `doc_find` to locate the file. |
| `PERMISSION_DENIED` | "The agent can't read this file for brand auditing. Check that the service account has at least Viewer access." |
| Violations found but all require manual fix | List all violations clearly with their Drive locations. Provide the direct Drive URL. Don't claim to fix what you can't. |
