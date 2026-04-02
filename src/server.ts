import { Hono } from "hono";
import { serve } from "@hono/node-server";
import type { GraphStore } from "./graph-store.js";
import type { SSEEvent } from "./types.js";
import { generateDashboardHtml } from "./templates/dashboard.js";

function computeRadialLayout(nodes: any[], edges: any[]): void {
  if (nodes.length === 0) return;

  const children = new Map<string, string[]>();
  for (const e of edges) {
    if (!children.has(e.from)) children.set(e.from, []);
    children.get(e.from)!.push(e.to);
  }

  const root = nodes.find((n) => n.label === "INIT") ?? nodes[0];
  root.x = 0;
  root.y = 0;
  root.z = 0;

  const positioned = new Set<string>([root.id]);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const rootChildren = children.get(root.id) ?? [];
  const angleStep = rootChildren.length > 1
    ? (2 * Math.PI) / rootChildren.length
    : Math.PI / 3;

  let seed = 42;
  const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return (seed - 1) / 2147483646; };

  rootChildren.forEach((childId, i) => {
    const baseAngle = rootChildren.length > 1
      ? angleStep * i
      : -Math.PI / 6;
    const queue: Array<{ id: string; depth: number; angle: number }> = [
      { id: childId, depth: 1, angle: baseAngle },
    ];

    while (queue.length > 0) {
      const cur = queue.shift()!;
      const node = nodeMap.get(cur.id);
      if (!node || positioned.has(cur.id)) continue;
      positioned.add(cur.id);

      const dist = cur.depth * 80;
      const arcOffset = rootChildren.length <= 1 ? cur.depth * 0.15 : 0;
      const finalAngle = cur.angle + arcOffset;

      node.x = Math.cos(finalAngle) * dist + (rand() - 0.5) * 30;
      node.y = (rand() - 0.5) * 20;
      node.z = Math.sin(finalAngle) * dist + (rand() - 0.5) * 30;

      const nodeChildren = children.get(cur.id) ?? [];
      const spread = nodeChildren.length > 1 ? 0.8 : 0.4;
      nodeChildren.forEach((cid, j) => {
        const subAngle = finalAngle + (j - (nodeChildren.length - 1) / 2) * spread;
        queue.push({ id: cid, depth: cur.depth + 1, angle: subAngle });
      });
    }
  });

  for (const n of nodes) {
    if (!positioned.has(n.id)) {
      n.x = (rand() - 0.5) * 50;
      n.y = (rand() - 0.5) * 30;
      n.z = (rand() - 0.5) * 50;
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
    computeRadialLayout(nodes, edges);
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

    computeRadialLayout(allNodes, allEdges);
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
