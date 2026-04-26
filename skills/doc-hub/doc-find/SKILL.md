---
name: doc-find
description: "Search the document Registry to find existing documents by query, category, status, or owner"
version: "1.0.0"
author: doc-hub
license: MIT
category: document-management
tags:
  - drive
  - search
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
---

# doc-find

## When to use this skill

Use `doc-find` any time the user is looking for documents that already exist in the system. Common triggers:

- "Find the NDA for [client]"
- "List all Q1 proposals"
- "Show me Governance documents"
- "Is there an offer letter for María López?"
- "What Legal docs do we have for Colegio San Esteban?"
- "Show me all documents in draft status"
- "Find documents created by [person] last month"

Do NOT use this skill to create, read content, or edit documents. Route those to `doc-create`, `doc-read`, or `doc-edit` respectively.

## What it does

Searches the Registry (a Google Sheet that tracks all managed documents) using one or more filters and returns a list of matching documents with their metadata: name, category, status, owner, Drive URL, and last edited date.

The Registry is the authoritative index — it only contains documents that have been formally registered (created via `doc_create`, `doc_create_blank`, or `doc_adopt`). If a document is not in the Registry, use `doc-adopt` to register it first.

## How to use

### Step 1: Extract search intent

From the user's message, identify:
- **query** — free-text keyword (client name, topic, keyword)
- **category** — one of: `Legal`, `Comercial`, `Internos`, `Governance`, `__adhoc-blank`, `__adopted`
- **status** — one of: `draft`, `review`, `approved`, `published`, `archived`
- **owner** — email address of the document owner
- **created_after / created_before** — ISO date strings (YYYY-MM-DD)

All parameters are optional. Calling with no filters returns recent documents (implementation-defined limit).

### Step 2: Call doc_find

```
doc_find({
  query?: string,
  category?: string,
  status?: string,
  owner?: string,
  created_after?: string,   // "2026-01-01"
  created_before?: string   // "2026-04-30"
})
```

### Step 3: Present results

Return a structured list to the user. For each result show:
- Document name (linked to its Drive URL)
- Category and status
- Last edited date
- Owner

If zero results are returned, say so clearly and suggest:
1. Broadening the query (remove one filter)
2. Checking if the document was created outside the system (use `doc-adopt` if found in Drive)

If more than 20 results are returned, ask the user to narrow the query.

### Step 4: Offer next actions

After presenting results, offer relevant next steps:
- "Would you like me to read the content of any of these?" → `doc-read`
- "Would you like to edit one?" → `doc-edit`
- "Would you like to snapshot one before sending?" → `doc-snapshot`

## Examples

### Example 1: Find by client name

**User:** "Find all NDAs for Colegio San Esteban."

**Agent:**
1. Calls `doc_find({ query: "Colegio San Esteban", category: "Legal" })`
2. Returns: "Found 2 documents in the Legal category matching 'Colegio San Esteban':"
   - NDA-Kuill-Pilot-ColegioSanEsteban-2026-03 — status: `approved` — [Drive link]
   - NDA-Kuill-Pilot-ColegioSanEsteban-2025-11 — status: `archived` — [Drive link]
3. Offers: "Would you like to read one of these, create a new NDA, or snapshot the approved one for sending?"

### Example 2: List all docs in review

**User:** "What documents are currently in review?"

**Agent:**
1. Calls `doc_find({ status: "review" })`
2. Returns a list grouped by category.
3. Offers: "Would you like to approve or edit any of these?"

### Example 3: Category browse

**User:** "Show me all Governance documents."

**Agent:**
1. Calls `doc_find({ category: "Governance" })`
2. Returns the full list sorted by last edited.
3. If empty: "No Governance documents found. Would you like to create one from a template? I can check what templates are available."

### Example 4: Narrow by date range

**User:** "Find proposals from Q1 2026."

**Agent:**
1. Interprets Q1 2026 as 2026-01-01 to 2026-03-31.
2. Calls `doc_find({ category: "Comercial", created_after: "2026-01-01", created_before: "2026-03-31" })`
3. Returns results.

## Error handling

| Situation | Response |
|---|---|
| Zero results | "No documents found matching [criteria]. Try broadening the search or check if the file was created outside the system." |
| Registry unavailable | "The Registry could not be reached. Please check that the MCP server is running and DOC_HUB_WEB_APP_URL is configured." |
| Invalid category value | Correct silently using the closest valid category. If ambiguous, ask the user. |
| User asks for archived docs | By default `doc_find` excludes `archived` status. Explicitly pass `status: "archived"` if the user wants them. |
