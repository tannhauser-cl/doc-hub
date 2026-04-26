---
name: doc-archive
description: "Archive a document that is no longer active — moves it to the Archive folder and excludes it from default searches"
version: "1.0.0"
author: doc-hub
license: MIT
category: document-management
tags:
  - drive
  - archive
  - governance
department: All
models:
  recommended:
    - claude-opus-4-7
    - claude-sonnet-4-6
mcp:
  server: doc-hub-mcp
  tools:
    - doc_find
    - doc_archive
---

# doc-archive

## When to use this skill

Use `doc-archive` when a document is no longer active and should be retired from regular use. Common triggers:

- "Archive the old Colegio Norte proposal — we lost the deal"
- "Retire the 2024 pricing sheet"
- "This playbook is outdated, put it in the archive"
- "Archive all documents with status 'draft' older than 6 months"
- "Close out the service agreement that expired"
- "Mark this offer letter as no longer active"

**Archive does not delete.** The document remains in Drive and can still be found with `doc_find({ status: "archived" })`. It is simply excluded from default searches, moved to the Archive folder, and marked as inactive in the Registry.

**Do NOT use `doc-archive` for:**
- Documents being replaced by a new version → use `doc-supersede` (which archives the old doc automatically)
- Documents that need edits → use `doc-edit`
- Documents that should be permanently deleted → that is a manual Drive operation, outside the doc-hub system

## What it does

`doc_archive` performs three things atomically:
1. Moves the file to the Archive folder in the Shared Drive
2. Updates the Registry status to `archived`
3. Logs the event in the Audit Trail (reversible via `doc-undo`)

Archived documents:
- Do NOT appear in default `doc_find` results
- CAN be found with `doc_find({ status: "archived" })`
- Remain readable via `doc_read`
- Can be un-archived via `doc-undo` (if within the undo window) or by manually updating status via `doc-edit`

## How to use

### Step 1: Identify the document(s)

For a single document:
- Resolve `file_id` by name via `doc_find` or from a URL
- Confirm you have the right document: show name, category, current status, and last edited date

For batch archive (multiple documents):
- Run `doc_find` with appropriate filters to list all candidates
- Present the full list to the user before proceeding
- **Require explicit confirmation before batch archiving**

### Step 2: Confirm with the user

Always confirm before archiving — even a single document. Archive is easy to undo but the intent should be clear:

**Single doc:**
```
"I'll archive '[document name]' (status: approved, last edited: 2026-01-15).
It will be moved to the Archive folder and excluded from regular searches.
The file is not deleted and can be recovered. Proceed?"
```

**Batch:**
```
"I'll archive the following [N] documents:
- [doc 1] — status: draft, last edited: 2025-09-01
- [doc 2] — status: draft, last edited: 2025-08-15
- [doc 3] — ...

All will be moved to Archive and excluded from searches. Proceed?"
```

### Step 3: Call doc_archive

**Single document:**
```
doc_archive({
  file_id: string,     // Drive file ID or doc_id
  reason?: string,     // e.g., "deal lost", "document expired"
  archived_by?: string // defaults to current agent identity
})
```

**For batch archive**, call `doc_archive` once per document in sequence. Do not parallelize — ensure each operation logs correctly to the Audit Trail before the next.

### Step 4: Present the result

On success:
- Confirm the document name and new Archive folder location
- Note the Audit Trail event_id
- Remind the user the document is not deleted

```
"Archived: '[document name]'
Moved to: Archive/[category]/[document name]
Event ID: evt_... (use `doc-undo` with this ID to restore it)."
```

For batch, provide a summary: "Archived [N] documents. All event IDs: [list]."

## Examples

### Example 1: Archive a lost deal proposal

**User:** "Archive the Colegio Norte proposal — we lost the deal."

**Agent:**
1. `doc_find({ query: "Colegio Norte proposal", category: "Comercial" })` → finds one result
2. Confirms: "I'll archive 'Propuesta-Comercial-ColegioNorte-2026-03' (status: `approved`). It won't appear in regular searches but remains accessible. Proceed?"
3. User confirms → `doc_archive({ file_id: "...", reason: "deal lost" })`
4. "Archived. Event ID: evt_... — use this if you need to restore it."

### Example 2: Clean up stale drafts

**User:** "Archive all draft proposals older than 6 months."

**Agent:**
1. `doc_find({ category: "Comercial", status: "draft", created_before: "2025-10-25" })` → finds 4 docs
2. Lists all 4 with names and dates
3. "I found 4 draft proposals older than 6 months. Archive all of them? This will move them to Archive but not delete them."
4. User confirms → archives one by one, logging each event_id
5. "Archived 4 documents. Event IDs: [list]. All can be restored individually if needed."

### Example 3: Archive after supersede is complete

**User:** "The new policy is approved — archive the old one."

**Agent:**
1. `doc_find({ query: "old policy name" })` → finds old doc
2. Notes: "Is this the document that was replaced? I want to make sure — `doc-supersede` archives automatically, but if you've already linked them, this would be a manual archive."
3. If the supersede was done already and the old doc somehow wasn't archived, proceeds with `doc_archive`.
4. If it wasn't superseded yet, suggests `doc-supersede` instead to preserve the version chain.

## Error handling

| Situation | Response |
|---|---|
| Document already archived | "This document is already archived (status: `archived`). No action needed." |
| Document is published with active dependencies | Warn: "This document is in `published` status. Are you sure you want to archive it? If other documents reference it, those references may break." |
| `NOT_FOUND` | "Couldn't find this document in the Registry. If it was created outside the system, it may not be registered." |
| `PERMISSION_DENIED` | "The agent can't move files to the Archive folder. Check that the service account has Editor access to the destination folder." |
| Batch archive partial failure | Report which succeeded and which failed. Do not silently skip failures. Provide event IDs for completed ones. |
