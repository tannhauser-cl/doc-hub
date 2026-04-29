import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeClient } from "./client.js";
import { DocHubError } from "./types.js";

const BASE_CONFIG = {
  webAppUrl: "https://script.google.com/test/exec",
  apiToken: "test-token",
  tenantId: "test",
};

function mockFetch(...responses: Array<{ status: number; body: unknown }>) {
  let call = 0;
  return vi.fn(async () => {
    const r = responses[Math.min(call++, responses.length - 1)];
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      statusText: String(r.status),
      text: async () => JSON.stringify(r.body),
    } as Response;
  });
}

describe("makeClient — POST", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns data on first successful response", async () => {
    vi.stubGlobal("fetch", mockFetch({ status: 200, body: { ok: true, data: { docId: "abc" } } }));
    const client = makeClient(BASE_CONFIG);
    const result = await client.post("renderTemplate", { id: "nda" });
    expect(result).toEqual({ docId: "abc" });
  });

  it("retries on 503 and succeeds on third attempt", async () => {
    const fetchMock = mockFetch(
      { status: 503, body: { ok: false, error: "service unavailable" } },
      { status: 503, body: { ok: false, error: "service unavailable" } },
      { status: 200, body: { ok: true, data: { docId: "xyz" } } }
    );
    vi.stubGlobal("fetch", fetchMock);
    // Patch sleep to resolve immediately so the test doesn't wait 2s+
    vi.stubGlobal("setTimeout", (fn: () => void) => { fn(); return 0; });

    const client = makeClient(BASE_CONFIG);
    const result = await client.post("renderTemplate", { id: "nda" });
    expect(result).toEqual({ docId: "xyz" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("throws DocHubError (instanceof Error) when engine returns ok:false", async () => {
    vi.stubGlobal("fetch", mockFetch({
      status: 200,
      body: { ok: false, error: { code: "NOT_FOUND", message: "doc not found" } },
    }));
    const client = makeClient(BASE_CONFIG);
    let thrown: unknown;
    try {
      await client.post("readDoc", { fileId: "bad" });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).toBeInstanceOf(DocHubError);
    expect((thrown as DocHubError).code).toBe("NOT_FOUND");
    expect((thrown as DocHubError).message).toBe("doc not found");
  });

  it("includes token in POST body", async () => {
    const fetchMock = mockFetch({ status: 200, body: { ok: true, data: null } });
    vi.stubGlobal("fetch", fetchMock);
    const client = makeClient(BASE_CONFIG);
    await client.post("archiveDoc", { fileId: "f1", archivedBy: "user" });

    const callArgs = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(callArgs[1].body as string);
    expect(body.token).toBe("test-token");
    expect(body.action).toBe("archiveDoc");
  });
});

describe("makeClient — GET", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("appends action as query param", async () => {
    const fetchMock = mockFetch({ status: 200, body: { ok: true, templates: [] } });
    vi.stubGlobal("fetch", fetchMock);
    const client = makeClient(BASE_CONFIG);
    await client.get("listTemplates", { category: "Legal" });

    const url = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[0];
    expect(url).toContain("action=listTemplates");
    expect(url).toContain("category=Legal");
  });
});
