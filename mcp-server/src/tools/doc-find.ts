/**
 * doc-find.ts — MCP tool: doc_find
 * Search for documents in the doc-hub registry.
 */

import { z } from "zod";
import { AppsScriptClient } from "../client.js";
import { RegistryRow } from "../types.js";

export const DocFindInputSchema = z.object({
  query: z
    .string()
    .optional()
    .describe("Free-text search across document names and categories."),
  category: z
    .enum(["Legal", "Comercial", "Internos", "Governance", "__adhoc-blank", "__adopted"])
    .optional()
    .describe("Filter by document category."),
  status: z
    .enum(["draft", "review", "approved", "published", "archived"])
    .optional()
    .describe("Filter by lifecycle status."),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum number of results to return. Default is 20."),
});

export type DocFindInput = z.infer<typeof DocFindInputSchema>;

export interface DocFindResult {
  count: number;
  docs: Array<{
    doc_id: string;
    file_id: string;
    name: string;
    url: string | undefined;
    status: string;
    category: string;
    audience: string | undefined;
    created_by: string;
    created_at: string;
    last_edited_by: string | undefined;
    last_edited_at: string | undefined;
    locked_by: string | undefined;
  }>;
}

export async function docFind(
  input: DocFindInput,
  client: AppsScriptClient
): Promise<DocFindResult> {
  const body: Record<string, unknown> = {};
  if (input.query !== undefined) body["q"] = input.query;
  if (input.category !== undefined) body["category"] = input.category;
  if (input.status !== undefined) body["status"] = input.status;
  if (input.limit !== undefined) body["limit"] = input.limit;

  const raw = await client.post("searchDocs", body);
  const rows = raw as RegistryRow[];

  return {
    count: rows.length,
    docs: rows.map((r) => ({
      doc_id: r.doc_id,
      file_id: r.file_id,
      name: r.name,
      url: r.url,
      status: r.status,
      category: r.category,
      audience: r.audience,
      created_by: r.created_by,
      created_at: r.created_at,
      last_edited_by: r.last_edited_by,
      last_edited_at: r.last_edited_at,
      locked_by: r.locked_by || undefined,
    })),
  };
}
