---
name: doc-undo
description: "Undo a previous doc-hub operation using the Audit Trail event ID or a time/actor filter for batch undo"
version: "1.0.0"
author: doc-hub
license: MIT
category: document-management
tags:
  - drive
  - undo
  - audit
  - rollback
department: All
models:
  recommended:
    - claude-opus-4-7
    - claude-sonnet-4-6
mcp:
  server: doc-hub-mcp
  tools:
    - doc_undo
    - doc_find
---

# doc-undo

## When to use this skill

Use `doc-undo` when the user wants to reverse a previous doc-hub operation. Common triggers:

- "Undo the last thing you did"
- "Reverse that edit — I made a mistake"
- "I accidentally archived the wrong document, restore it"
- "Undo the snapshot I just took"
- "Roll back today's changes"
- "Reverse event evt_20260425_143022_abc"
- "Undo everything I did this morning"

## What it does

`doc_undo` reads the Audit Trail and replays the stored inverse operation for a given event. Every doc-hub action (create, edit, snapshot, supersede, archive, adopt) writes both the forward operation and its inverse to the Audit Trail at the time of execution. Undo replays that inverse.

**What can be undone:**

| Operation | Undo effect |
|---|---|
| `doc_create` | Deletes the created file from Drive and removes its Registry entry |
| `doc_create_blank` | Same as above |
| `doc_edit` (content) | Reverts the document content to its state before the edit |
| `doc_edit` (status) | Reverts the Registry status to the previous value |
| `doc_snapshot` | Removes the snapshot record from the Registry (note: the PDF file in Drive must be deleted manually) |
| `doc_archive` | Restores the file to its previous folder and reverts status to its pre-archive value |
| `doc_adopt` | Moves file back to `_Imports/`, removes Registry entry |
| `doc_supersede` | Unlinks the supersede chain and restores the old document from Archive |

**What cannot be undone cleanly:**
- Edits made directly in Google Drive (outside the agent) — the inverse op may be stale
- Deleting a file directly in Drive — doc-hub has no inverse for Drive deletions it didn't make
- Events older than the undo window (configured by tenant, typically 30 days)

## How to use

### Step 1: Identify what to undo

**Case A: User has the event_id** (preferred)

Every doc-hub operation returns an `event_id`. If the user provides it (e.g., `evt_20260425_143022_abc`), use it directly. This is always the safest undo.

**Case B: User doesn't have the event_id — recent single event**

Ask: "Do you know the event ID? It looks like `evt_YYYYMMDD_HHMMSS_xxx` and was shown when the operation completed."

If not available, ask:
- "What operation are you undoing?" (create, edit, archive, snapshot, etc.)
- "Which document?"
- "Approximately when did it happen?"

Then use `doc_find` to locate the document and cross-reference the Audit Trail if needed.

**Case C: Batch undo (multiple events)**

Batch undo is powerful and dangerous — multiple Registry entries will be modified. Always require explicit confirmation with the full list of events to be reversed before proceeding.

### Step 2: Confirm the undo intent

**Single event:**
```
"I'll undo: [operation type] on '[document name]' at [timestamp].
Effect: [describe what will change — e.g., 'the document will be restored from Archive to Comercial/'].
Proceed?"
```

**Batch:**
```
"I'll undo the following [N] operations:
- evt_... : [operation] on [document] at [time]
- evt_... : [operation] on [document] at [time]
...
This will affect [N] documents. Are you sure?"
```

**Always confirm before batch undo.** Never execute batch undo without explicit user approval.

### Step 3: Call doc_undo

**Single event:**
```
doc_undo({
  event_id: string   // e.g., "evt_20260425_143022_abc"
})
```

**Batch (time range + actor):**
```typescript
doc_undo({
  batch_since: string,    // ISO 8601 timestamp — undo events at or after this time (required for batch)
  batch_until?: string,   // ISO 8601 timestamp — undo events before this time (defaults to now)
  batch_actor?: string    // filter by actor email or agent ID that performed the operations
})
```

Note: `event_id` and `batch_since` are mutually exclusive — provide exactly one.

### Step 4: Handle partial failures in batch undo

If one event in a batch fails:
- Do NOT silently continue
- Report which succeeded and which failed
- Ask the user whether to continue with the remaining events or stop

### Step 5: Present the result

On success:
- Confirm what was reversed
- Note the new state of the affected document(s)
- If the undo created a new Audit Trail event, provide that event_id (undo of undo is possible)

## Examples

### Example 1: Single undo with event_id

**User:** "Undo event evt_20260425_143022_abc."

**Agent:**
1. "That event was: `doc_archive` on 'Propuesta-Comercial-ColegioNorte-2026-03' at 14:30:22 on 2026-04-25. Undoing will restore the document from Archive to Comercial/ and set its status back to `approved`. Proceed?"
2. User confirms → `doc_undo({ event_id: "evt_20260425_143022_abc" })`
3. "Restored: 'Propuesta-Comercial-ColegioNorte-2026-03' — status: `approved`, moved back to Comercial/."

### Example 2: Undo the last thing done to a document

**User:** "Undo the edit you just made to the Q1 report."

**Agent:**
1. The previous `doc_edit` response returned event_id `evt_20260425_151044_xyz`
2. "I'll undo the edit made to 'Q1-Board-Report-2026' at 15:10:44 today. The content change will be reverted. Proceed?"
3. User confirms → `doc_undo({ event_id: "evt_20260425_151044_xyz" })`
4. "Reverted. The document is back to its state before the edit."

### Example 3: Undo an accidental archive

**User:** "I accidentally archived the wrong document — the Colegio Norte proposal."

**Agent:**
1. "Do you have the event ID from the archive operation?" → User: "No."
2. `doc_find({ query: "Colegio Norte proposal", status: "archived" })` → finds the document
3. Cross-references Audit Trail to find the archive event_id
4. "Found it. I'll restore 'Propuesta-Comercial-ColegioNorte-2026-03' from Archive, status will return to `approved`. Proceed?"
5. Executes undo. Reports success.

### Example 4: Batch undo — all of this morning's operations

**User:** "Undo everything I did this morning, from 9 AM to noon."

**Agent:**
1. Queries Audit Trail for events by current user between 09:00 and 12:00 today
2. Lists all [N] events with their types and documents
3. "I found [N] operations from this morning:
   - 09:15 — doc_create 'Propuesta-X'
   - 09:47 — doc_edit 'NDA-Y' (status change)
   - 10:30 — doc_archive 'PlaybookZ'
   
   Undoing all of these will delete the proposal, revert the NDA status, and restore the playbook. This affects [N] documents. Are you absolutely sure?"
4. User must confirm explicitly → executes batch undo sequentially
5. Reports all results with any failures highlighted.

## Error handling

| Situation | Response |
|---|---|
| Event not found | "No event with ID [event_id] was found in the Audit Trail. Check the ID and try again." |
| Event already undone | "This event was already undone (status: `undone`) at [timestamp]. If you want to re-apply it, use the undo's undo event ID." |
| Event outside undo window | "This event is too old to undo automatically (older than [N] days). A manual rollback may be possible — contact your doc-hub admin." |
| Snapshot undo | "Undoing this snapshot will remove it from the Registry, but the PDF file in Google Drive must be deleted manually. I'll handle the Registry update; please delete the PDF at [url]." |
| doc_create undo — file already deleted from Drive | "The file was already deleted from Drive. I'll remove the orphaned Registry entry." |
| Partial batch failure | List successful and failed undos separately. Ask user whether to continue or stop. |
