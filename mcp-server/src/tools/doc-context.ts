/**
 * doc-context.ts — MCP tool: doc_context
 * Research helper that assembles a context pack before document creation.
 * 1. Finds relevant templates matching the intent
 * 2. Searches for existing documents related to the intent
 * Returns a combined pack that agents use to avoid creating duplicates
 * and to select the right template.
 */

import { z } from "zod";
import { AppsScriptClient } from "../client.js";
import { findTemplates, TemplateEntry } from "./find-templates.js";
import { RegistryRow } from "../types.js";

export const DocContextInputSchema = z.object({
  intent: z
    .string()
    .min(1)
    .describe(
      "Description of what you want to create or find (e.g. 'NDA for Acme Corp pilot', 'onboarding guide for new engineers'). Used to search templates and existing docs."
    ),
  category: z
    .enum(["Legal", "Comercial", "Internos", "Governance"])
    .optional()
    .describe("Optionally restrict search to a specific category."),
});

export type DocContextInput = z.infer<typeof DocContextInputSchema>;

export interface ExistingDocSummary {
  doc_id: string;
  file_id: string;
  name: string;
  url: string | undefined;
  status: string;
  category: string;
  created_at: string;
}

export interface DocContextResult {
  relevant_templates: TemplateEntry[];
  existing_docs: ExistingDocSummary[];
  search_tip: string;
  template_recommendation: string | undefined;
}

export async function docContext(
  input: DocContextInput,
  client: AppsScriptClient
): Promise<DocContextResult> {
  // Run template search and doc search in parallel
  const [templateResult, rawDocs] = await Promise.all([
    findTemplates({ intent: input.intent, category: input.category }, client),
    client
      .post("searchDocs", {
        q: input.intent,
        ...(input.category ? { category: input.category } : {}),
        limit: 10,
      })
      .catch(() => [] as unknown[]),
  ]);

  const docs = rawDocs as RegistryRow[];

  const existingDocs: ExistingDocSummary[] = docs
    .filter((d) => d.status !== "archived")
    .map((d) => ({
      doc_id: d.doc_id,
      file_id: d.file_id,
      name: d.name,
      url: d.url,
      status: d.status,
      category: d.category,
      created_at: d.created_at,
    }));

  // Top template recommendation (highest relevance score or first in list)
  const topTemplate = templateResult.templates[0];
  const templateRecommendation =
    topTemplate != null
      ? `Best template match: "${topTemplate.name}" (id: ${topTemplate.id}). ${topTemplate.relevance_reason ?? ""} Required inputs: ${topTemplate.required_inputs.join(", ") || "none"}.`
      : undefined;

  const searchTip =
    existingDocs.length > 0
      ? `Before creating a new document, review these ${existingDocs.length} existing doc(s) for reusable content. Avoid creating duplicates.`
      : "No closely related documents found. You can proceed with doc_create or doc_create_blank.";

  return {
    relevant_templates: templateResult.templates.slice(0, 5),
    existing_docs: existingDocs,
    search_tip: searchTip,
    template_recommendation: templateRecommendation,
  };
}
