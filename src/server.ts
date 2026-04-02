import { Hono } from "hono";
import { serve } from "@hono/node-server";
import dagre from "@dagrejs/dagre";
import type { GraphStore } from "./graph-store.js";
import type { SSEEvent } from "./types.js";
import { generateDashboardHtml } from "./templates/dashboard.js";

function computeLayout(nodes: any[], edges: any[]): void {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "LR",     // left to right
    nodesep: 80,        // vertical spacing between nodes
    ranksep: 160,       // horizontal spacing between layers
    edgesep: 40,
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    const isInit = node.label === "INIT";
    const isResult = node.label === "RESULT";
    const w = isInit ? 80 : isResult ? 80 : 70;
    const h = isInit ? 80 : isResult ? 80 : 60;
    g.setNode(node.id, { width: w, height: h });
  }

  for (const edge of edges) {
    g.setEdge(edge.from, edge.to);
  }

  dagre.layout(g);

  for (const node of nodes) {
    const pos = g.node(node.id);
    if (pos) {
      node.x = pos.x;
      node.y = pos.y;
    }
  }
}

export function createNeuxonApp(store: GraphStore): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.get("/api/sessions", (c) => {
    const sessions = store.list().map((g) => ({
      sessionId: g.sessionId,
      agentName: g.agentName,
      progress: g.progress,
      nodeCount: g.nodes.length,
      createdAt: g.createdAt,
    }));
    return c.json({ sessions });
  });

  app.get("/api/graph/:sessionId", (c) => {
    const graph = store.get(c.req.param("sessionId"));
    if (!graph) return c.json({ error: "not found" }, 404);
    const nodes = graph.nodes.map((n) => ({ ...n }));
    const edges = graph.edges.map((e) => ({ ...e }));
    computeLayout(nodes, edges);
    return c.json({ ...graph, nodes, edges });
  });

  // Merged graph of all sessions — single INIT, each session branches out
  app.get("/api/graph", (c) => {
    const sessions = store.list();
    const initNode = {
      id: "__init__",
      label: "INIT",
      status: "done",
      layman: "Central hub — all AI sessions branch from here.",
      cause: "This is the root of your knowledge graph.",
      expect: "Each branch represents a different task or conversation.",
      techDetails: null,
      activity: [],
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      order: 0,
    };
    const allNodes = [initNode];
    const allEdges: any[] = [];

    for (const g of sessions) {
      // Skip the session's own INIT node, replace with edge from central INIT
      let sessionRootId: string | null = null;
      for (const node of g.nodes) {
        if (node.label === "INIT") {
          sessionRootId = node.id;
          continue; // skip per-session INIT
        }
        allNodes.push({ ...node, _sessionId: g.sessionId } as any);
      }
      for (const edge of g.edges) {
        if (edge.from === sessionRootId) {
          // Rewire: central INIT → first real node
          allEdges.push({ ...edge, from: "__init__" });
        } else if (edge.to === sessionRootId) {
          continue; // skip edges pointing to per-session INIT
        } else {
          allEdges.push(edge);
        }
      }
    }

    computeLayout(allNodes, allEdges);
    return c.json({ nodes: allNodes, edges: allEdges });
  });

  app.get("/", (c) => {
    return c.html(generateDashboardHtml());
  });

  return app;
}

export class SSEManager {
  private clients = new Map<string, Set<WritableStreamDefaultWriter>>();

  addClient(sessionId: string, writer: WritableStreamDefaultWriter): void {
    if (!this.clients.has(sessionId)) {
      this.clients.set(sessionId, new Set());
    }
    this.clients.get(sessionId)!.add(writer);
  }

  removeClient(sessionId: string, writer: WritableStreamDefaultWriter): void {
    this.clients.get(sessionId)?.delete(writer);
  }

  broadcast(event: SSEEvent): void {
    const data = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    const encoder = new TextEncoder();
    const encoded = encoder.encode(data);

    // Send to session-specific clients
    const clients = this.clients.get(event.sessionId);
    if (clients) {
      for (const writer of clients) {
        writer.write(encoded).catch(() => { clients.delete(writer); });
      }
    }

    // Also send to "__all__" subscribers
    const allClients = this.clients.get("__all__");
    if (allClients) {
      for (const writer of allClients) {
        writer.write(encoded).catch(() => { allClients.delete(writer); });
      }
    }
  }

  destroy(): void {
    this.clients.clear();
  }
}

export function startNeuxonServer(
  store: GraphStore,
  sseManager: SSEManager,
  port: number,
): { server: ReturnType<typeof serve>; actualPort: number } | null {
  const app = createNeuxonApp(store);

  app.get("/api/events", (c) => {
    const sessionId = c.req.query("sessionId");

    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    if (sessionId) {
      // Single session mode
      sseManager.addClient(sessionId, writer);

      const graph = store.get(sessionId);
      if (graph) {
        const init = `event: graph:full\ndata: ${JSON.stringify({ type: "graph:full", sessionId, graph })}\n\n`;
        writer.write(new TextEncoder().encode(init));
      }

      c.req.raw.signal.addEventListener("abort", () => {
        sseManager.removeClient(sessionId, writer);
        writer.close().catch(() => {});
      });
    } else {
      // All sessions mode — subscribe to "__all__" channel
      sseManager.addClient("__all__", writer);

      c.req.raw.signal.addEventListener("abort", () => {
        sseManager.removeClient("__all__", writer);
        writer.close().catch(() => {});
      });
    }

    return new Response(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  });

  const maxRetries = 10;
  for (let i = 0; i < maxRetries; i++) {
    const tryPort = port + i;
    try {
      const server = serve({ fetch: app.fetch, port: tryPort });
      return { server, actualPort: tryPort };
    } catch {
      continue;
    }
  }

  return null;
}
