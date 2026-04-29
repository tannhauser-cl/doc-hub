/**
 * find-templates.ts — MCP tool: find_templates
 * List available document templates, optionally filtered by category and intent.
 * When intent is provided, ranks templates by keyword relevance so the agent
 * can suggest the best fit to the user.
 */

import { z } from "zod";
import { AppsScriptClient } from "../client.js";
import { ManifestRow } from "../types.js";

export const FindTemplatesInputSchema = z.object({
  category: z
    .enum(["Legal", "Comercial", "Internos", "Governance"])
    .optional()
    .describe("Filter by document category."),
  intent: z
    .string()
    .optional()
    .describe(
      "Natural language description of what you want to create (e.g. 'non-disclosure agreement for a pilot customer'). When provided, templates are ranked by relevance."
    ),
});

export type FindTemplatesInput = z.infer<typeof FindTemplatesInputSchema>;

export interface TemplateEntry {
  id: string;
  category: string;
  name: string;
  description: string;
  required_inputs: string[];
  suggested_sources: string[];
  doc_type: string;
  version: string;
  relevance_score?: number;
  relevance_reason?: string;
}

export interface FindTemplatesResult {
  count: number;
  templates: TemplateEntry[];
}

/**
 * Simple keyword relevance score: counts how many words from the intent
 * appear in the template name + description (case-insensitive).
 */
function scoreTemplate(template: ManifestRow, intentWords: string[]): number {
  const haystack = `${template.name} ${template.description}`.toLowerCase();
  return intentWords.filter((w) => haystack.includes(w)).length;
}

function buildRelevanceReason(template: ManifestRow, intentWords: string[]): string {
  const matches = intentWords.filter((w) =>
    `${template.name} ${template.description}`.toLowerCase().includes(w)
  );
  if (matches.length === 0) return "No direct keyword match, but may still be relevant.";
  return `Matches intent keywords: ${matches.map((w) => `"${w}"`).join(", ")}.`;
}

function parseJsonArrayField(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // fallback: comma-separated
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export async function findTemplates(
  input: FindTemplatesInput,
  client: AppsScriptClient
): Promise<FindTemplatesResult> {
  const params: Record<string, string> = {};
  if (input.category) params["category"] = input.category;

  const raw = await client.get("listTemplates", params);
  const rows = raw as ManifestRow[];

  const intentWords: string[] = input.intent
    ? input.intent
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2)
    : [];

  let templates: TemplateEntry[] = rows.map((t) => {
    const entry: TemplateEntry = {
      id: t.id,
      category: t.category,
      name: t.name,
      description: t.description,
      required_inputs: parseJsonArrayField(t.required_inputs),
      suggested_sources: parseJsonArrayField(t.suggested_sources),
      doc_type: t.doc_type ?? "document",
      version: t.version,
    };

    if (intentWords.length > 0) {
      entry.relevance_score = scoreTemplate(t, intentWords);
      entry.relevance_reason = buildRelevanceReason(t, intentWords);
    }

    return entry;
  });

  // If intent provided, sort by relevance descending
  if (intentWords.length > 0) {
    templates = templates.sort(
      (a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0)
    );
  }

  return { count: templates.length, templates };
}
