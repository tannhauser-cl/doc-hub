# Versioning Strategy

doc-hub uses a three-level versioning model. The golden rule: **document names never encode version or status**.

## Level 1 — Living docs (default, 90% of cases)

One file. One Drive ID. Always.

- The file is edited in place. Drive's native revision history (every keystroke, named restore points) is the low-level version control.
- **Status** (`draft → review → approved → published → archived`) lives in the Registry, not the filename.
- To find "the current version": look it up in the Registry by name or doc_id. The row with `status != archived` and no `superseded_by` is the one.
- Co-editing is handled natively by Google (Docs/Slides/Sheets real-time collaboration). No merge conflicts.

**What this eliminates:** `Proposal_v2.pptx`, `Proposal_FINAL.pptx`, `Proposal_FINAL_2.pptx`, `Proposal_FINAL_v3_reviewed.pptx`

## Level 2 — Snapshots (for distribution milestones)

When a document is sent outside the org, submitted to a fund, or signed:

1. Call `doc-snapshot` (skill/sidebar/MCP tool)
2. A PDF is exported and saved as `<DocName>__<YYYY-MM-DD-HHMM>.pdf` in `<folder>/Snapshots/`
3. The PDF is set to read-only (can never be edited)
4. A SHA-256 hash is computed and stored in the Registry
5. The living doc continues being editable

```
Management/Legal/
├── NDA-Kuill-Pilot-Colegio-X-2026-05.gdoc   ← living, always current
└── Snapshots/
    ├── NDA-Kuill-Pilot-Colegio-X-2026-05__2026-05-03-1100.pdf  ← before signing
    └── NDA-Kuill-Pilot-Colegio-X-2026-05__2026-05-10-1545.pdf  ← signed version
```

**Use snapshots for:** signed contracts, submitted grant applications, sent investor decks, published policy docs.

## Level 3 — Supersede (rare, major rewrites)

When a document is so fundamentally changed that the old version is no longer relevant (full policy rewrite, new product strategy, etc.):

1. Call `doc-supersede` on the old file
2. Old file moves to `<folder>/Archive/` as read-only
3. A new file is created with the same clean name
4. Registry records `supersedes`/`superseded_by` chain
5. Searches default to active documents only (archived/superseded filtered out)

```
Product/Pilot-toolkit/
├── Pilot-Playbook.gdoc                  ← current living doc (v2)
└── Archive/
    └── Pilot-Playbook--superseded-2025-12.gdoc  ← v1, read-only
```

**Use supersede for:** complete policy rewrites, product strategy pivots, total rebrands.
**Do NOT use for:** regular edits (just edit the living doc), incremental updates.

## Handling imported files

Files created outside the system (local edits, email attachments) should go through the adopt flow:

1. Upload/move the file to `_Imports/` in the Shared Drive
2. Run `doc-adopt` (skill/sidebar)
3. The wizard asks: category, target name, audience
4. The file is moved to the correct folder, renamed, converted to Google native if binary
5. Registered in the Registry as `template_id: "__adopted"`
6. Original binary preserved in `_Imports/<original>__imported-<date>`

The linter flags files in `_Imports/` after 7 days of inactivity.

## Anti-proliferation linter

The linter runs daily and flags:

| Violation | Type | Example |
|---|---|---|
| Forbidden name pattern | error | `PRESENTACION_FINAL_v3.pptx` |
| Unregistered file (orphan) | warning | Any file in a domain folder with no Registry row |
| Similar filename in different folder | warning | `Proposal-Colegio-X` + `Proposal-Colegio-X-copy` |
| Stale import | warning | File in `_Imports/` not adopted after 7 days |

Reports are sent to adminEmail and logged to Audit-Trail.

## Soft lock for concurrent edits

When `doc-edit` is called:
1. Lock is acquired automatically (30min TTL by default)
2. If another edit arrives while locked, returns `{code: "LOCKED", lockedBy, lockedUntil}`
3. Agent notifies user: "This doc is being edited by X until 14:45. Do you want to wait or override?"
4. Lock auto-expires — never permanently blocking
5. Minor edits (status changes, metadata) don't require a lock

## Rollback

Every doc-hub operation records an `inverse_op` in the Audit-Trail. To undo:

```bash
# Single operation
doc-undo --event_id evt_20260503_143022_a1b2c3

# Batch (e.g. undo everything the linter auto-renamed)
doc-undo --batch_since "2026-05-03T14:00:00Z" --batch_actor "agent:linter"
```

Undo is non-destructive: deleted files go to `_Trash/` (30-day TTL) before permanent purge.
