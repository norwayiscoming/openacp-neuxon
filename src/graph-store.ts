import type { SessionGraph, GraphNode, GraphEdge } from "./types.js";
import { NeuxonDB } from "./db.js";

export class GraphStore {
  private cache = new Map<string, SessionGraph>();
  private db: NeuxonDB;

  private constructor(db: NeuxonDB) {
    this.db = db;
  }

  // ---- factory ----

  static async create(filePath?: string): Promise<GraphStore> {
    const db = await NeuxonDB.create(filePath);
    return new GraphStore(db);
  }

  // ---- public interface (matches SessionGraphStore) ----

  getOrCreate(sessionId: string, agentName: string): SessionGraph {
    let graph = this.cache.get(sessionId);
    if (!graph) {
      // Check SQLite first (historical session)
      const existing = this.getFromDb(sessionId);
      if (existing) {
        this.cache.set(sessionId, existing);
        return existing;
      }
      // Create fresh
      graph = {
        sessionId,
        nodes: [],
        edges: [],
        activeNodeId: null,
        progress: 0,
        agentName,
        createdAt: new Date().toISOString(),
      };
      this.cache.set(sessionId, graph);
      this.db.upsertSession(sessionId, agentName, graph.createdAt);
    }
    return graph;
  }

  get(sessionId: string): SessionGraph | undefined {
    // Check cache first
    const cached = this.cache.get(sessionId);
    if (cached) return cached;
    // Fall back to SQLite
    const fromDb = this.getFromDb(sessionId);
    if (fromDb) {
      this.cache.set(sessionId, fromDb);
      return fromDb;
    }
    return undefined;
  }

  list(): SessionGraph[] {
    // Get all sessions from SQLite (source of truth)
    const dbSessions = this.db.listSessions();
    const result: SessionGraph[] = [];
    const seen = new Set<string>();
    // Prefer cache for active sessions
    for (const row of dbSessions) {
      seen.add(row.id);
      const cached = this.cache.get(row.id);
      if (cached) {
        result.push(cached);
      } else {
        const fromDb = this.getFromDb(row.id);
        if (fromDb) result.push(fromDb);
      }
    }
    // Include any cache entries not yet flushed to DB (shouldn't happen, but just in case)
    for (const [sid, graph] of this.cache) {
      if (!seen.has(sid)) result.push(graph);
    }
    return result;
  }

  addNode(sessionId: string, node: GraphNode): void {
    const graph = this.cache.get(sessionId);
    if (!graph) return;
    graph.nodes.push(node);
    // Persist to SQLite
    this.db.upsertNode({
      id: node.id,
      session_id: sessionId,
      label: node.label,
      status: node.status,
      layman: node.layman ?? null,
      cause: node.cause ?? null,
      expect: node.expect ?? null,
      tech_details: node.techDetails ?? null,
      order: node.order,
      started_at: node.startedAt ?? null,
      completed_at: node.completedAt ?? null,
      task_type: node.taskType ?? null,
      tags: node.tags ? JSON.stringify(node.tags) : null,
      embedding: node.embedding ? Buffer.from(node.embedding.buffer) : null,
      full_answer: node.fullAnswer ?? null,
    });
    // Persist activity entries if any
    for (const entry of node.activity) {
      this.db.addActivity({ node_id: node.id, time: entry.time, action: entry.action, text: entry.text });
    }
  }

  addEdge(sessionId: string, edge: GraphEdge): void {
    const graph = this.cache.get(sessionId);
    if (!graph) return;
    graph.edges.push(edge);
    // Persist to SQLite
    this.db.upsertEdge({
      id: edge.id,
      session_id: sessionId,
      from_id: edge.from,
      to_id: edge.to,
      label: edge.label ?? null,
      type: edge.type,
    });
  }

  updateNode(sessionId: string, nodeId: string, patch: Partial<GraphNode>): void {
    const graph = this.cache.get(sessionId);
    if (!graph) return;
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    Object.assign(node, patch);
    // Persist updated node to SQLite
    this.db.upsertNode({
      id: node.id,
      session_id: sessionId,
      label: node.label,
      status: node.status,
      layman: node.layman ?? null,
      cause: node.cause ?? null,
      expect: node.expect ?? null,
      tech_details: node.techDetails ?? null,
      order: node.order,
      started_at: node.startedAt ?? null,
      completed_at: node.completedAt ?? null,
      task_type: node.taskType ?? null,
      tags: node.tags ? JSON.stringify(node.tags) : null,
      embedding: node.embedding ? Buffer.from(node.embedding.buffer) : null,
      full_answer: node.fullAnswer ?? null,
    });
  }

  setActiveNode(sessionId: string, nodeId: string): void {
    const graph = this.cache.get(sessionId);
    if (!graph) return;
    graph.activeNodeId = nodeId;
    // activeNodeId is not stored in SQLite schema — lives in memory only
  }

  recalcProgress(sessionId: string): void {
    const graph = this.cache.get(sessionId);
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
    this.cache.delete(sessionId);
  }

  deleteSession(sessionId: string): void {
    this.cache.delete(sessionId);
    this.db.deleteSession(sessionId);
  }

  destroy(): void {
    this.cache.clear();
    this.db.close();
  }

  // ---- extra methods ----

  /** Remove from memory cache only; data stays in SQLite. */
  evictFromCache(sessionId: string): void {
    this.cache.delete(sessionId);
  }

  /** Load a full SessionGraph from SQLite (nodes + edges + activity). */
  getFromDb(sessionId: string): SessionGraph | null {
    const sessionRow = this.db.getSession(sessionId);
    if (!sessionRow) return null;

    const nodeRows = this.db.getNodesBySession(sessionId);
    const edgeRows = this.db.getEdgesBySession(sessionId);

    const nodes: GraphNode[] = nodeRows.map((row) => {
      const activityRows = this.db.getActivitiesByNode(row.id);
      return {
        id: row.id,
        label: row.label,
        status: row.status as GraphNode["status"],
        layman: row.layman ?? "",
        cause: row.cause ?? "",
        expect: row.expect ?? "",
        techDetails: row.tech_details ?? null,
        activity: activityRows.map((a) => ({ time: a.time, action: a.action ?? "", text: a.text ?? "" })),
        startedAt: row.started_at ?? "",
        completedAt: row.completed_at ?? null,
        order: row.order,
        taskType: (row.task_type as GraphNode["taskType"]) ?? null,
        tags: row.tags ? (JSON.parse(row.tags as string) as string[]) : undefined,
        embedding: row.embedding instanceof Uint8Array
          ? new Float32Array(
              row.embedding.buffer,
              row.embedding.byteOffset,
              row.embedding.byteLength / 4,
            )
          : null,
        fullAnswer: row.full_answer ?? null,
      };
    });

    const edges: GraphEdge[] = edgeRows.map((row) => ({
      id: row.id,
      from: row.from_id,
      to: row.to_id,
      label: row.label ?? "",
      type: row.type as GraphEdge["type"],
    }));

    return {
      sessionId,
      nodes,
      edges,
      activeNodeId: null,
      progress: 0,
      agentName: sessionRow.agent_name,
      createdAt: sessionRow.created_at,
    };
  }

  /** Returns the underlying NeuxonDB instance (needed by knowledge-index). */
  getDb(): NeuxonDB {
    return this.db;
  }

  /** Save SQLite database to a file. */
  saveToDisk(filePath: string): void {
    this.db.saveToFile(filePath);
  }
}
