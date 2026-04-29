import { describe, it, expect, vi, afterEach } from "vitest";
import { DocCreateInputSchema, docCreate } from "./doc-create.js";
import { DocHubError } from "../types.js";
import { makeClient } from "../client.js";

const CONFIG = { webAppUrl: "https://example.com/exec", apiToken: "t", tenantId: "test" };

describe("DocCreateInputSchema — zod validation", () => {
  it("rejects empty template_id", () => {
    const result = DocCreateInputSchema.safeParse({ template_id: "", inputs: {} });
    expect(result.success).toBe(false);
  });

  it("accepts valid template_id and inputs", () => {
    const result = DocCreateInputSchema.safeParse({
      template_id: "nda-kuill-pilot",
      inputs: { cliente: "Acme" },
    });
    expect(result.success).toBe(true);
  });
});

describe("docCreate — MISSING_INPUTS handling", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("returns structured MISSING_INPUTS result when engine raises MISSING_INPUTS", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        ok: false,
        error: { code: "MISSING_INPUTS", message: "Missing: firmante", missing: ["firmante"] },
      }),
    })));

    const client = makeClient(CONFIG);
    const result = await docCreate(
      { template_id: "nda-kuill-pilot", inputs: { cliente: "Acme" } },
      client,
      "agent:test"
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("MISSING_INPUTS");
      expect(result.missing_fields).toContain("firmante");
      expect(result.template_id).toBe("nda-kuill-pilot");
    }
  });

  it("returns success result on happy path", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        ok: true,
        data: {
          docId: "doc-123",
          fileId: "file-456",
          name: "NDA-Acme-2026-05",
          url: "https://docs.google.com/d/file-456",
        },
      }),
    })));

    const client = makeClient(CONFIG);
    const result = await docCreate(
      { template_id: "nda-kuill-pilot", inputs: { cliente: "Acme", firmante: "Juan" } },
      client,
      "agent:test"
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.name).toBe("NDA-Acme-2026-05");
      expect(result.template_id).toBe("nda-kuill-pilot");
    }
  });

  it("re-throws non-MISSING_INPUTS errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        ok: false,
        error: { code: "TEMPLATE_NOT_FOUND", message: "Template not found" },
      }),
    })));

    const client = makeClient(CONFIG);
    await expect(
      docCreate({ template_id: "nonexistent", inputs: {} }, client, "agent:test")
    ).rejects.toMatchObject({ code: "TEMPLATE_NOT_FOUND" });
  });
});

describe("DocHubError — instanceof chain", () => {
  it("DocHubError is instanceof Error and instanceof DocHubError", () => {
    const err = new DocHubError("TEST", "test message", { extra: true });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DocHubError);
    expect(err.code).toBe("TEST");
    expect(err.message).toBe("test message");
    expect(err.details).toEqual({ extra: true });
    expect(err.stack).toBeDefined();
  });
});
