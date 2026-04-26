/**
 * doc-create.ts — MCP tool: doc_create
 * Render a document from a template with provided token inputs.
 * On MISSING_INPUTS, returns the list of missing fields as a structured error
 * so the calling agent knows exactly what to ask the user.
 */

import { z } from "zod";
import { AppsScriptClient } from "../client.js";
import { DocHubError } from "../types.js";

export const DocCreateInputSchema = z.object({
  template_id: z
    .string()
    .min(1)
    .describe(
      "Kebab-case template ID from the manifest (e.g. 'nda-kuill-pilot'). Use find_templates to discover available IDs."
    ),
  inputs: z
    .record(z.string())
    .describe(
      "Key-value map of template tokens. Keys must match the required_inputs declared in the manifest. Example: {\"cliente\": \"Acme Corp\", \"fecha\": \"2026-01-15\"}."
    ),
  created_by: z
    .string()
    .optional()
    .describe(
      "Identifier of the creator. Format: 'human:<email>' or 'agent:<id>'. Defaults to the configured agent identity."
    ),
});

export type DocCreateInput = z.infer<typeof DocCreateInputSchema>;

export interface DocCreateSuccess {
  ok: true;
  doc_id: string;
  file_id: string;
  name: string;
  url: string;
  category: string;
  template_id: string;
  template_version: string | undefined;
  created_by: string;
  created_at: string;
}

export interface DocCreateMissingInputs {
  ok: false;
  code: "MISSING_INPUTS";
  message: string;
  missing_fields: string[];
  template_id: string;
}

export type DocCreateResult = DocCreateSuccess | DocCreateMissingInputs;

export async function docCreate(
  input: DocCreateInput,
  client: AppsScriptClient,
  defaultCreatedBy: string
): Promise<DocCreateResult> {
  let raw: unknown;
  try {
    raw = await client.post("renderTemplate", {
      id: input.template_id,
      inputs: input.inputs,
      createdBy: input.created_by ?? defaultCreatedBy,
    });
  } catch (err) {
    const e = err as DocHubError;
    if (e.code === "MISSING_INPUTS") {
      const details = e.details as { missing?: string[] } | undefined;
      return {
        ok: false,
        code: "MISSING_INPUTS",
        message: e.message,
        missing_fields: details?.missing ?? [],
        template_id: input.template_id,
      };
    }
    throw err;
  }

  const data = raw as Record<string, unknown>;
  return {
    ok: true,
    doc_id: String(data["doc_id"] ?? data["docId"] ?? ""),
    file_id: String(data["file_id"] ?? data["fileId"] ?? ""),
    name: String(data["name"] ?? ""),
    url: String(data["url"] ?? ""),
    category: String(data["category"] ?? ""),
    template_id: input.template_id,
    template_version: data["template_version"] != null ? String(data["template_version"]) : undefined,
    created_by: String(data["created_by"] ?? data["createdBy"] ?? input.created_by ?? defaultCreatedBy),
    created_at: String(data["created_at"] ?? data["createdAt"] ?? new Date().toISOString()),
  };
}
