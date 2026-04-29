# Agent Usage Guide

How AI agents (Claude Code, Hermes) use doc-hub skills.

## Installed skills

After installation, agents have access to these skills via the doc-hub MCP server:

| Skill | When to use |
|---|---|
| `find-templates` | Discover available templates, understand required fields |
| `doc-find` | Search for existing documents |
| `doc-read` | Read document content |
| `doc-context` | Research prep before creating — gather existing docs + best template |
| `doc-create` | Generate new doc from template |
| `doc-create-blank` | Create blank branded doc without a template |
| `doc-edit` | Edit specific sections of a registered doc |
| `doc-snapshot` | Freeze a doc as immutable PDF for distribution |
| `doc-supersede` | Major version replacement (rare) |
| `doc-archive` | Archive a doc that's no longer active |
| `doc-adopt` | Register an imported/unregistered file |
| `brand-check` | Audit brand compliance before publishing |
| `doc-undo` | Undo a previous operation |

## Typical flows

### Creating a new document from a template

```
User: "Draft the NDA for Colegio San Marcos, contact is Laura Vega"

Agent:
1. find_templates({ category: "Legal" })
   → finds "nda-kuill-pilot", required_inputs: [cliente, firmante]
2. doc_create({ template: "nda-kuill-pilot", inputs: { cliente: "Colegio San Marcos", firmante: "Laura Vega" } })
   → returns { url, name, status: "draft" }
3. Reply: "NDA created: [NDA-Kuill-Pilot-Colegio-San-Marcos-2026-05](url) — status: draft. Ready when you want to snapshot it for signing."
```

### Creating from incomplete information

```
User: "Make an offer letter for the new engineer"

Agent:
1. find_templates({ category: "Internos" })
   → finds "offer-letter", required_inputs: [candidato, rol, comp_mensual, equity_percent, fecha_inicio]
2. doc_create({ template: "offer-letter", inputs: { candidato: "???", rol: "Engineer" } })
   → returns MISSING_INPUTS: [candidato, comp_mensual, equity_percent, fecha_inicio]
3. Reply: "I need a few more details to complete the offer letter:
   - Full name of the candidate?
   - Monthly gross compensation (CLP)?
   - Equity percentage?
   - Start date?"
4. User provides: "Ana García, $3.500.000, 0.25%, May 12"
5. doc_create with complete inputs → success
```

### Researching before creating

```
User: "Prepare the application for Platanus VC fund"

Agent:
1. doc_context({ intent: "Platanus VC fund application" })
   → returns { relevant_templates: [{ id: "postulacion-fondo", ... }], existing_docs: [{ name: "Info-Pack-Kuill" }, { name: "Kuill-Intro" }] }
2. Reply: "I found the 'Postulacion-Fondo' template. Before I start, I'll review these existing docs for relevant data: Info-Pack-Kuill, Kuill-Intro. I still need:
   - Platanus deadline?
   - Requested capital amount?"
3. User provides answers
4. doc_create({ template: "postulacion-fondo", inputs: { ... } })
```

### Sending a document externally

```
User: "The proposal for Colegio X is ready to send"

Agent:
1. doc_find({ query: "Colegio X", category: "Comercial" })
   → finds "Propuesta-Piloto-Colegio-X-2026-05" with file_id "1abc..."
2. brand_check({ file_id: "1abc..." })
   → ok (or surfaces violations for review)
3. doc_snapshot({ file_id: "1abc..." })
   → { snapshotUrl, hash, snapshotName: "Propuesta-Piloto-Colegio-X-2026-05__2026-05-03-1430.pdf" }
4. Reply: "Snapshot created: [PDF link]. The living doc remains editable. Send the PDF link, not the live doc URL."
```

### Undoing a mistake

```
User: "Oops, I accidentally archived the Pilot Playbook"

Agent:
1. doc_find({ query: "Pilot Playbook", status: "archived" })
   → finds the doc with event_id in audit context
2. doc_undo({ event_id: "evt_20260503_143022_a1b2c3" })
   → { ok: true, description: "Moved Pilot-Playbook from Archive/ back to Product/Pilot-toolkit/, status restored to approved" }
3. Reply: "Done. Pilot Playbook is back in Product/Pilot-toolkit/ with status 'approved'."
```

## Rules agents must follow

1. **Never invent field values** — if required_inputs are missing, ask the user before calling doc-create
2. **Never overwrite entire docs** — use doc-edit with targeted ops; for major rewrites use doc-supersede
3. **Always show URLs** — after any create/edit operation, show the clickable Drive URL
4. **Status defaults to draft** — remind user to update status when a doc moves to review/approved/published
5. **Snapshot before sending externally** — always suggest doc-snapshot before distributing outside the org
6. **brand-check before publishing** — run brand-check before setting status to "published"
7. **Confirm before batch operations** — batch undo, batch archive, or any operation on >3 docs requires user confirmation

## Decision tree

```
User wants to work with documents?
│
├── Looking for existing docs → doc-find
├── Read content of a doc → doc-read
├── Create new doc
│   ├── Has a template? → doc-create (call find-templates first)
│   ├── No template → doc-create-blank
│   └── Complex / research needed → doc-context first, then doc-create
├── Edit a doc → doc-edit
├── Freeze for distribution → doc-snapshot
├── Major rewrite → doc-supersede
├── No longer needed → doc-archive
├── Unregistered file → doc-adopt
├── Check brand → brand-check
└── Fix a mistake → doc-undo
```
