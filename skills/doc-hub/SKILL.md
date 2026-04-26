---
name: doc-hub
description: "Manage all corporate documents in Google Drive — find, create, read, edit, snapshot, audit, and govern with brand consistency"
version: "1.0.0"
author: doc-hub
license: MIT
category: document-management
tags:
  - drive
  - documents
  - governance
  - brand
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
    - doc_read
    - doc_create
    - doc_create_blank
    - doc_edit
    - doc_snapshot
    - doc_supersede
    - doc_archive
    - doc_adopt
    - doc_undo
    - brand_check
    - find_templates
    - doc_context
---

# doc-hub

The doc-hub skill suite gives AI agents complete, governed access to your organization's Google Drive document system. Every document operation — creation, editing, versioning, distribution, and archiving — is tracked in the Registry with a full audit trail and inverse operations for safe rollback.

## When to use this skill

Use the doc-hub suite any time the user wants to:

- Find existing documents (proposals, NDAs, playbooks, reports)
- Create new documents from templates or from scratch
- Read the content of a specific document
- Edit a registered document
- Freeze a document for distribution (PDF snapshot)
- Replace an outdated document with a new version (supersede)
- Retire a document that is no longer active (archive)
- Register an externally created file into the system (adopt)
- Undo any doc-hub operation
- Audit a document for brand compliance
- Discover what document templates are available

## Sub-skills and when to use each

| Sub-skill | Invoke when... |
|---|---|
| `doc-find` | User asks to find, list, or search existing documents |
| `doc-read` | User wants to read or understand the content of a specific doc |
| `doc-context` | User wants to create something non-trivial — gather context first |
| `doc-create` | User wants to generate a new document from a template |
| `doc-create-blank` | User wants a new branded doc with no template |
| `doc-edit` | User wants to modify content in a registered document |
| `doc-snapshot` | User wants to freeze a doc before sending, signing, or submitting |
| `doc-supersede` | User wants to replace an old doc entirely with a new major version |
| `doc-archive` | User wants to retire a document that is no longer active |
| `doc-adopt` | User has an existing file (uploaded, imported) they want to register |
| `doc-undo` | User wants to reverse a previous doc-hub action |
| `brand-check` | User wants to verify a document complies with the brand kit |
| `find-templates` | User wants to see available templates or check what fields a template needs |

## Decision tree

To pick the right sub-skill, ask yourself:

```
1. Are you looking for an existing document?
   → doc-find (search Registry by query/category/status)

2. Are you trying to read or summarize a document's content?
   → doc-read

3. Are you creating something new?
   a. Is there likely an existing similar doc or a relevant template?
      → doc-context first, then doc-create
   b. Do you know the exact template and inputs?
      → doc-create directly
   c. No template needed — just start from scratch?
      → doc-create-blank

4. Are you modifying an existing registered document?
   → doc-edit

5. Are you distributing or sending a document externally?
   → doc-snapshot first (freeze it), then share the PDF URL

6. Is the entire document obsolete and being replaced by a new one?
   → doc-supersede

7. Is the document no longer active but should be kept?
   → doc-archive

8. Is there a file in Google Drive that was never registered?
   → doc-adopt

9. Did something go wrong in a previous doc-hub operation?
   → doc-undo

10. Does a document need a brand audit before publishing?
    → brand-check

11. Not sure what templates exist for a given need?
    → find-templates
```

## Core conventions

- **Registry is the source of truth.** If a document is not in the Registry, it does not exist from the system's perspective. Use `doc-adopt` to bring external files in.
- **Filenames never contain versions, status, or dates.** Status lives in the Registry. Use `doc-snapshot` for distribution milestones.
- **Living docs are always editable.** Snapshots are immutable PDFs. These coexist — taking a snapshot does not lock the living doc.
- **New documents always start as `draft`.** The status lifecycle is: `draft` → `review` → `approved` → `published` → `archived`.
- **The agent never invents field values.** If a template requires inputs that the user has not provided, ask for them before calling `doc_create`.
- **Soft locks are automatic.** `doc_edit` acquires a lock automatically. If a `LOCKED` error is returned, tell the user who holds it — never silently retry.
- **All operations are reversible.** Every action writes an inverse op to the Audit Trail. Use `doc_undo` with the `event_id` from any operation's response.

## Document categories

- `Legal` — NDAs, contracts, agreements
- `Comercial` — proposals, offers, presentations to external parties
- `Internos` — internal memos, playbooks, reports
- `Governance` — policies, procedures, compliance docs
- `__adhoc-blank` — unstructured docs created without a template
- `__adopted` — files adopted from outside the system

## Status lifecycle

```
draft → review → approved → published → archived
```

Documents can move forward or backward by editing the `status` field via `doc_edit`. Only `archived` is terminal for active work; archived docs remain searchable with `status:archived`.

## Error codes

| Code | Meaning | Action |
|---|---|---|
| `MISSING_INPUTS` | Template requires fields not provided | Ask user for the missing fields |
| `LOCKED` | Document is locked by another user or agent | Tell user who holds the lock; ask how to proceed |
| `NOT_FOUND` | Document or template does not exist in Registry | Verify with `doc_find` or `find_templates` |
| `PERMISSION_DENIED` | Agent lacks Drive access | Ask user to check service account permissions |
| `TEMPLATE_INACTIVE` | Template exists but is disabled | Notify user; suggest alternatives via `find_templates` |
