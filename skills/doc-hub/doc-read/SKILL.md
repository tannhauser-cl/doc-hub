---
name: doc-read
description: "Read and summarize the structured content of a registered document from Google Drive"
version: "1.0.0"
author: doc-hub
license: MIT
category: document-management
tags:
  - drive
  - read
  - content
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
---

# doc-read

## When to use this skill

Use `doc-read` any time the user wants to understand the content of a specific document. Common triggers:

- "What does the Pilot Playbook say about pricing?"
- "Read the offer letter for María López"
- "What are the terms in the NDA with Colegio X?"
- "Summarize the Q1 report"
- "What's in the onboarding guide?"
- "Show me the content of [document name]"
- "Does our proposal mention retainer fees?"

Do NOT use `doc-read` to make edits. Route those to `doc-edit`.

## What it does

Retrieves the structured content of a registered document from Google Drive and returns it as structured text. The returned content includes headings, body text, tables (as structured data), and key metadata (status, owner, last edited).

Use the content to answer user questions, generate summaries, identify specific clauses or sections, or prepare context for a follow-up edit.

## How to use

### Step 1: Identify the document

The user may refer to a document by:
- **Name or partial name** — use `doc_find` first to resolve the exact `file_id`
- **Drive URL** — extract the `file_id` using the `extractFileId` helper
- **doc_id** — the Registry identifier (e.g. `doc_20260425_143022_abc`)

If the user gives a partial name or description, call `doc_find` first and confirm which document they mean before reading. If multiple matches are found, show them and ask for confirmation.

### Step 2: Resolve the file_id (if needed)

```
// If the user gave a name, find it first:
doc_find({ query: "Pilot Playbook" })
// → pick the correct result, note its file_id

// If the user gave a URL:
// Use extractFileId(url) from helpers/drive-urls.ts to get the ID
```

### Step 3: Call doc_read

```
doc_read({
  file_id: string   // Drive file ID or doc_id from Registry
})
```

### Step 4: Use the content to answer the user

Do not dump the entire raw content unless the user explicitly asks for it. Instead:
- If the user asked a specific question, answer it citing the relevant section
- If the user asked for a summary, produce a concise summary with key points
- If the user asked for a specific clause or section, extract and quote it directly

Always note the document's current status and last edited date so the user knows they are working with current information.

### Step 5: Offer next actions

After answering, offer relevant follow-up:
- "Would you like to edit a section?" → `doc-edit`
- "Would you like to take a snapshot before sharing?" → `doc-snapshot`
- "Should I compare this against another document?"

## Examples

### Example 1: Answer a specific question about a doc

**User:** "What does the Pilot Playbook say about pricing?"

**Agent:**
1. Calls `doc_find({ query: "Pilot Playbook", category: "Internos" })` → finds `file_id: 1abc...xyz`
2. Calls `doc_read({ file_id: "1abc...xyz" })`
3. Searches content for the pricing section
4. Returns: "In the Pilot Playbook (last updated 2026-04-10, status: `published`), Section 4 — Pricing says: [exact quote]."
5. Offers: "Would you like to update this section or take a snapshot of the playbook?"

### Example 2: Summarize a document

**User:** "Summarize the Q1 2026 investor report."

**Agent:**
1. Calls `doc_find({ query: "Q1 2026 investor report", category: "Governance" })`
2. If multiple results, shows them and asks which one
3. Calls `doc_read({ file_id: "..." })`
4. Returns a 3-5 bullet summary of the report's key points
5. Status: `approved`, last edited: 2026-03-28 by ana@company.com

### Example 3: Extract a specific clause from a contract

**User:** "What's the termination clause in the NDA with Colegio San Esteban?"

**Agent:**
1. `doc_find({ query: "NDA Colegio San Esteban", category: "Legal" })` → one result
2. `doc_read({ file_id: "..." })`
3. Locates the termination clause and quotes it verbatim
4. Notes: "This is the `approved` version dated 2026-03-15. If you need to update this clause, I can open an edit."

## Error handling

| Situation | Response |
|---|---|
| Document not found by name | Run `doc_find` first. If still not found, suggest the file may not be registered — offer `doc-adopt`. |
| `doc_read` returns empty content | "The document appears to be empty or contains no readable text. It may be an image-based PDF or a blank document." |
| Document is a PDF snapshot | "This is an immutable PDF snapshot taken on [date]. The living document is [link]. Should I read that instead?" |
| File permission error | "The agent does not have access to this file. Please share it with the service account or check Drive permissions." |
| User gives a URL to an unregistered file | Extract the file_id, attempt `doc_read`. If the file is not in the Registry, note that and offer `doc-adopt` to register it. |
