---
name: doc-adopt
description: "Register an existing Drive file that was created outside the doc-hub system into the Registry"
version: "1.0.0"
author: doc-hub
license: MIT
category: document-management
tags:
  - drive
  - adopt
  - import
  - registry
department: All
models:
  recommended:
    - claude-opus-4-7
    - claude-sonnet-4-6
mcp:
  server: doc-hub-mcp
  tools:
    - doc_find
    - doc_adopt
---

# doc-adopt

## When to use this skill

Use `doc-adopt` when an existing file in Google Drive needs to be brought into the doc-hub system. The file was not created via `doc-create` or `doc-create-blank` — it was uploaded manually, imported from another system, received via email attachment, or created directly in Drive.

Common triggers:

- "Register this file from Drive — it wasn't created via the system"
- "I uploaded an NDA we received from a vendor, add it to the system"
- "Adopt the files in _Imports/ — they were migrated from our old system"
- "This contract came from legal, can you register it?"
- "There's a Google Doc my colleague created without using the agent — register it"
- "Import this file: [Drive URL]"

**When NOT to use `doc-adopt`:**
- File was already created via `doc-create` or `doc-create-blank` (it's already registered)
- You want to create a new document (use `doc-create` or `doc-create-blank`)

## What it does

`doc_adopt` takes an existing Drive file and:
1. Moves it from its current location (e.g., `_Imports/`) to the correct category folder in the Shared Drive
2. Renames it according to the doc-hub naming convention (no spaces, no version markers, no status words)
3. Creates a Registry entry with status `draft`, category `__adopted`, and `imported_from` metadata
4. Logs the adoption event in the Audit Trail

The file's content is never modified — only its location, name, and Registry record change.

## How to use

### Step 1: Identify the file

The user may provide:
- A Drive URL → use `extractFileId(url)` from helpers to get the file_id
- A file ID directly
- A file name → note that you'll need the file_id, not just the name

If the file ID is unclear, ask the user for the Drive link.

### Step 2: Inspect and gather metadata

Before adopting, you need to decide on:

| Field | Description | Notes |
|---|---|---|
| `file_id` | Drive file ID | Required |
| `new_name` | Doc-hub compliant name | No spaces, no v1/FINAL/draft/dates in name |
| `category` | Folder classification | `Legal`, `Comercial`, `Internos`, `Governance` |
| `audience` | Who the document is for | `internal`, `external` |
| `owner` | Responsible owner email | Ask user if not inferable |
| `status` | Initial status in Registry | Usually `draft`; can be `approved` if user confirms it's final |

For `new_name`: derive it from the file's current name or the user's description, cleaned up to doc-hub conventions. Show the proposed name to the user before adopting.

### Step 3: Check for duplicates

Before adopting, run `doc_find` to check if a similar document is already registered:

```
doc_find({ query: "[file topic or client]", category: "[guessed category]" })
```

If a similar document exists, warn the user:
```
"There's already a document in the Registry that looks similar: '[existing name]'. 
Is this the same document, or should I adopt this as a separate file?"
```

If it's a duplicate, skip adoption. If it's legitimately different, proceed.

### Step 4: Confirm the adoption plan with the user

```
"I'll adopt this file with the following details:
- Current name: [original filename]
- New name: [proposed doc-hub name]
- Category: [category] → will be moved to [category]/ folder
- Audience: [internal/external]
- Owner: [email]
- Status: draft

Confirm?"
```

### Step 5: Call doc_adopt

```
doc_adopt({
  file_id: string,         // Drive file ID of the existing file
  new_name: string,        // cleaned, doc-hub compliant name
  category: string,        // target category folder
  audience: string,        // "internal" | "external"
  owner: string,           // owner email
  status?: string,         // default: "draft"
  adopted_by?: string      // defaults to current agent identity
})
```

### Step 6: Present the result

On success:
- New file location (moved to correct category folder)
- New filename
- Registry doc_id and Drive URL
- Event ID for Audit Trail

```
"Adopted:
- New name: [new_name]
- Moved to: [category]/[new_name]
- Registry ID: doc_...
- Status: draft
- Drive URL: [link]

Event ID: evt_... (use `doc-undo` to reverse if needed)."
```

Offer next steps:
- "Would you like to run a brand check on this document?" → `brand-check`
- "Should I update the status to 'approved' if this document is already final?" → `doc-edit` with `set_status`

## Examples

### Example 1: Adopt a received contract

**User:** "We got an NDA from a vendor. Here's the Drive link: [url]. Register it."

**Agent:**
1. Extracts file_id from URL
2. Asks: "What category should this go in (Legal?), and is it for internal records or external reference?"
3. User: "Legal, internal, owner is legal@company.com"
4. Checks for duplicates → none found
5. Proposes: "New name: NDA-VendorName-2026-04 (cleaned from original 'NDA Vendor final v2'). Legal folder, internal. Confirm?"
6. `doc_adopt({ file_id: "...", new_name: "NDA-VendorName-2026-04", category: "Legal", audience: "internal", owner: "legal@company.com" })`
7. Returns result and event_id.

### Example 2: Bulk import from _Imports/ folder

**User:** "There are 3 files in _Imports/ from the old system. Register them all."

**Agent:**
1. Notes the 3 files (user provides file IDs or the agent queries the _Imports/ folder contents)
2. For each file, proposes a cleaned name and category
3. Presents full list for user to confirm or adjust:
   ```
   File 1: 'MSA-Platanus-2026' → Legal, external, owner: legal@company.com
   File 2: 'Budget-Q1-2026' → Governance, internal, owner: finance@company.com
   File 3: 'Onboarding-Guide-Teacher' → Internos, internal, owner: ops@company.com
   All good? Any changes?
   ```
4. User confirms → adopts sequentially (not parallel), logs all event IDs
5. Reports all 3 adopted with their new Registry IDs.

### Example 3: File already registered

**User:** "Register this file: [url]"

**Agent:**
1. Extracts file_id
2. Runs `doc_find` → finds the file already in the Registry
3. "This file is already registered as '[name]' (status: approved). No adoption needed. Would you like to read or edit it instead?"

## Error handling

| Situation | Response |
|---|---|
| File not found or no access | "The agent can't access this file. Ensure it's shared with the service account and the file ID is correct." |
| File already registered | "This file is already in the Registry as '[name]'. No adoption needed." |
| Proposed name has forbidden patterns | Automatically clean the name and show the cleaned version to the user for confirmation. |
| Category unclear | Ask the user. Do not default silently to `__adopted` — always try to assign the correct category. (Use `__adopted` only as a last resort if the user truly cannot classify the document.) |
| File is in Trash | "This file appears to be in the Trash in Google Drive. Please restore it first, then I can adopt it." |
