import { Hono } from "hono";
import { serve } from "@hono/node-server";
import type { SessionGraphStore } from "./session-graph-store.js";
import type { SSEEvent } from "./types.js";
import { generateDashboardHtml } from "./templates/dashboard.js";

export function createNeuxonApp(store: SessionGraphStore): Hono {
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
    return c.json(graph);
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
    const clients = this.clients.get(event.sessionId);
    if (!clients || clients.size === 0) return;

    const data = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    const encoder = new TextEncoder();

    for (const writer of clients) {
      writer.write(encoder.encode(data)).catch(() => {
        clients.delete(writer);
      });
    }
  }

  destroy(): void {
    this.clients.clear();
  }
}

export function startNeuxonServer(
  store: SessionGraphStore,
  sseManager: SSEManager,
  port: number,
): { server: ReturnType<typeof serve>; actualPort: number } | null {
  const app = createNeuxonApp(store);

  app.get("/api/events", (c) => {
    const sessionId = c.req.query("sessionId");
    if (!sessionId) {
      return c.json({ error: "sessionId required" }, 400);
    }

    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

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
