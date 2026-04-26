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
      .optional()
      .describe(
        "Audit event ID to undo (from the AuditTrail). Use this for a single targeted undo."
      ),
    batch_since: z
      .string()
      .optional()
      .describe(
        "ISO 8601 timestamp. Undo all events at or after this time. Requires batch_since if not using event_id."
      ),
    batch_until: z
      .string()
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
    (d) => d.event_id != null || d.batch_since != null,
    "Either event_id or batch_since must be provided."
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

  // Batch undo
  const body: Record<string, unknown> = {
    since: input.batch_since!,
  };
  if (input.batch_until != null) body["until"] = input.batch_until;
  if (input.batch_actor != null) body["actor"] = input.batch_actor;

  const raw = await client.post("undoBatch", body);
  const data = raw as Record<string, unknown>;
  const eventIds = Array.isArray(data["event_ids"])
    ? (data["event_ids"] as unknown[]).map(String)
    : [];

  return {
    mode: "batch",
    events_undone: typeof data["count"] === "number" ? data["count"] : eventIds.length,
    event_ids: eventIds,
    summary: String(data["message"] ?? `Batch undo completed. ${eventIds.length} event(s) reversed.`),
  };
}
