/**
 * doc-create-blank.ts — MCP tool: doc_create_blank
 * Create a blank document (no template) in a given category.
 */

import { z } from "zod";
import { AppsScriptClient } from "../client.js";

export const DocCreateBlankInputSchema = z.object({
  category: z
    .enum(["Legal", "Comercial", "Internos", "Governance"])
    .describe("Target category for the new document."),
  title: z
    .string()
    .min(1)
    .describe("Document title / filename (no extension). Use kebab-case naming convention."),
  audience: z
    .enum(["internal", "external"])
    .describe("Audience for this document. 'internal' = company use only; 'external' = may be shared outside."),
  doc_type: z
    .enum(["document", "presentation", "spreadsheet"])
    .optional()
    .default("document")
    .describe("Type of Google Workspace file to create. Defaults to 'document'."),
  created_by: z
    .string()
    .optional()
    .describe(
      "Identifier of the creator. Format: 'human:<email>' or 'agent:<id>'. Defaults to configured agent identity."
    ),
});

export type DocCreateBlankInput = z.infer<typeof DocCreateBlankInputSchema>;

export interface DocCreateBlankResult {
  doc_id: string;
  file_id: string;
  name: string;
  url: string;
  category: string;
  doc_type: string;
  audience: string;
  created_by: string;
  created_at: string;
}

export async function docCreateBlank(
  input: DocCreateBlankInput,
  client: AppsScriptClient,
  defaultCreatedBy: string
): Promise<DocCreateBlankResult> {
  const raw = await client.post("createBlank", {
    category: input.category,
    title: input.title,
    audience: input.audience,
    docType: input.doc_type ?? "document",
    createdBy: input.created_by ?? defaultCreatedBy,
  });

  const data = raw as Record<string, unknown>;
  return {
    doc_id: String(data["doc_id"] ?? data["docId"] ?? ""),
    file_id: String(data["file_id"] ?? data["fileId"] ?? ""),
    name: String(data["name"] ?? input.title),
    url: String(data["url"] ?? ""),
    category: input.category,
    doc_type: input.doc_type ?? "document",
    audience: input.audience,
    created_by: String(data["created_by"] ?? data["createdBy"] ?? input.created_by ?? defaultCreatedBy),
    created_at: String(data["created_at"] ?? data["createdAt"] ?? new Date().toISOString()),
  };
}
