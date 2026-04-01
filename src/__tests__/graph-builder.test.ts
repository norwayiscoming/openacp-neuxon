import { describe, it, expect, beforeEach, vi } from "vitest";
import { GraphBuilder } from "../graph-builder.js";
import { SessionGraphStore } from "../session-graph-store.js";

describe("GraphBuilder", () => {
  let store: SessionGraphStore;
  let builder: GraphBuilder;
  const onEvent = vi.fn();

  beforeEach(() => {
    store = new SessionGraphStore();
    builder = new GraphBuilder(store, onEvent);
    onEvent.mockClear();
  });

  it("initializes a session with an INIT node", () => {
    builder.initSession("sess-1", "claude-code");
    const graph = store.get("sess-1")!;
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].label).toBe("INIT");
    expect(graph.nodes[0].status).toBe("done");
    expect(graph.activeNodeId).toBeNull();
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "graph:full" }),
    );
  });

  it("handles a [STEP] block from text event", () => {
    builder.initSession("sess-1", "claude");
    builder.handleTextEvent(
      "sess-1",
      'I will start analyzing. [STEP name="Analyze Code" why="Need to understand structure" expect="Clear picture of codebase"]',
    );
    const graph = store.get("sess-1")!;
    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes[1].label).toBe("Analyze Code");
    expect(graph.nodes[1].status).toBe("active");
    expect(graph.nodes[1].layman).toContain("understand structure");
    expect(graph.activeNodeId).toBe(graph.nodes[1].id);
    expect(graph.edges).toHaveLength(1);
  });

  it("handles tool call events as activity entries", () => {
    builder.initSession("sess-1", "claude");
    builder.handleTextEvent(
      "sess-1",
      '[STEP name="Build" why="a" expect="b"]',
    );
    builder.handleToolCallEvent("sess-1", "Edit", "completed", "src/api.ts");
    const graph = store.get("sess-1")!;
    const active = graph.nodes.find((n) => n.status === "active")!;
    expect(active.activity).toHaveLength(1);
    expect(active.activity[0].action).toBe("write");
    expect(active.activity[0].text).toContain("src/api.ts");
  });

  it("creates detour node on error tool call", () => {
    builder.initSession("sess-1", "claude");
    builder.handleTextEvent(
      "sess-1",
      '[STEP name="Build" why="a" expect="b"]',
    );
    builder.handleToolCallEvent("sess-1", "Bash", "error", "npm test failed");
    const graph = store.get("sess-1")!;
    const detour = graph.nodes.find((n) => n.status === "detour");
    expect(detour).toBeDefined();
    expect(detour!.label).toContain("Issue");
  });

  it("marks current step done on turn end", () => {
    builder.initSession("sess-1", "claude");
    builder.handleTextEvent(
      "sess-1",
      '[STEP name="Analyze" why="a" expect="b"]',
    );
    builder.handleTurnEnd("sess-1");
    const graph = store.get("sess-1")!;
    const analyze = graph.nodes.find((n) => n.label === "Analyze")!;
    expect(analyze.status).toBe("done");
    expect(analyze.completedAt).not.toBeNull();
  });

  it("emits SSE events on changes", () => {
    builder.initSession("sess-1", "claude");
    expect(onEvent).toHaveBeenCalled();
    onEvent.mockClear();

    builder.handleTextEvent(
      "sess-1",
      '[STEP name="Build" why="a" expect="b"]',
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "node:added" }),
    );
  });
});
