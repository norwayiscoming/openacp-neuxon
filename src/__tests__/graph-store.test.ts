import { describe, it, expect, afterEach } from "vitest";
import { GraphStore } from "../graph-store.js";

describe("GraphStore", () => {
  let store: GraphStore;

  afterEach(() => {
    store?.destroy();
  });

  it("creates a session graph in memory and SQLite", async () => {
    store = await GraphStore.create();
    const graph = store.getOrCreate("s1", "agent-1");
    expect(graph.sessionId).toBe("s1");
    const fromDb = store.getFromDb("s1");
    expect(fromDb).not.toBeNull();
    expect(fromDb!.sessionId).toBe("s1");
  });

  it("adds nodes to both memory and SQLite", async () => {
    store = await GraphStore.create();
    store.getOrCreate("s1", "agent-1");
    store.addNode("s1", {
      id: "n1", label: "INIT", status: "done", layman: "Init",
      cause: "", expect: "", techDetails: null, activity: [],
      startedAt: "2026-04-01T00:00:00Z", completedAt: null, order: 0,
    });
    expect(store.get("s1")!.nodes).toHaveLength(1);
    const fromDb = store.getFromDb("s1");
    expect(fromDb!.nodes).toHaveLength(1);
  });

  it("loads historical session from SQLite when not in cache", async () => {
    store = await GraphStore.create();
    store.getOrCreate("s1", "agent-1");
    store.addNode("s1", {
      id: "n1", label: "INIT", status: "done", layman: "Init",
      cause: "", expect: "", techDetails: null, activity: [],
      startedAt: "2026-04-01T00:00:00Z", completedAt: null, order: 0,
    });
    store.evictFromCache("s1");
    const graph = store.get("s1");
    expect(graph).not.toBeNull();
    expect(graph!.nodes).toHaveLength(1);
  });

  it("lists all sessions including historical", async () => {
    store = await GraphStore.create();
    store.getOrCreate("s1", "agent-1");
    store.getOrCreate("s2", "agent-2");
    store.evictFromCache("s1");
    const all = store.list();
    expect(all.length).toBe(2);
  });
});
