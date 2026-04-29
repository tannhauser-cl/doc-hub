import { describe, it, expect, vi, afterEach } from "vitest";
import { DocFindInputSchema, docFind } from "./doc-find.js";
import { makeClient } from "../client.js";

describe("DocFindInputSchema — zod validation", () => {
  it("accepts empty input (all optional)", () => {
    expect(DocFindInputSchema.safeParse({}).success).toBe(true);
  });

  it("accepts valid category enum", () => {
    expect(DocFindInputSchema.safeParse({ category: "Legal" }).success).toBe(true);
    expect(DocFindInputSchema.safeParse({ category: "Governance" }).success).toBe(true);
  });

  it("rejects invalid category", () => {
    const result = DocFindInputSchema.safeParse({ category: "INVALID" });
    expect(result.success).toBe(false);
  });

  it("accepts valid status enum", () => {
    expect(DocFindInputSchema.safeParse({ status: "draft" }).success).toBe(true);
    expect(DocFindInputSchema.safeParse({ status: "archived" }).success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = DocFindInputSchema.safeParse({ status: "deleted" });
    expect(result.success).toBe(false);
  });
});

describe("docFind — result mapping", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("maps raw registry rows to DocFindResult shape", async () => {
    const mockRow = {
      doc_id: "doc-1",
      file_id: "file-1",
      name: "Test Doc",
      url: "https://docs.google.com/d/file-1",
      status: "draft",
      category: "Legal",
      audience: "internal",
      created_by: "user@example.com",
      created_at: "2026-04-01T00:00:00Z",
      last_edited_by: "user@example.com",
      last_edited_at: "2026-04-01T00:00:00Z",
      locked_by: "",
    };

    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, data: [mockRow] }),
    })));

    const client = makeClient({ webAppUrl: "https://example.com/exec", apiToken: "t", tenantId: "test" });
    const result = await docFind({}, client);

    expect(result.count).toBe(1);
    expect(result.docs[0].doc_id).toBe("doc-1");
    expect(result.docs[0].name).toBe("Test Doc");
    expect(result.docs[0].locked_by).toBeUndefined();
  });
});
