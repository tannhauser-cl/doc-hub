/**
 * doc-archive.ts — MCP tool: doc_archive
 * Move a document to the Archive folder and set its status to 'archived'.
 */

import { z } from "zod";
import { AppsScriptClient } from "../client.js";

export const DocArchiveInputSchema = z.object({
  file_id: z
    .string()
    .min(1)
    .describe("Google Drive file ID of the document to archive."),
  archived_by: z
    .string()
    .optional()
    .describe(
      "Identifier of who is archiving the document. Format: 'human:<email>' or 'agent:<id>'. Defaults to configured agent identity."
    ),
});

export type DocArchiveInput = z.infer<typeof DocArchiveInputSchema>;

export interface DocArchiveResult {
  file_id: string;
  status: "archived";
  archived_by: string;
  archived_at: string;
  archive_url: string | undefined;
}

export async function docArchive(
  input: DocArchiveInput,
  client: AppsScriptClient,
  defaultArchivedBy: string
): Promise<DocArchiveResult> {
  const archivedBy = input.archived_by ?? defaultArchivedBy;

  const raw = await client.post("archiveDoc", {
    fileId: input.file_id,
    archivedBy,
  });

  const data = raw as Record<string, unknown>;
  return {
    file_id: input.file_id,
    status: "archived",
    archived_by: archivedBy,
    archived_at: String(data["archived_at"] ?? data["archivedAt"] ?? new Date().toISOString()),
    archive_url: data["url"] != null ? String(data["url"]) : undefined,
  };
}
