---
name: doc-supersede
description: "Replace an obsolete document with a new major version, preserving the chain in the Registry"
version: "1.0.0"
author: doc-hub
license: MIT
category: document-management
tags:
  - drive
  - versioning
  - supersede
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
    - doc_read
    - doc_supersede
---

# doc-supersede

## When to use this skill

Use `doc-supersede` when an existing document is being **entirely replaced** by a new version — the old document is no longer valid and should not be used. Common triggers:

- "Replace the 2025 pricing policy — the new one is completely different"
- "The old pilot agreement is obsolete, here's the new version"
- "We have a completely rewritten governance policy that replaces the old one"
- "Supersede the master service agreement with the updated 2026 version"
- "The old NDA template has been replaced by legal — archive the old one and link the new one"

**This is rare. Clarify before proceeding.**

`doc-supersede` is a significant operation — use it only when:
- The old document is genuinely obsolete (not just updated)
- The new document represents a breaking change (different structure, terms, or scope)
- Anyone using the old document should be redirected to the new one

**Do NOT use `doc-supersede` for:**
- Adding a section → use `doc-edit`
- Minor updates (typos, contact info, small text changes) → use `doc-edit`
- Creating a new document for a different client → use `doc-create`
- Drafts or incremental progress → keep editing the same doc

If in doubt, ask the user: "Is the old document completely obsolete, or just updated?" If updated, use `doc-edit`. If obsolete, proceed with `doc-supersede`.

## What it does

`doc-supersede` creates a formal version chain in the Registry:
1. The new document (already existing or freshly created) is linked as `supersedes: [old_doc_id]`
2. The old document is moved to the Archive folder and its status is set to `archived`
3. The old document's Registry entry gets `superseded_by: [new_doc_id]`
4. Both documents remain accessible (the old one as historical record)
5. The entire chain is recorded in the Audit Trail

## How to use

### Step 1: Identify both documents

You need:
- **old_file_id** — the document being replaced (find with `doc_find`)
- **new_file_id** — the replacement document (must already exist and be registered)

If the new document doesn't exist yet, create it first:
- If from a template: use `doc-create`
- If from scratch: use `doc-create-blank`
- Then return here to supersede

### Step 2: Read both documents briefly

Use `doc_read` on both to confirm you have the right pair:

```
"Before proceeding, let me confirm:
- Old document: [name] (status: approved, last edited: 2025-06-10)
- New document: [name] (status: draft, last edited: 2026-04-20)

The old document will be archived and the new one will reference it as its predecessor. This cannot be undone cleanly. Proceed?"
```

### Step 3: Get explicit user confirmation

**Always require explicit confirmation before calling `doc_supersede`.** This is a significant irreversible-in-practice operation. The user must confirm both:
1. Which document is the old (to be archived)
2. Which document is the new (to become active)

Never infer this silently.

### Step 4: Call doc_supersede

```
doc_supersede({
  old_file_id: string,   // the obsolete document's Drive file ID
  new_file_id: string,   // the replacement document's Drive file ID
  reason?: string,       // brief explanation (e.g., "2026 pricing revision")
  superseded_by?: string // actor label, defaults to agent identity
})
```

### Step 5: Present the result

On success, confirm:
- Old document name → now `archived`, moved to Archive folder
- New document name → `supersedes: [old_doc_id]` recorded, status unchanged (typically `draft` or `approved`)
- Both Drive URLs for reference
- Event ID for the Audit Trail

Example:
```
"Done. Version chain created:

Old: Master-Service-Agreement-2025 → now ARCHIVED [Drive link]
New: Master-Service-Agreement-2026 → supersedes the above [Drive link]

Event ID: evt_... (use to undo if needed).
The new document is in `draft` status. Would you like to promote it to `approved`?"
```

## Examples

### Example 1: Policy replacement

**User:** "The 2025 data protection policy is obsolete — we have a new 2026 version. Replace it."

**Agent:**
1. `doc_find({ query: "data protection policy", category: "Governance" })` → finds old doc
2. `doc_find({ query: "data protection policy 2026" })` → finds new doc
3. Reads both briefly. Confirms:
   "I'll archive 'Data-Protection-Policy-2025' and link 'Data-Protection-Policy-2026' as its replacement. The old policy will be archived but remain accessible. Confirm?"
4. User confirms → `doc_supersede({ old_file_id: "...", new_file_id: "...", reason: "Annual policy revision 2026" })`
5. Returns version chain summary.

### Example 2: New document doesn't exist yet

**User:** "I need to replace the old pilot agreement with a completely new one for 2026."

**Agent:**
1. Finds old doc via `doc_find`
2. Notes: "The new document doesn't exist yet. Let me create it first."
3. Runs `doc-context` → confirms template → runs `doc-create` to create new doc
4. Once new doc exists: confirms supersede plan with user
5. Calls `doc_supersede` to complete the chain

### Example 3: User asks to supersede but edit is the right call

**User:** "Supersede the NDA — I need to change the termination clause."

**Agent:**
1. Clarifies: "Superseding replaces the entire document and archives the old version. For a single clause change, editing is simpler and keeps the same file. Would you like me to edit the termination clause instead?"
2. If yes → routes to `doc-edit`
3. If user insists on supersede (e.g., "legal requires a new signed version") → proceeds with `doc-supersede`

## Error handling

| Situation | Response |
|---|---|
| New document not yet registered | "The new document must be registered before superseding. Create it first with `doc-create` or `doc-create-blank`, then return here." |
| Old document already archived | "This document is already archived. If you want to supersede it anyway to establish the chain, confirm and I'll proceed." |
| Old and new document are the same | "The old and new document IDs are the same. Please provide two different documents." |
| `PERMISSION_DENIED` | "The agent can't move the old document to Archive. Check that the service account has Editor access to both the source folder and the Archive folder." |
| User changes mind after confirmation | "Understood. No changes have been made." — never partially execute a supersede. |
