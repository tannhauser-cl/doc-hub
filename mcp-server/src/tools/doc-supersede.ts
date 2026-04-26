/**
 * doc-supersede.ts — MCP tool: doc_supersede
 * Mark a document as superseded (replaced by a newer version).
 * The old document is archived and the new relationship is recorded in the registry.
 */

import { z } from "zod";
import { AppsScriptClient } from "../client.js";

export const DocSupersedeInputSchema = z.object({
  file_id: z
    .string()
    .min(1)
    .describe("Google Drive file ID of the document being superseded (the OLD document)."),
  superseded_by: z
    .string()
    .optional()
    .describe(
      "Identifier of who is performing the supersede action. Format: 'human:<email>' or 'agent:<id>'. Defaults to configured agent identity."
    ),
});

export type DocSupersedeInput = z.infer<typeof DocSupersedeInputSchema>;

export interface DocSupersedeResult {
  file_id: string;
  status: string;
  superseded_by_doc_id: string | undefined;
  new_doc_url: string | undefined;
  updated_at: string;
}

export async function docSupersede(
  input: DocSupersedeInput,
  client: AppsScriptClient,
  defaultSupersededBy: string
): Promise<DocSupersedeResult> {
  const supersededBy = input.superseded_by ?? defaultSupersededBy;

  const raw = await client.post("supersedeDoc", {
    fileId: input.file_id,
    supersededBy,
  });

  const data = raw as Record<string, unknown>;
  return {
    file_id: input.file_id,
    status: String(data["status"] ?? "archived"),
    superseded_by_doc_id: data["superseded_by"] != null ? String(data["superseded_by"]) : undefined,
    new_doc_url: data["url"] != null ? String(data["url"]) : undefined,
    updated_at: String(data["updated_at"] ?? data["updatedAt"] ?? new Date().toISOString()),
  };
}
