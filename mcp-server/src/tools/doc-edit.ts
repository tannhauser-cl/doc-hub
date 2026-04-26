/**
 * doc-edit.ts — MCP tool: doc_edit
 * Edit a document by applying structured ops.
 * Acquires a soft lock before editing, releases it after.
 * Returns LOCKED error if the document is already locked by someone else.
 */

import { z } from "zod";
import { AppsScriptClient } from "../client.js";
import { DocHubError } from "../types.js";

export const EditOpSchema = z.object({
  type: z
    .enum(["replace", "append", "prepend"])
    .describe("Operation type: replace a section, append to it, or prepend."),
  section: z
    .string()
    .optional()
    .describe(
      "Target section heading or anchor text. Omit to target the whole document body."
    ),
  content: z.string().describe("New content to apply for this operation."),
});

export const DocEditInputSchema = z.object({
  file_id: z
    .string()
    .min(1)
    .describe("Google Drive file ID of the document to edit."),
  ops: z
    .array(EditOpSchema)
    .min(1)
    .describe(
      "List of edit operations to apply in order. Each op targets an optional section with a replace/append/prepend action."
    ),
  edited_by: z
    .string()
    .optional()
    .describe(
      "Identifier of the editor. Format: 'human:<email>' or 'agent:<id>'. Defaults to configured agent identity."
    ),
});

export type DocEditInput = z.infer<typeof DocEditInputSchema>;

export interface DocEditSuccess {
  ok: true;
  file_id: string;
  name: string | undefined;
  url: string | undefined;
  edited_by: string;
  edited_at: string;
  ops_applied: number;
}

export interface DocEditLocked {
  ok: false;
  code: "LOCKED";
  message: string;
  locked_by: string;
  locked_until: string;
}

export type DocEditResult = DocEditSuccess | DocEditLocked;

const LOCK_TTL_MINUTES = 5;

export async function docEdit(
  input: DocEditInput,
  client: AppsScriptClient,
  defaultEditedBy: string
): Promise<DocEditResult> {
  const editedBy = input.edited_by ?? defaultEditedBy;

  // Step 1: Acquire lock
  try {
    await client.post("lockDoc", {
      fileId: input.file_id,
      lockedBy: editedBy,
      ttlMinutes: LOCK_TTL_MINUTES,
    });
  } catch (err) {
    const e = err as DocHubError;
    if (e.code === "LOCKED") {
      const details = e.details as { locked_by?: string; locked_until?: string } | undefined;
      return {
        ok: false,
        code: "LOCKED",
        message: e.message,
        locked_by: details?.locked_by ?? String((e as unknown as Record<string, unknown>)["lockedBy"] ?? "unknown"),
        locked_until: details?.locked_until ?? String((e as unknown as Record<string, unknown>)["lockedUntil"] ?? "unknown"),
      };
    }
    throw err;
  }

  // Step 2: Apply edits
  try {
    const raw = await client.post("editDoc", {
      fileId: input.file_id,
      ops: input.ops,
      editedBy,
    });

    const data = raw as Record<string, unknown>;
    return {
      ok: true,
      file_id: input.file_id,
      name: data["name"] != null ? String(data["name"]) : undefined,
      url: data["url"] != null ? String(data["url"]) : undefined,
      edited_by: editedBy,
      edited_at: String(data["edited_at"] ?? data["editedAt"] ?? new Date().toISOString()),
      ops_applied: input.ops.length,
    };
  } finally {
    // Step 3: Always release lock (best-effort)
    try {
      await client.post("unlockDoc", {
        fileId: input.file_id,
        unlockedBy: editedBy,
      });
    } catch {
      // Lock release failure is non-fatal — it will auto-expire after TTL
    }
  }
}
