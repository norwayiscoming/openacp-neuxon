import { describe, it, expect, beforeEach } from "vitest";
import { createNeuxonApp } from "../server.js";
import { SessionGraphStore } from "../session-graph-store.js";

describe("Neuxon HTTP Server", () => {
  let store: SessionGraphStore;
  let app: ReturnType<typeof createNeuxonApp>;

  beforeEach(() => {
    store = new SessionGraphStore();
    app = createNeuxonApp(store);
  });

  it("GET /health returns ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("GET /api/sessions returns empty list", async () => {
    const res = await app.request("/api/sessions");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toEqual([]);
  });

  it("GET /api/sessions returns existing graphs", async () => {
    store.getOrCreate("sess-1", "claude");
    const res = await app.request("/api/sessions");
    const body = await res.json();
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].sessionId).toBe("sess-1");
  });

  it("GET /api/graph/:sessionId returns graph", async () => {
    store.getOrCreate("sess-1", "claude");
    const res = await app.request("/api/graph/sess-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionId).toBe("sess-1");
  });

  it("GET /api/graph/:sessionId returns 404 for unknown", async () => {
    const res = await app.request("/api/graph/unknown");
    expect(res.status).toBe(404);
  });

  it("GET / returns HTML dashboard", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("NEUXON");
    expect(text).toContain("<canvas");
  });
});
