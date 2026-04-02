import { describe, it, expect, afterEach } from "vitest";
import { GraphStore } from "../graph-store.js";
import { mkdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

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

  it("round-trips embedding through SQLite", async () => {
    store = await GraphStore.create();
    store.getOrCreate("s1", "agent-1");

    const embedding = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    store.addNode("s1", {
      id: "n1", label: "RESULT", status: "done", layman: "Answer",
      cause: "", expect: "", techDetails: null, activity: [],
      startedAt: "2026-04-01T00:00:00Z", completedAt: null, order: 0,
      embedding,
      fullAnswer: "Full answer text",
      tags: ["test"],
      taskType: "qa",
    });

    // Evict from cache so getFromDb is used
    store.evictFromCache("s1");
    const graph = store.get("s1")!;
    const node = graph.nodes.find((n) => n.id === "n1")!;

    expect(node.embedding).not.toBeNull();
    expect(node.embedding).toBeInstanceOf(Float32Array);
    expect(node.embedding!.length).toBe(4);
    expect(node.embedding![0]).toBeCloseTo(0.1);
    expect(node.embedding![1]).toBeCloseTo(0.2);
    expect(node.embedding![2]).toBeCloseTo(0.3);
    expect(node.embedding![3]).toBeCloseTo(0.4);
  });

  it("persists to a file when filePath is provided", async () => {
    const dir = join(import.meta.dirname, "..", "..", ".test-neuxon");
    const dbPath = join(dir, "test.db");
    try {
      mkdirSync(dir, { recursive: true });
      store = await GraphStore.create(dbPath);
      store.getOrCreate("s1", "agent-1");
      store.addNode("s1", {
        id: "n1", label: "INIT", status: "done", layman: "Init",
        cause: "", expect: "", techDetails: null, activity: [],
        startedAt: "2026-04-01T00:00:00Z", completedAt: null, order: 0,
      });
      store.saveToDisk(dbPath);
      expect(existsSync(dbPath)).toBe(true);

      // Destroy and reload from file
      store.destroy();
      store = await GraphStore.create(dbPath);
      const graph = store.get("s1");
      expect(graph).not.toBeNull();
      expect(graph!.nodes).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
