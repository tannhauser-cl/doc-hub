# Rollback Guide

Every doc-hub operation is reversible. This document explains how.

## Single operation undo

Every API call (create, edit, snapshot, supersede, archive, adopt) records an `event_id` in the Audit-Trail. Use this to undo:

```
# Via agent skill
doc-undo --event_id evt_20260503_143022_a1b2c3

# Via MCP tool (direct)
doc_undo(event_id="evt_20260503_143022_a1b2c3")
```

What each undo does:

| Operation | Undo action |
|---|---|
| `renderTemplate` / `createBlank` | Moves doc to `_Trash/`, removes Registry row |
| `editDoc` | Restores Drive revision captured before edit |
| `snapshotDoc` | Moves snapshot PDF to `_Trash/`, removes snapshot from Registry `snapshots_json` |
| `supersedeDoc` | Restores old doc from Archive/ to original folder, removes new doc to `_Trash/`, clears chain |
| `archiveDoc` | Moves doc from Archive/ back to original folder, restores status |
| `adoptFile` | Moves doc back to `_Imports/`, removes Registry row |
| `updateStatus` | Restores previous status value |

## Batch undo

Undo everything in a time window (or by a specific actor):

```
doc-undo --batch_since "2026-05-03T14:00:00Z"
doc-undo --batch_since "2026-05-03T14:00:00Z" --batch_until "2026-05-03T15:00:00Z"
doc-undo --batch_since "2026-05-03T14:00:00Z" --batch_actor "agent:linter"
```

**Always confirm with the user before batch undo.** The agent should list the events first and ask for confirmation.

The batch executes inverse-ops in reverse chronological order (newest first).

## Full system uninstall

If you need to completely remove doc-hub from a tenant (engine only — does NOT delete user documents):

1. In Apps Script editor, run the `uninstall()` function in `scripts/uninstall.gs`
2. Type the confirmation string when prompted: `UNINSTALL DOC HUB`
3. What happens:
   - All time-based triggers are deleted (linter, lifecycle stops running)
   - The Workspace Add-on (sidebar) is unpublished
   - `_Registry/` folder is renamed to `_Registry-decommissioned-YYYY-MM-DD/` and set to view-only
   - Registry and Audit-Trail are exported as CSV and saved in the renamed folder
   - All domain folders and user documents are left completely untouched
   - A README is created in `_Registry-decommissioned/` explaining the decommissioning

4. To reinstall: run `reinstall()` in `scripts/reinstall.gs` — restores triggers and re-publishes add-on

## _Trash/ TTL

Soft-deleted items live in `_Trash/` before permanent purge:
- Regular documents: 30 days (configurable in `tenant.config.json → trash.docTtlDays`)
- Snapshot PDFs: 90 days (configurable → `trash.snapshotTtlDays`)

The `runLifecyclePolicies()` function (triggered daily) purges items past their TTL.

To recover an item from `_Trash/` before TTL:
1. Find its event_id in the Audit-Trail (action = `softDelete`)
2. `doc-undo --event_id <id>`

After TTL, recovery from `_Trash/` is no longer possible — but Drive's own trash (if Drive trash wasn't emptied) may still have it.
