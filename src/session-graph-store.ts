import type { SessionGraph, GraphNode, GraphEdge } from "./types.js";

export class SessionGraphStore {
  private graphs = new Map<string, SessionGraph>();

  getOrCreate(sessionId: string, agentName: string): SessionGraph {
    let graph = this.graphs.get(sessionId);
    if (!graph) {
      graph = {
        sessionId,
        nodes: [],
        edges: [],
        activeNodeId: null,
        progress: 0,
        agentName,
        createdAt: new Date().toISOString(),
      };
      this.graphs.set(sessionId, graph);
    }
    return graph;
  }

  get(sessionId: string): SessionGraph | undefined {
    return this.graphs.get(sessionId);
  }

  list(): SessionGraph[] {
    return Array.from(this.graphs.values());
  }

  addNode(sessionId: string, node: GraphNode): void {
    const graph = this.graphs.get(sessionId);
    if (!graph) return;
    graph.nodes.push(node);
  }

  addEdge(sessionId: string, edge: GraphEdge): void {
    const graph = this.graphs.get(sessionId);
    if (!graph) return;
    graph.edges.push(edge);
  }

  updateNode(sessionId: string, nodeId: string, patch: Partial<GraphNode>): void {
    const graph = this.graphs.get(sessionId);
    if (!graph) return;
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    Object.assign(node, patch);
  }

  setActiveNode(sessionId: string, nodeId: string): void {
    const graph = this.graphs.get(sessionId);
    if (!graph) return;
    graph.activeNodeId = nodeId;
  }

  recalcProgress(sessionId: string): void {
    const graph = this.graphs.get(sessionId);
    if (!graph) return;
    const countable = graph.nodes.filter((n) => n.status !== "detour");
    if (countable.length === 0) {
      graph.progress = 0;
      return;
    }
    const done = countable.filter((n) => n.status === "done").length;
    graph.progress = Math.round((done / countable.length) * 100);
  }

  remove(sessionId: string): void {
    this.graphs.delete(sessionId);
  }

  destroy(): void {
    this.graphs.clear();
  }
}
