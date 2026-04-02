import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createNeuxonApp } from "../server.js";
import { GraphStore } from "../graph-store.js";

describe("Neuxon HTTP Server", () => {
  let store: GraphStore;
  let app: ReturnType<typeof createNeuxonApp>;

  beforeEach(async () => {
    store = await GraphStore.create();
    app = createNeuxonApp(store);
  });

  afterEach(() => {
    store?.destroy();
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

  it("GET /api/graph/:sessionId returns nodes with x, y, z coordinates", async () => {
    store.getOrCreate("sess-1", "claude");
    store.addNode("sess-1", {
      id: "n1", label: "INIT", status: "done", layman: "Init",
      cause: "", expect: "", techDetails: null, activity: [],
      startedAt: "2026-04-01T00:00:00Z", completedAt: null, order: 0,
    });
    store.addNode("sess-1", {
      id: "n2", label: "Analyze", status: "done", layman: "Analyzing",
      cause: "", expect: "", techDetails: null, activity: [],
      startedAt: "2026-04-01T00:00:01Z", completedAt: null, order: 1,
    });
    store.addEdge("sess-1", {
      id: "e1", from: "n1", to: "n2", label: "leads to", type: "normal",
    });
    const res = await app.request("/api/graph/sess-1");
    const body = await res.json();
    expect(body.nodes[0]).toHaveProperty("x");
    expect(body.nodes[0]).toHaveProperty("y");
    expect(body.nodes[0]).toHaveProperty("z");
    expect(body.nodes[0].x).toBe(0);
    expect(body.nodes[0].y).toBe(0);
    expect(body.nodes[0].z).toBe(0);
    const n2 = body.nodes[1];
    const dist = Math.sqrt(n2.x * n2.x + n2.z * n2.z);
    expect(dist).toBeGreaterThan(0);
  });

  it("GET / returns HTML dashboard", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("NEUXON");
    expect(text).toContain("three");
  });
});
