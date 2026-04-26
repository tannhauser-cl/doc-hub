/**
 * server.ts — doc-hub MCP Server entry point.
 *
 * Wraps the Google Apps Script Web App engine as MCP tools.
 * Transport: stdio (for use with Claude Code, Hermes, and other MCP clients).
 *
 * Tools exposed:
 *   doc_find, doc_read, doc_create, doc_create_blank, doc_edit,
 *   doc_snapshot, doc_supersede, doc_archive, doc_adopt, doc_undo,
 *   brand_check, find_templates, doc_context
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { getConfig, agentId } from "./config.js";
import { makeClient } from "./client.js";
import { DocHubError } from "./types.js";

import { DocFindInputSchema, docFind } from "./tools/doc-find.js";
import { DocReadInputSchema, docRead } from "./tools/doc-read.js";
import { DocCreateInputSchema, docCreate } from "./tools/doc-create.js";
import { DocCreateBlankInputSchema, docCreateBlank } from "./tools/doc-create-blank.js";
import { DocEditInputSchema, docEdit } from "./tools/doc-edit.js";
import { DocSnapshotInputSchema, docSnapshot } from "./tools/doc-snapshot.js";
import { DocSupersedeInputSchema, docSupersede } from "./tools/doc-supersede.js";
import { DocArchiveInputSchema, docArchive } from "./tools/doc-archive.js";
import { DocAdoptInputSchema, docAdopt } from "./tools/doc-adopt.js";
import { DocUndoInputSchema, docUndo } from "./tools/doc-undo.js";
import { BrandCheckInputSchema, brandCheck } from "./tools/brand-check.js";
import { FindTemplatesInputSchema, findTemplates } from "./tools/find-templates.js";
import { DocContextInputSchema, docContext } from "./tools/doc-context.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  // Inline minimal Zod-to-JSON-Schema conversion for MCP tool registration.
  // Handles the subset of Zod types used by the tool input schemas.
  return zodToJsonSchemaInner(schema);
}

function zodToJsonSchemaInner(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchemaInner(value as z.ZodTypeAny);
      if (!(value instanceof z.ZodOptional) && !(value instanceof z.ZodDefault)) {
        required.push(key);
      }
    }

    const result: Record<string, unknown> = { type: "object", properties };
    if (required.length > 0) result["required"] = required;
    const desc = schema.description;
    if (desc) result["description"] = desc;
    return result;
  }

  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchemaInner(schema.unwrap() as z.ZodTypeAny);
  }

  if (schema instanceof z.ZodDefault) {
    const inner = zodToJsonSchemaInner(schema._def.innerType as z.ZodTypeAny);
    inner["default"] = schema._def.defaultValue();
    return inner;
  }

  if (schema instanceof z.ZodString) {
    const result: Record<string, unknown> = { type: "string" };
    if (schema.description) result["description"] = schema.description;
    return result;
  }

  if (schema instanceof z.ZodNumber) {
    const result: Record<string, unknown> = { type: "number" };
    if (schema.description) result["description"] = schema.description;
    return result;
  }

  if (schema instanceof z.ZodBoolean) {
    const result: Record<string, unknown> = { type: "boolean" };
    if (schema.description) result["description"] = schema.description;
    return result;
  }

  if (schema instanceof z.ZodEnum) {
    const result: Record<string, unknown> = {
      type: "string",
      enum: schema.options,
    };
    if (schema.description) result["description"] = schema.description;
    return result;
  }

  if (schema instanceof z.ZodArray) {
    const result: Record<string, unknown> = {
      type: "array",
      items: zodToJsonSchemaInner(schema.element as z.ZodTypeAny),
    };
    if (schema.description) result["description"] = schema.description;
    return result;
  }

  if (schema instanceof z.ZodRecord) {
    const result: Record<string, unknown> = {
      type: "object",
      additionalProperties: zodToJsonSchemaInner(schema.valueType as z.ZodTypeAny),
    };
    if (schema.description) result["description"] = schema.description;
    return result;
  }

  if (schema instanceof z.ZodEffects) {
    // .refine() etc — recurse into the inner schema
    return zodToJsonSchemaInner(schema.innerType() as z.ZodTypeAny);
  }

  // Fallback
  return { type: "string" };
}

function toText(result: unknown): string {
  return JSON.stringify(result, null, 2);
}

function errorResponse(err: unknown): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  const docHubErr = err as Partial<DocHubError>;
  const payload =
    docHubErr.code != null
      ? { error: docHubErr.message, code: docHubErr.code, details: docHubErr.details }
      : { error: err instanceof Error ? err.message : String(err) };

  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

interface ToolDef {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
}

const TOOLS: ToolDef[] = [
  {
    name: "doc_find",
    description: `Search for documents in the doc-hub registry.

Use this tool when the user wants to find, list, or browse existing documents. Supports filtering by free-text query, category (Legal, Comercial, Internos, Governance), and status (draft, review, approved, published, archived).

Examples:
- "find all legal documents" → {category: "Legal"}
- "show approved NDAs" → {query: "NDA", status: "approved"}
- "list recent internal docs" → {category: "Internos", limit: 10}

Returns: list of documents with name, URL, status, category, creator, and dates.`,
    inputSchema: DocFindInputSchema,
  },
  {
    name: "doc_read",
    description: `Read the full content and metadata of a document by its Google Drive file ID.

Use this tool when you need the actual text content of a document, or its detailed registry metadata (status, audience, lock state, brand check status).

Requires: file_id (Google Drive file ID). Get file IDs from doc_find results.

Returns: document text content + metadata (status, category, audience, lock info, brand check status, URL).`,
    inputSchema: DocReadInputSchema,
  },
  {
    name: "doc_create",
    description: `Create a new document by rendering a manifest template with provided inputs.

Use this tool when the user wants to generate a document from a known template (e.g. NDA, proposal, onboarding guide). Always call find_templates or doc_context FIRST to discover the right template ID and its required inputs.

On MISSING_INPUTS error, the tool returns a structured list of missing field names so you can ask the user to provide them before retrying.

Examples:
- Create an NDA: {template_id: "nda-kuill-pilot", inputs: {cliente: "Acme Corp", fecha: "2026-01-15", scope: "SaaS evaluation"}}

Returns on success: doc_id, file_id, name, URL, category.
Returns on MISSING_INPUTS: {ok: false, code: "MISSING_INPUTS", missing_fields: ["campo1", "campo2"]}`,
    inputSchema: DocCreateInputSchema,
  },
  {
    name: "doc_create_blank",
    description: `Create a blank (empty) Google Workspace document without using a template.

Use this tool when:
- No suitable template exists in the manifest
- The user explicitly wants a blank document to fill manually
- doc_type is "presentation" or "spreadsheet" and no template covers it

Requires: category, title (kebab-case), audience (internal|external).
Optional: doc_type (document|presentation|spreadsheet, default: document).

Returns: doc_id, file_id, name, URL.`,
    inputSchema: DocCreateBlankInputSchema,
  },
  {
    name: "doc_edit",
    description: `Edit a document by applying structured operations (replace, append, prepend).

Use this tool to modify the content of an existing document. The tool automatically:
1. Acquires a soft lock on the document (5-minute TTL)
2. Applies the edit operations in order
3. Releases the lock

If the document is already locked by someone else, returns a LOCKED error with who holds the lock and when it expires — do NOT retry immediately, inform the user.

Each op has: type (replace|append|prepend), optional section (heading/anchor to target), and content (new text).

Example: Edit the "Scope" section of a document:
{file_id: "1abc...", ops: [{type: "replace", section: "Scope", content: "New scope text here."}]}

Returns: file_id, name, URL, edited_by, edited_at, ops_applied count.
On LOCKED: {ok: false, code: "LOCKED", locked_by: "human:user@example.com", locked_until: "..."}`,
    inputSchema: DocEditInputSchema,
  },
  {
    name: "doc_snapshot",
    description: `Create an immutable PDF snapshot of a document at its current state.

Use this tool to preserve a point-in-time copy before making significant changes, before archiving, or when the user wants to share a frozen version. Snapshots are stored in the document's Snapshots/ subfolder and recorded in the registry.

Returns: snapshot_url (PDF), snapshot_name, hash (for integrity verification), created_at.`,
    inputSchema: DocSnapshotInputSchema,
  },
  {
    name: "doc_supersede",
    description: `Mark a document as superseded — replaced by a newer version.

Use this tool when a document has been fundamentally replaced by a new one (major version replacement, not just an edit). The old document is archived and the supersession relationship is recorded in the registry for auditability.

This is different from doc_archive: supersede implies a successor exists; archive implies end-of-life.

Returns: file_id, status (archived), superseded_by_doc_id, updated_at.`,
    inputSchema: DocSupersedeInputSchema,
  },
  {
    name: "doc_archive",
    description: `Archive a document — move it to the Archive folder and set its status to 'archived'.

Use this tool when a document is no longer active but should be kept for reference. Archived documents are excluded from default doc_find results.

Use doc_supersede instead if the document has been replaced by a successor.

Returns: file_id, status (archived), archived_by, archived_at.`,
    inputSchema: DocArchiveInputSchema,
  },
  {
    name: "doc_adopt",
    description: `Adopt an unmanaged file from the _Imports/ folder into the doc-hub registry.

Use this tool when the user uploads an external file (e.g. a contract received from a third party, a legacy document) and wants it tracked by doc-hub. Adoption assigns a canonical name, category, and audience classification.

Requires: file_id (the Drive file ID in _Imports/), category, name (kebab-case canonical name), audience (internal|external).

Returns: doc_id, file_id, canonical name, URL, category, audience.`,
    inputSchema: DocAdoptInputSchema,
  },
  {
    name: "doc_undo",
    description: `Undo one or more audit events from the doc-hub audit trail.

Use this tool to reverse a recent action. Two modes:
- Single undo: provide event_id to undo one specific operation
- Batch undo: provide batch_since (ISO timestamp) to undo all events in a time range, optionally filtered by batch_actor

Always confirm with the user before undoing, especially batch undos.

Examples:
- Undo single event: {event_id: "evt_abc123"}
- Undo all my actions in last hour: {batch_since: "2026-01-15T14:00:00Z", batch_actor: "agent:default:claude-code"}

Returns: mode, events_undone count, event_ids reversed, summary message.`,
    inputSchema: DocUndoInputSchema,
  },
  {
    name: "brand_check",
    description: `Check a document for brand compliance violations.

Use this tool to verify that a document follows the organization's brand guidelines (colors, fonts, logo usage, spacing, tone). Returns a list of violations with type, location, expected vs. found values, and severity.

Use this before publishing or sharing documents externally (audience: "external").

Returns: status (ok|violations), violation_count, violations list with type/location/severity.`,
    inputSchema: BrandCheckInputSchema,
  },
  {
    name: "find_templates",
    description: `List available document templates from the manifest catalog.

Use this tool to discover which templates are available before calling doc_create. When intent is provided, templates are ranked by keyword relevance so you can suggest the best fit.

Examples:
- List all templates: {}
- Find NDA templates: {intent: "non-disclosure agreement"}
- Find legal templates for pilots: {category: "Legal", intent: "pilot customer agreement"}

Returns for each template: id, name, description, required_inputs (what you must collect from user), suggested_sources, doc_type, version, relevance_score, relevance_reason.

Feed the required_inputs list to the user so they can provide the necessary information before calling doc_create.`,
    inputSchema: FindTemplatesInputSchema,
  },
  {
    name: "doc_context",
    description: `Research helper — assembles a context pack before creating a document.

ALWAYS call this tool FIRST when the user asks to create a document and you don't know which template to use or whether a similar document already exists. It:
1. Finds relevant templates matching the intent (ranked by relevance)
2. Searches existing docs to surface potential duplicates or reusable content
3. Returns a combined context pack with a search tip and template recommendation

Example: User says "create an NDA for Acme Corp":
→ Call doc_context({intent: "NDA for Acme Corp", category: "Legal"})
→ Review relevant_templates to find the right template ID
→ Review existing_docs to avoid duplicates
→ Then call doc_create with the template_id and required inputs

Returns: relevant_templates (top 5), existing_docs, search_tip, template_recommendation.`,
    inputSchema: DocContextInputSchema,
  },
];

// ---------------------------------------------------------------------------
// Server bootstrap
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const config = getConfig();
  const client = makeClient(config);
  const defaultActor = agentId("mcp-server", config);

  const server = new Server(
    { name: "doc-hub", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.inputSchema),
    })),
  }));

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "doc_find": {
          const input = DocFindInputSchema.parse(args);
          const result = await docFind(input, client);
          return { content: [{ type: "text", text: toText(result) }] };
        }

        case "doc_read": {
          const input = DocReadInputSchema.parse(args);
          const result = await docRead(input, client);
          return { content: [{ type: "text", text: toText(result) }] };
        }

        case "doc_create": {
          const input = DocCreateInputSchema.parse(args);
          const result = await docCreate(input, client, defaultActor);
          return { content: [{ type: "text", text: toText(result) }] };
        }

        case "doc_create_blank": {
          const input = DocCreateBlankInputSchema.parse(args);
          const result = await docCreateBlank(input, client, defaultActor);
          return { content: [{ type: "text", text: toText(result) }] };
        }

        case "doc_edit": {
          const input = DocEditInputSchema.parse(args);
          const result = await docEdit(input, client, defaultActor);
          return { content: [{ type: "text", text: toText(result) }] };
        }

        case "doc_snapshot": {
          const input = DocSnapshotInputSchema.parse(args);
          const result = await docSnapshot(input, client, defaultActor);
          return { content: [{ type: "text", text: toText(result) }] };
        }

        case "doc_supersede": {
          const input = DocSupersedeInputSchema.parse(args);
          const result = await docSupersede(input, client, defaultActor);
          return { content: [{ type: "text", text: toText(result) }] };
        }

        case "doc_archive": {
          const input = DocArchiveInputSchema.parse(args);
          const result = await docArchive(input, client, defaultActor);
          return { content: [{ type: "text", text: toText(result) }] };
        }

        case "doc_adopt": {
          const input = DocAdoptInputSchema.parse(args);
          const result = await docAdopt(input, client, defaultActor);
          return { content: [{ type: "text", text: toText(result) }] };
        }

        case "doc_undo": {
          const input = DocUndoInputSchema.parse(args);
          const result = await docUndo(input, client);
          return { content: [{ type: "text", text: toText(result) }] };
        }

        case "brand_check": {
          const input = BrandCheckInputSchema.parse(args);
          const result = await brandCheck(input, client);
          return { content: [{ type: "text", text: toText(result) }] };
        }

        case "find_templates": {
          const input = FindTemplatesInputSchema.parse(args);
          const result = await findTemplates(input, client);
          return { content: [{ type: "text", text: toText(result) }] };
        }

        case "doc_context": {
          const input = DocContextInputSchema.parse(args);
          const result = await docContext(input, client);
          return { content: [{ type: "text", text: toText(result) }] };
        }

        default:
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ error: `Unknown tool: ${name}`, code: "UNKNOWN_TOOL" }),
              },
            ],
            isError: true,
          };
      }
    } catch (err) {
      // Zod validation errors
      if (err instanceof z.ZodError) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: "Invalid tool input",
                  code: "VALIDATION_ERROR",
                  details: err.errors,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
      return errorResponse(err);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`doc-hub MCP server fatal error: ${String(err)}\n`);
  process.exit(1);
});
