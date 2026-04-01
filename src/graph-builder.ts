import { nanoid } from "nanoid";
import type {
  GraphNode,
  GraphEdge,
  ActivityEntry,
  SSEEvent,
} from "./types.js";
import { SessionGraphStore } from "./session-graph-store.js";
import { StepDetector } from "./step-detector.js";

export class GraphBuilder {
  private store: SessionGraphStore;
  private onEvent: (event: SSEEvent) => void;

  constructor(
    store: SessionGraphStore,
    onEvent: (event: SSEEvent) => void,
  ) {
    this.store = store;
    this.onEvent = onEvent;
  }

  initSession(sessionId: string, agentName: string): void {
    const graph = this.store.getOrCreate(sessionId, agentName);

    const initNode: GraphNode = {
      id: nanoid(8),
      label: "INIT",
      status: "done",
      layman: "The AI opened your project and is getting ready to work.",
      cause: "Every journey starts with a first step — the AI needs to set up before it can begin.",
      expect: "The AI is ready to start working on your request.",
      techDetails: null,
      activity: [],
      startedAt: graph.createdAt,
      completedAt: graph.createdAt,
      order: 0,
    };

    this.store.addNode(sessionId, initNode);
    this.store.recalcProgress(sessionId);

    this.onEvent({
      type: "graph:full",
      sessionId,
      graph: this.store.get(sessionId)!,
    });
  }

  handleTextEvent(sessionId: string, text: string): void {
    const graph = this.store.get(sessionId);
    if (!graph) return;

    const steps = StepDetector.parseAllStepBlocks(text);
    for (const step of steps) {
      this.addStepNode(sessionId, step.name, step.why, step.expect);
    }
  }

  handleToolCallEvent(
    sessionId: string,
    toolName: string,
    status: string,
    content: string,
  ): void {
    const graph = this.store.get(sessionId);
    if (!graph || !graph.activeNodeId) return;

    const action = StepDetector.autoDetectAction(toolName, status);

    const entry: ActivityEntry = {
      time: new Date().toISOString(),
      action,
      text: this.summarizeToolCall(toolName, content),
    };

    const activeNode = graph.nodes.find((n) => n.id === graph.activeNodeId);
    if (activeNode) {
      activeNode.activity.push(entry);
      this.onEvent({
        type: "activity",
        sessionId,
        nodeId: graph.activeNodeId,
        entry,
      });
    }

    if (action === "bug") {
      this.addDetourNode(sessionId, content);
    }
  }

  handleTurnEnd(sessionId: string): void {
    const graph = this.store.get(sessionId);
    if (!graph || !graph.activeNodeId) return;

    const activeNode = graph.nodes.find((n) => n.id === graph.activeNodeId);
    if (activeNode && activeNode.status === "active") {
      activeNode.status = "done";
      activeNode.completedAt = new Date().toISOString();

      this.store.recalcProgress(sessionId);

      this.onEvent({
        type: "node:updated",
        sessionId,
        nodeId: activeNode.id,
        patch: { status: "done", completedAt: activeNode.completedAt },
      });
      this.onEvent({
        type: "progress",
        sessionId,
        progress: graph.progress,
      });
    }
  }

  private addStepNode(
    sessionId: string,
    name: string,
    why: string,
    expectText: string,
  ): void {
    const graph = this.store.get(sessionId);
    if (!graph) return;

    // Mark previous active node as done
    if (graph.activeNodeId) {
      const prev = graph.nodes.find((n) => n.id === graph.activeNodeId);
      if (prev && prev.status === "active") {
        prev.status = "done";
        prev.completedAt = new Date().toISOString();
        this.onEvent({
          type: "node:updated",
          sessionId,
          nodeId: prev.id,
          patch: { status: "done", completedAt: prev.completedAt },
        });
      }
    }

    const maxOrder = Math.max(0, ...graph.nodes.map((n) => n.order));
    const newNode: GraphNode = {
      id: nanoid(8),
      label: name,
      status: "active",
      layman: why,
      cause: why,
      expect: expectText,
      techDetails: null,
      activity: [],
      startedAt: new Date().toISOString(),
      completedAt: null,
      order: maxOrder + 1,
    };

    this.store.addNode(sessionId, newNode);
    this.onEvent({ type: "node:added", sessionId, node: newNode });

    // Create edge from previous node
    const prevNodeId = graph.activeNodeId || graph.nodes[graph.nodes.length - 2]?.id;
    if (prevNodeId) {
      const edge: GraphEdge = {
        id: nanoid(8),
        from: prevNodeId,
        to: newNode.id,
        label: "leads to",
        type: "normal",
      };
      this.store.addEdge(sessionId, edge);
      this.onEvent({ type: "edge:added", sessionId, edge });
    }

    this.store.setActiveNode(sessionId, newNode.id);
    this.store.recalcProgress(sessionId);

    this.onEvent({
      type: "progress",
      sessionId,
      progress: graph.progress,
    });
  }

  private addDetourNode(sessionId: string, content: string): void {
    const graph = this.store.get(sessionId);
    if (!graph || !graph.activeNodeId) return;

    const summary = content.length > 60
      ? content.substring(0, 57) + "..."
      : content;

    const detourNode: GraphNode = {
      id: nanoid(8),
      label: "Issue Found",
      status: "detour",
      layman: `The AI ran into a problem: ${summary}. It will try to fix it.`,
      cause: "This wasn't planned — the AI discovered an issue while working.",
      expect: "The AI will fix this and continue with the previous task.",
      techDetails: content,
      activity: [],
      startedAt: new Date().toISOString(),
      completedAt: null,
      order: -1,
    };

    this.store.addNode(sessionId, detourNode);
    this.onEvent({ type: "node:added", sessionId, node: detourNode });

    const edge: GraphEdge = {
      id: nanoid(8),
      from: graph.activeNodeId,
      to: detourNode.id,
      label: "found issue!",
      type: "detour",
    };
    this.store.addEdge(sessionId, edge);
    this.onEvent({ type: "edge:added", sessionId, edge });
  }

  private summarizeToolCall(toolName: string, content: string): string {
    const short = content.length > 80
      ? content.substring(0, 77) + "..."
      : content;
    return `${toolName.toLowerCase()}: ${short}`;
  }
}
