import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GraphStore } from "../graph-store.js";
import type { GraphNode, GraphEdge } from "../types.js";

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: "n1",
    label: "TEST",
    status: "active",
    layman: "test node",
    cause: "test cause",
    expect: "test expect",
    techDetails: null,
    activity: [],
    startedAt: new Date().toISOString(),
    completedAt: null,
    order: 0,
    ...overrides,
  };
}

function makeEdge(overrides: Partial<GraphEdge> = {}): GraphEdge {
  return {
    id: "e1",
    from: "n1",
    to: "n2",
    label: "leads to",
    type: "normal",
    ...overrides,
  };
}

describe("GraphStore (replaces SessionGraphStore)", () => {
  let store: GraphStore;

  beforeEach(async () => {
    store = await GraphStore.create();
  });

  afterEach(() => {
    store?.destroy();
  });

  it("creates a new graph with getOrCreate", () => {
    const graph = store.getOrCreate("sess-1", "claude-code");
    expect(graph.sessionId).toBe("sess-1");
    expect(graph.agentName).toBe("claude-code");
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
    expect(graph.progress).toBe(0);
  });

  it("returns existing graph on second getOrCreate", () => {
    const g1 = store.getOrCreate("sess-1", "claude-code");
    g1.progress = 50;
    const g2 = store.getOrCreate("sess-1", "claude-code");
    expect(g2.progress).toBe(50);
  });

  it("adds a node", () => {
    store.getOrCreate("sess-1", "claude");
    const node = makeNode({ id: "n1", label: "INIT" });
    store.addNode("sess-1", node);
    const graph = store.get("sess-1")!;
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].label).toBe("INIT");
  });

  it("adds an edge", () => {
    store.getOrCreate("sess-1", "claude");
    store.addNode("sess-1", makeNode({ id: "n1" }));
    store.addNode("sess-1", makeNode({ id: "n2" }));
    store.addEdge("sess-1", makeEdge({ from: "n1", to: "n2" }));
    expect(store.get("sess-1")!.edges).toHaveLength(1);
  });

  it("updates a node", () => {
    store.getOrCreate("sess-1", "claude");
    store.addNode("sess-1", makeNode({ id: "n1", status: "active" }));
    store.updateNode("sess-1", "n1", { status: "done" });
    expect(store.get("sess-1")!.nodes[0].status).toBe("done");
  });

  it("sets active node", () => {
    store.getOrCreate("sess-1", "claude");
    store.addNode("sess-1", makeNode({ id: "n1" }));
    store.setActiveNode("sess-1", "n1");
    expect(store.get("sess-1")!.activeNodeId).toBe("n1");
  });

  it("removes a graph from memory", () => {
    store.getOrCreate("sess-1", "claude");
    store.remove("sess-1");
    // After remove(), session is gone from cache but still in SQLite — get() reloads it
    // Use evictFromCache + getFromDb or deleteSession for full removal
    store.deleteSession("sess-1");
    expect(store.get("sess-1")).toBeUndefined();
  });

  it("lists all graphs", () => {
    store.getOrCreate("sess-1", "claude");
    store.getOrCreate("sess-2", "codex");
    expect(store.list()).toHaveLength(2);
  });

  it("calculates progress from completed nodes", () => {
    store.getOrCreate("sess-1", "claude");
    store.addNode("sess-1", makeNode({ id: "n1", status: "done", order: 0 }));
    store.addNode("sess-1", makeNode({ id: "n2", status: "active", order: 1 }));
    store.addNode("sess-1", makeNode({ id: "n3", status: "pending", order: 2 }));
    store.recalcProgress("sess-1");
    expect(store.get("sess-1")!.progress).toBe(33);
  });
});
