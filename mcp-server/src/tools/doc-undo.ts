/**
 * doc-undo.ts — MCP tool: doc_undo
 * Undo a single audit event or a batch of events within a time range.
 * Exactly one of: event_id (single undo) or batch_since (batch undo) must be provided.
 */

import { z } from "zod";
import { AppsScriptClient } from "../client.js";

export const DocUndoInputSchema = z
  .object({
    event_id: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Audit event ID to undo (from the AuditTrail). Use this for a single targeted undo."
      ),
    batch_since: z
      .string()
      .datetime()
      .optional()
      .describe(
        "ISO 8601 timestamp. Undo all events at or after this time. Provide this OR event_id, not both."
      ),
    batch_until: z
      .string()
      .datetime()
      .optional()
      .describe(
        "ISO 8601 timestamp. Upper bound for batch undo (exclusive). Defaults to now."
      ),
    batch_actor: z
      .string()
      .optional()
      .describe(
        "Filter batch undo to events by this actor only. Format: 'human:<email>' or 'agent:<id>'."
      ),
  })
  .refine(
    (d) => (d.event_id != null) !== (d.batch_since != null),
    "Provide exactly one of event_id (single undo) or batch_since (batch undo), not both and not neither."
  );

export type DocUndoInput = z.infer<typeof DocUndoInputSchema>;

export interface DocUndoResult {
  mode: "single" | "batch";
  events_undone: number;
  event_ids: string[];
  summary: string;
}

export async function docUndo(
  input: DocUndoInput,
  client: AppsScriptClient
): Promise<DocUndoResult> {
  if (input.event_id != null) {
    const raw = await client.post("undoEvent", { eventId: input.event_id });
    const data = raw as Record<string, unknown>;
    return {
      mode: "single",
      events_undone: 1,
      event_ids: [input.event_id],
      summary: String(data["message"] ?? `Event ${input.event_id} undone successfully.`),
    };
  }

  // Batch undo — batch_since is guaranteed by the refine above
  const batchSince = input.batch_since as string;
  const body: Record<string, unknown> = { since: batchSince };
  if (input.batch_until != null) body["until"] = input.batch_until;
  if (input.batch_actor != null) body["actor"] = input.batch_actor;

  const raw = await client.post("undoBatch", body);
  const data = raw as Record<string, unknown>;
  const eventIds = Array.isArray(data["event_ids"])
    ? (data["event_ids"] as unknown[]).map(String)
    : [];
  const successCount = Number.isInteger(data["count"]) ? (data["count"] as number) : eventIds.length;

  return {
    mode: "batch",
    events_undone: successCount,
    event_ids: eventIds,
    summary: String(data["message"] ?? `Batch undo completed. ${successCount} event(s) reversed.`),
  };
}
