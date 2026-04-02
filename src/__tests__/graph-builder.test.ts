import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GraphBuilder } from "../graph-builder.js";
import { GraphStore } from "../graph-store.js";

describe("GraphBuilder", () => {
  let store: GraphStore;
  let builder: GraphBuilder;
  const onEvent = vi.fn();

  beforeEach(async () => {
    store = await GraphStore.create();
    builder = new GraphBuilder(store, onEvent);
    onEvent.mockClear();
  });

  afterEach(() => {
    store?.destroy();
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
    // With the current implementation, activity goes to the phase (step) node.
    // completeToolNode marks it "done", but activity is still present on it.
    const buildNode = graph.nodes.find((n) => n.label === "Build")!;
    expect(buildNode).toBeDefined();
    expect(buildNode.activity).toHaveLength(1);
    expect(buildNode.activity[0].action).toBe("write");
    expect(buildNode.activity[0].text).toContain("src/api.ts");
  });

  it("creates detour node on error tool call", () => {
    builder.initSession("sess-1", "claude");
    builder.handleTextEvent(
      "sess-1",
      '[STEP name="Build" why="a" expect="b"]',
    );
    builder.handleToolCallEvent("sess-1", "Bash", "error", "npm test failed");
    const graph = store.get("sess-1")!;
    // The new implementation creates an explicit "Issue Found" detour node.
    const detourNodes = graph.nodes.filter((n) => n.status === "detour");
    expect(detourNodes.length).toBeGreaterThan(0);
    const issueNode = detourNodes.find((n) => n.label.includes("Issue"));
    expect(issueNode).toBeDefined();
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

  it("sets fullAnswer on RESULT node at turn end", () => {
    builder.initSession("sess-1", "claude");
    builder.handleTextEvent(
      "sess-1",
      '[STEP name="Analyze" why="a" expect="b"]',
    );
    builder.handleTurnEnd("sess-1", "Here is the final answer about the topic.");
    const graph = store.get("sess-1")!;
    const resultNode = graph.nodes.find((n) => n.label === "RESULT")!;
    expect(resultNode).toBeDefined();
    expect(resultNode.fullAnswer).toBe("Here is the final answer about the topic.");
  });

  it("strips [STEP] blocks from fullAnswer", () => {
    builder.initSession("sess-1", "claude");
    builder.handleTurnEnd(
      "sess-1",
      '[STEP name="Plan" why="a" expect="b"] The actual answer.',
    );
    const graph = store.get("sess-1")!;
    const resultNode = graph.nodes.find((n) => n.label === "RESULT")!;
    expect(resultNode.fullAnswer).toBe("The actual answer.");
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
