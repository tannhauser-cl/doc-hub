/**
 * doc-adopt.ts — MCP tool: doc_adopt
 * Adopt an unmanaged file from the _Imports/ folder into the doc-hub registry.
 * Assigns it a category, canonical name, and audience classification.
 */

import { z } from "zod";
import { AppsScriptClient } from "../client.js";

export const DocAdoptInputSchema = z.object({
  file_id: z
    .string()
    .min(1)
    .describe(
      "Google Drive file ID of the file to adopt. The file should be in the _Imports/ folder."
    ),
  category: z
    .enum(["Legal", "Comercial", "Internos", "Governance"])
    .describe("Category to assign this document to."),
  name: z
    .string()
    .min(1)
    .describe(
      "Canonical kebab-case name for the document (no extension). This replaces the original filename."
    ),
  audience: z
    .enum(["internal", "external"])
    .describe(
      "'internal' = company use only; 'external' = may be shared outside the organization."
    ),
  adopted_by: z
    .string()
    .optional()
    .describe(
      "Identifier of who is adopting the file. Format: 'human:<email>' or 'agent:<id>'. Defaults to configured agent identity."
    ),
});

export type DocAdoptInput = z.infer<typeof DocAdoptInputSchema>;

export interface DocAdoptResult {
  doc_id: string;
  file_id: string;
  name: string;
  url: string | undefined;
  category: string;
  audience: string;
  adopted_by: string;
  adopted_at: string;
}

export async function docAdopt(
  input: DocAdoptInput,
  client: AppsScriptClient,
  defaultAdoptedBy: string
): Promise<DocAdoptResult> {
  const adoptedBy = input.adopted_by ?? defaultAdoptedBy;

  const raw = await client.post("adoptFile", {
    fileId: input.file_id,
    category: input.category,
    name: input.name,
    audience: input.audience,
    adoptedBy,
  });

  const data = raw as Record<string, unknown>;
  return {
    doc_id: String(data["doc_id"] ?? data["docId"] ?? ""),
    file_id: input.file_id,
    name: String(data["name"] ?? input.name),
    url: data["url"] != null ? String(data["url"]) : undefined,
    category: input.category,
    audience: input.audience,
    adopted_by: adoptedBy,
    adopted_at: String(data["adopted_at"] ?? data["adoptedAt"] ?? new Date().toISOString()),
  };
}
