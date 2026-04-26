/**
 * doc-read.ts — MCP tool: doc_read
 * Read the full content and metadata of a document by its Drive file ID.
 */

import { z } from "zod";
import { AppsScriptClient } from "../client.js";

export const DocReadInputSchema = z.object({
  file_id: z
    .string()
    .min(1)
    .describe("Google Drive file ID of the document to read."),
});

export type DocReadInput = z.infer<typeof DocReadInputSchema>;

export interface DocReadResult {
  file_id: string;
  name: string;
  url: string | undefined;
  status: string | undefined;
  category: string | undefined;
  audience: string | undefined;
  created_by: string | undefined;
  created_at: string | undefined;
  last_edited_by: string | undefined;
  last_edited_at: string | undefined;
  locked_by: string | undefined;
  locked_until: string | undefined;
  brand_check_status: string | undefined;
  content: string;
  mime_type: string | undefined;
}

export async function docRead(
  input: DocReadInput,
  client: AppsScriptClient
): Promise<DocReadResult> {
  const raw = await client.post("readDoc", { fileId: input.file_id });
  const data = raw as Record<string, unknown>;

  return {
    file_id: String(data["fileId"] ?? input.file_id),
    name: String(data["name"] ?? ""),
    url: data["url"] != null ? String(data["url"]) : undefined,
    status: data["status"] != null ? String(data["status"]) : undefined,
    category: data["category"] != null ? String(data["category"]) : undefined,
    audience: data["audience"] != null ? String(data["audience"]) : undefined,
    created_by: data["created_by"] != null ? String(data["created_by"]) : undefined,
    created_at: data["created_at"] != null ? String(data["created_at"]) : undefined,
    last_edited_by: data["last_edited_by"] != null ? String(data["last_edited_by"]) : undefined,
    last_edited_at: data["last_edited_at"] != null ? String(data["last_edited_at"]) : undefined,
    locked_by: data["locked_by"] != null && data["locked_by"] !== "" ? String(data["locked_by"]) : undefined,
    locked_until: data["locked_until"] != null ? String(data["locked_until"]) : undefined,
    brand_check_status: data["brand_check_status"] != null ? String(data["brand_check_status"]) : undefined,
    content: String(data["content"] ?? ""),
    mime_type: data["mimeType"] != null ? String(data["mimeType"]) : undefined,
  };
}
