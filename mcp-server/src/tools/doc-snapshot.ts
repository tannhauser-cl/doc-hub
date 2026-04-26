/**
 * doc-snapshot.ts — MCP tool: doc_snapshot
 * Create an immutable PDF snapshot of a document.
 */

import { z } from "zod";
import { AppsScriptClient } from "../client.js";

export const DocSnapshotInputSchema = z.object({
  file_id: z
    .string()
    .min(1)
    .describe("Google Drive file ID of the document to snapshot."),
  snapshot_by: z
    .string()
    .optional()
    .describe(
      "Identifier of who triggered the snapshot. Format: 'human:<email>' or 'agent:<id>'. Defaults to configured agent identity."
    ),
});

export type DocSnapshotInput = z.infer<typeof DocSnapshotInputSchema>;

export interface DocSnapshotResult {
  file_id: string;
  snapshot_url: string;
  snapshot_name: string;
  hash: string;
  snapshot_by: string;
  created_at: string;
}

export async function docSnapshot(
  input: DocSnapshotInput,
  client: AppsScriptClient,
  defaultSnapshotBy: string
): Promise<DocSnapshotResult> {
  const snapshotBy = input.snapshot_by ?? defaultSnapshotBy;

  const raw = await client.post("snapshotDoc", {
    fileId: input.file_id,
    snapshotBy,
  });

  const data = raw as Record<string, unknown>;
  return {
    file_id: input.file_id,
    snapshot_url: String(data["url"] ?? data["snapshotUrl"] ?? ""),
    snapshot_name: String(data["name"] ?? data["snapshotName"] ?? ""),
    hash: String(data["hash"] ?? ""),
    snapshot_by: snapshotBy,
    created_at: String(data["created_at"] ?? data["createdAt"] ?? new Date().toISOString()),
  };
}
