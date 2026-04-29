import { describe, it, expect } from "vitest";
import { DocUndoInputSchema } from "./doc-undo.js";

describe("DocUndoInputSchema — zod validation", () => {
  it("accepts valid event_id", () => {
    const result = DocUndoInputSchema.safeParse({ event_id: "evt_20260429_123456_abc123" });
    expect(result.success).toBe(true);
  });

  it("rejects empty event_id", () => {
    const result = DocUndoInputSchema.safeParse({ event_id: "" });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain("at least 1");
  });

  it("accepts valid batch_since (ISO 8601)", () => {
    const result = DocUndoInputSchema.safeParse({ batch_since: "2026-04-29T00:00:00Z" });
    expect(result.success).toBe(true);
  });

  it("rejects non-ISO batch_since", () => {
    const result = DocUndoInputSchema.safeParse({ batch_since: "yesterday" });
    expect(result.success).toBe(false);
  });

  it("rejects when both event_id and batch_since provided", () => {
    const result = DocUndoInputSchema.safeParse({
      event_id: "evt_20260429_123456_abc",
      batch_since: "2026-04-29T00:00:00Z",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain("exactly one");
  });

  it("rejects when neither event_id nor batch_since provided", () => {
    const result = DocUndoInputSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain("exactly one");
  });

  it("accepts batch undo with optional batch_until and batch_actor", () => {
    const result = DocUndoInputSchema.safeParse({
      batch_since: "2026-04-29T00:00:00Z",
      batch_until: "2026-04-29T12:00:00Z",
      batch_actor: "human:user@example.com",
    });
    expect(result.success).toBe(true);
  });
});
