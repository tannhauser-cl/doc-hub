---
name: doc-edit
description: "Edit a registered document using targeted declarative operations — replace, append, or prepend sections"
version: "1.0.0"
author: doc-hub
license: MIT
category: document-management
tags:
  - drive
  - edit
  - documents
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
    - doc_edit
---

# doc-edit

## When to use this skill

Use `doc-edit` when the user wants to modify content in a registered document. Common triggers:

- "Update the pricing section in the Colegio Norte proposal"
- "Add a new section about retainer fees to the NDA"
- "Change the contact person in the offer letter for Carlos"
- "Fix the typo in the onboarding playbook"
- "Append the new terms to the service agreement"
- "Update the status of the Q1 report to 'approved'"

**Critical rules:**
- Never rewrite entire documents. Use targeted `replace`, `append`, or `prepend` operations on specific sections.
- Always acquire context before editing — read the document first (`doc_read`) if you don't already know its structure.
- The tool auto-acquires a soft lock. If a `LOCKED` error is returned, tell the user who holds it and wait for their instruction.
- Only edit the specific sections the user asked to change. Leave all other content untouched.

## What it does

`doc_edit` applies declarative operations to a registered Google Drive document:
- **replace** — replace a specific text string or section with new content
- **append** — add content at the end of the document or at the end of a specified section
- **prepend** — add content at the beginning of the document or before a specified section
- **set_status** — update the document's Registry status (e.g., `draft` → `review`)

The tool automatically acquires a soft lock before writing and releases it on completion. Every edit is logged in the Audit Trail with the inverse operation for undo support.

## How to use

### Step 1: Identify the document

Resolve the `file_id` from the user's reference:
- By name → `doc_find({ query: "..." })`
- By URL → use `extractFileId(url)` from helpers
- By doc_id → use directly

If multiple matches, confirm with the user.

### Step 2: Read the document (if needed)

If you need to understand the current content structure before editing, call `doc_read` first. This is especially important when:
- The user refers to a section by description ("the pricing section") rather than exact text
- You need to confirm the current text before proposing a replacement
- The edit is conditional ("update X if it still says Y")

### Step 3: Build the operations array

Translate the user's request into one or more declarative operations:

```typescript
// Replace an exact string
{ op: "replace", find: "exact text to find", replace: "new text" }

// Replace a named section (heading + body)
{ op: "replace_section", heading: "Pricing", replace: "New pricing content..." }

// Append to end of document
{ op: "append", content: "Additional content here." }

// Append after a named section
{ op: "append_after", heading: "Terms", content: "New paragraph after Terms section." }

// Prepend at start of document
{ op: "prepend", content: "Preamble text." }

// Update Registry status only
{ op: "set_status", status: "review" }
```

Use the most targeted operation possible. Prefer `replace` over full rewrites. If the user wants to change multiple things, batch them in a single `doc_edit` call.

### Step 4: Confirm significant edits

For edits that change meaning (clause modifications, status promotions, price changes), briefly confirm with the user before applying:

```
"I'll replace the pricing section with the new rates ($X → $Y). Confirm?"
```

For minor typo fixes or formatting, proceed without confirmation.

### Step 5: Call doc_edit

```
doc_edit({
  file_id: string,
  ops: [
    { op: "replace", find: "...", replace: "..." },
    // more ops if needed
  ],
  edited_by?: string    // defaults to current agent identity
})
```

### Step 6: Handle LOCKED response

If the tool returns a `LOCKED` error:

```
"This document is currently locked by [locked_by] until [locked_until].

Options:
1. Wait until the lock expires and try again
2. Ask [locked_by] to release the lock manually
3. If this is urgent and the lock is stale, I can request a forced unlock (requires admin approval)"
```

Do not retry silently or loop. Wait for the user's explicit instruction.

### Step 7: Present the result

On success:
- Confirm what was changed
- Show the Drive URL for immediate review
- Note the Audit Trail event_id (for undo)

Offer: "If this edit was a mistake, I can undo it with event ID `[event_id]`."

## Examples

### Example 1: Update a specific value

**User:** "Change the price in the Colegio Norte proposal from $2,500 to $3,200."

**Agent:**
1. `doc_find({ query: "Colegio Norte proposal" })` → finds file_id
2. Confirms: "Found: Propuesta-Comercial-ColegioNorte-2026-03. I'll replace '$2,500' with '$3,200' in the pricing section. Confirm?"
3. `doc_edit({ file_id: "...", ops: [{ op: "replace", find: "$2,500", replace: "$3,200" }] })`
4. "Done. The price has been updated. Event ID: `evt_20260425_...` (use this to undo if needed)."

### Example 2: Append new terms to a contract

**User:** "Add a new data protection clause at the end of the NDA for Colegio San Esteban."

**Agent:**
1. `doc_find({ query: "NDA Colegio San Esteban", status: "approved" })` → finds file_id
2. Asks user: "Please provide the text for the data protection clause."
3. User provides the text.
4. `doc_edit({ file_id: "...", ops: [{ op: "append", content: "[user-provided clause text]" }] })`
5. Returns confirmation + event_id.

### Example 3: Promote status to review

**User:** "Mark the Q1 report as ready for review."

**Agent:**
1. `doc_find({ query: "Q1 report", status: "draft" })` → finds file_id
2. `doc_edit({ file_id: "...", ops: [{ op: "set_status", status: "review" }] })`
3. "The Q1 report status has been updated to `review`."

### Example 4: Multi-operation edit

**User:** "In the teacher onboarding playbook, fix the section header 'Onboading Steps' (typo) and update the contact email to new@company.com."

**Agent:**
1. `doc_find` → resolves file_id
2. `doc_edit({ file_id: "...", ops: [
     { op: "replace", find: "Onboading Steps", replace: "Onboarding Steps" },
     { op: "replace", find: "old@company.com", replace: "new@company.com" }
   ] })`
3. "Two changes applied: fixed the typo and updated the contact email."

## Error handling

| Situation | Response |
|---|---|
| `LOCKED` | Tell user who holds the lock and until when. Offer options (wait, request unlock). Never retry silently. |
| `find` text not found in doc | "I couldn't find the exact text '[find]' in the document. Let me read the current content so I can identify the correct text to replace." → `doc_read` then re-attempt with corrected text |
| Multiple instances of `find` text | "The text '[find]' appears [N] times in the document. Which instance should I replace? First, last, or all?" |
| `NOT_FOUND` file | "This document doesn't appear to be in the Registry. Is the file ID correct? If the file exists in Drive but isn't registered, use `doc-adopt` first." |
| Edit to archived document | Warn: "This document has status `archived`. Editing an archived document will change its status back to `draft`. Do you want to proceed?" |
