import { Hono } from "hono";
import { serve } from "@hono/node-server";
import type { GraphStore } from "./graph-store.js";
import type { SSEEvent } from "./types.js";
import { generateDashboardHtml } from "./templates/dashboard.js";

function computeForceLayout(nodes: any[], edges: any[]): void {
  if (nodes.length === 0) return;

  let seed = 7;
  const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return (seed - 1) / 2147483646; };

  // Initialize random positions
  for (const n of nodes) {
    if (n.label === "INIT") { n.x = 0; n.y = 0; n.z = 0; }
    else { n.x = (rand() - 0.5) * 500; n.y = (rand() - 0.5) * 80; n.z = (rand() - 0.5) * 500; }
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const REPULSION = 20000;
  const SPRING = 0.015;
  const SPRING_LEN = 150;
  const GRAVITY = 0.005;
  const DAMPING = 0.85;
  const ITERATIONS = 300;

  // Velocity per node
  const vx = new Map<string, number>();
  const vy = new Map<string, number>();
  const vz = new Map<string, number>();
  for (const n of nodes) { vx.set(n.id, 0); vy.set(n.id, 0); vz.set(n.id, 0); }

  for (let iter = 0; iter < ITERATIONS; iter++) {
    // Repulsion between all pairs
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        let dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const force = REPULSION / (dist * dist);
        const fx = (dx / dist) * force, fy = (dy / dist) * force, fz = (dz / dist) * force;
        vx.set(a.id, vx.get(a.id)! + fx);
        vy.set(a.id, vy.get(a.id)! + fy);
        vz.set(a.id, vz.get(a.id)! + fz);
        vx.set(b.id, vx.get(b.id)! - fx);
        vy.set(b.id, vy.get(b.id)! - fy);
        vz.set(b.id, vz.get(b.id)! - fz);
      }
    }

    // Spring attraction along edges
    for (const e of edges) {
      const a = nodeMap.get(e.from), b = nodeMap.get(e.to);
      if (!a || !b) continue;
      let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      let dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const force = SPRING * (dist - SPRING_LEN);
      const fx = (dx / dist) * force, fy = (dy / dist) * force, fz = (dz / dist) * force;
      vx.set(a.id, vx.get(a.id)! + fx);
      vy.set(a.id, vy.get(a.id)! + fy);
      vz.set(a.id, vz.get(a.id)! + fz);
      vx.set(b.id, vx.get(b.id)! - fx);
      vy.set(b.id, vy.get(b.id)! - fy);
      vz.set(b.id, vz.get(b.id)! - fz);
    }

    // Gravity toward center + flatten Y
    for (const n of nodes) {
      vx.set(n.id, vx.get(n.id)! - n.x * GRAVITY);
      vy.set(n.id, vy.get(n.id)! - n.y * GRAVITY * 3); // stronger Y gravity = flatter
      vz.set(n.id, vz.get(n.id)! - n.z * GRAVITY);
    }

    // Apply velocity with damping
    for (const n of nodes) {
      if (n.label === "INIT") continue; // pin INIT at origin
      const dvx = vx.get(n.id)! * DAMPING;
      const dvy = vy.get(n.id)! * DAMPING;
      const dvz = vz.get(n.id)! * DAMPING;
      n.x += Math.max(-30, Math.min(30, dvx));
      n.y += Math.max(-15, Math.min(15, dvy));
      n.z += Math.max(-30, Math.min(30, dvz));
      vx.set(n.id, dvx);
      vy.set(n.id, dvy);
      vz.set(n.id, dvz);
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
    computeForceLayout(nodes, edges);
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

    computeForceLayout(allNodes, allEdges);
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
