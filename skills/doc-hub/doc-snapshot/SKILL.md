---
name: doc-snapshot
description: "Freeze a document as an immutable PDF snapshot at a distribution milestone — before sending, signing, or submitting"
version: "1.0.0"
author: doc-hub
license: MIT
category: document-management
tags:
  - drive
  - snapshot
  - pdf
  - versioning
department: All
models:
  recommended:
    - claude-opus-4-7
    - claude-sonnet-4-6
mcp:
  server: doc-hub-mcp
  tools:
    - doc_find
    - doc_snapshot
---

# doc-snapshot

## When to use this skill

Use `doc-snapshot` when the user wants to freeze a document at a specific milestone — before distributing, sending to a client, submitting for signature, or archiving for compliance. Common triggers:

- "Freeze the NDA before I send it to the client"
- "Take a snapshot of the proposal — we're about to submit"
- "Lock in the current version of the Q1 report before the board meeting"
- "Create a PDF snapshot of this contract"
- "I want a permanent record of the offer letter as it was when we sent it"
- "Snapshot this before signing"

**Important concept to communicate to users:**
Taking a snapshot does NOT lock the living document. The Google Doc stays fully editable. The snapshot is an immutable PDF copy that records the document exactly as it was at the time of the snapshot. These two things coexist in the system.

## What it does

Exports the current state of a Google Doc (or Slides/Sheet) as a PDF, stores it in the Snapshots folder in the Shared Drive, records it in the Registry (in the `snapshots_json` field for that doc), and logs the event in the Audit Trail.

Each snapshot gets:
- A timestamped filename (e.g., `NDA-ColegioX-2026-05-snapshot-20260425T143022Z.pdf`)
- A content hash for integrity verification
- An immutable Drive URL (PDF is never modified after creation)

## How to use

### Step 1: Identify the document

Resolve the `file_id` from the user's reference:
- By name → `doc_find({ query: "..." })`
- By URL → use `extractFileId(url)` from helpers
- By doc_id → use directly

### Step 2: Confirm the snapshot intent

Always tell the user what a snapshot means before taking one, especially if this is their first time:

```
"I'll create a PDF snapshot of '[document name]' as it looks right now.
The PDF will be immutable — it won't change even if you edit the document later.
The living document stays fully editable.
Proceed?"
```

For users who are clearly familiar with the workflow and ask directly ("snapshot this"), you can skip the explanation and proceed directly.

### Step 3: Collect optional label

Ask if the user wants to label this snapshot with a milestone name. This makes it easier to find later:

- "sending-to-client"
- "pre-signature"
- "board-submission"
- "q1-final"

If the user doesn't have a preference, default to `"snapshot"`.

### Step 4: Call doc_snapshot

```
doc_snapshot({
  file_id: string,     // Drive file ID or doc_id
  label?: string,      // milestone label, e.g. "pre-signature"
  created_by?: string  // defaults to current agent identity
})
```

### Step 5: Present the result

On success, return:
- Snapshot PDF name
- **Immutable PDF URL** — this is what to share or attach
- Hash (for integrity verification, if relevant)
- Timestamp
- The living document URL (so the user knows the editable version still exists)

Example response:
```
"Snapshot created:

PDF: NDA-ColegioSanEsteban-2026-05-snapshot-20260425T143022Z.pdf
URL: [immutable Drive link to PDF]
Hash: sha256:abc123...
Taken at: 2026-04-25T14:30:22Z

The living document remains editable at: [Drive link to Google Doc]

Share the PDF URL with the client. Event ID: evt_... (use to undo this snapshot if needed)."
```

### Step 6: Offer next actions

- "Would you like to archive the living doc now that it's been snapshotted?" → `doc-archive`
- "Would you like to run a brand check on the snapshot first?" → `brand-check`
- "Should I also update the document status to 'published'?" → `doc-edit` with `set_status`

## Examples

### Example 1: Snapshot before sending an NDA

**User:** "Freeze the NDA for Colegio San Esteban before I send it."

**Agent:**
1. `doc_find({ query: "NDA Colegio San Esteban", status: "approved" })` → resolves file_id
2. Informs: "I'll create a PDF snapshot of the approved NDA. The PDF will be immutable; the Google Doc stays editable. Label: 'pre-send'. Proceed?"
3. User confirms → `doc_snapshot({ file_id: "...", label: "pre-send" })`
4. Returns PDF URL + living doc URL. "Share the PDF link with the client."

### Example 2: Pre-signature snapshot

**User:** "Take a snapshot of the offer letter for Carlos Rojas — we're about to get it signed."

**Agent:**
1. `doc_find({ query: "offer letter Carlos Rojas" })` → finds file_id
2. Immediately (user clearly knows the workflow): `doc_snapshot({ file_id: "...", label: "pre-signature" })`
3. Returns: PDF URL, hash, timestamp. "Snapshot taken. Share this PDF for signature. The original doc remains editable."

### Example 3: Compliance record snapshot

**User:** "Create a permanent PDF record of the Q1 board report."

**Agent:**
1. `doc_find({ query: "Q1 board report", category: "Governance" })` → resolves
2. `doc_snapshot({ file_id: "...", label: "board-submission-q1-2026" })`
3. Returns snapshot URL + notes: "This PDF is permanently stored and cannot be modified. Its hash is [sha256:...] if you need to verify its integrity later."

## Error handling

| Situation | Response |
|---|---|
| Document is already in draft / not approved | Warn: "This document is still in `draft` status. It's usually best to snapshot after approval. Proceed anyway?" |
| Document has unsaved edits (if detectable) | "There appear to be recent unsaved changes. Make sure all edits are saved in Drive before taking the snapshot." |
| `NOT_FOUND` | Run `doc_find` to locate the correct file. |
| `PERMISSION_DENIED` | "The agent can't export this file as PDF. Ensure the service account has Viewer or Editor access." |
| User wants to undo a snapshot | Snapshots are immutable by design — the PDF file cannot be deleted via undo. However, `doc_undo` will remove the snapshot record from the Registry. The PDF file in Drive should be manually deleted if needed. Always explain this distinction. |
