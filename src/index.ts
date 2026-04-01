import { z } from "zod";
import type { OpenACPPlugin, PluginContext } from "@openacp/cli";
import { SessionGraphStore } from "./session-graph-store.js";
import { GraphBuilder } from "./graph-builder.js";
import { startNeuxonServer, SSEManager } from "./server.js";
import { createNeuxonCommand } from "./neuxon-command.js";

let store: SessionGraphStore | null = null;
let builder: GraphBuilder | null = null;
let sseManager: SSEManager | null = null;
let serverHandle: { server: ReturnType<typeof import("@hono/node-server").serve>; actualPort: number } | null = null;

const STEP_INJECTION_PROMPT = `[System — Neuxon Progress Tracker]

When you start a new phase of work, declare it with a [STEP] block:

[STEP name="<short name>" why="<why this step, in simple terms>" expect="<what the user will get when done>"]

Rules:
- Write "name" as a short action (e.g., "Analyze Code", "Build Login", "Fix Bug")
- Write "why" explaining the reason a non-technical person would understand
- Write "expect" describing the visible result in plain terms
- Only declare a step when starting genuinely new work, not for every small action
- You can declare steps mid-response — just include the [STEP] block in your output`;

const settingsSchema = z.object({
  port: z.number().int().min(1024).max(65535).default(3200),
  autoInjectPrompt: z.boolean().default(true),
  maxNodesPerSession: z.number().int().min(5).max(200).default(50),
});

function createNeuxonPlugin(): OpenACPPlugin {
  return {
    name: "openacp-neuxon",
    version: "0.1.0",
    description: "AI journey graph — visualize agent progress as a real-time knowledge graph",
    permissions: [
      "kernel:access",
      "events:read",
      "middleware:register",
      "services:register",
      "commands:register",
      "storage:read",
      "storage:write",
    ],
    settingsSchema,

    async setup(ctx: PluginContext) {
      const config = ctx.pluginConfig as z.infer<typeof settingsSchema>;
      const port = config.port ?? 3200;
      const autoInject = config.autoInjectPrompt ?? true;

      // Initialize core components
      store = new SessionGraphStore();
      sseManager = new SSEManager();
      builder = new GraphBuilder(store, (event) => {
        sseManager?.broadcast(event);
      });

      // Start HTTP server
      const result = startNeuxonServer(store, sseManager, port);
      if (result) {
        serverHandle = result;
        ctx.log.info(`Neuxon server started on port ${result.actualPort}`);
      } else {
        ctx.log.warn(`Neuxon server failed to start on port ${port}`);
      }

      const getUrl = () =>
        `http://localhost:${serverHandle?.actualPort ?? port}`;

      // Register service
      ctx.registerService("neuxon", { store, builder, getUrl });

      // Register command
      ctx.registerCommand(
        createNeuxonCommand(store, getUrl) as any,
      );

      // Listen to agent events
      ctx.on("agent:event", (...args: unknown[]) => {
        const payload = args[0] as {
          sessionId: string;
          event: { type: string; content?: string; name?: string; status?: string };
        };
        if (!payload?.sessionId || !payload?.event) return;

        const { sessionId, event } = payload;

        // Initialize graph on first event if needed
        if (!store!.get(sessionId)) {
          builder!.initSession(sessionId, "agent");
        }

        if (event.type === "text" && event.content) {
          builder!.handleTextEvent(sessionId, event.content);
        }

        if (event.type === "tool_call" && event.name) {
          builder!.handleToolCallEvent(
            sessionId,
            event.name,
            event.status ?? "completed",
            event.content ?? "",
          );
        }
      });

      // Listen to session creation
      ctx.on("session:created", (...args: unknown[]) => {
        const payload = args[0] as { sessionId: string; agentName?: string };
        if (!payload?.sessionId) return;
        builder!.initSession(
          payload.sessionId,
          payload.agentName ?? "agent",
        );
      });

      // Inject step tracking prompt
      if (autoInject) {
        ctx.registerMiddleware("agent:beforePrompt", {
          priority: 45,
          handler: async (payload, next) => {
            payload.text = `${STEP_INJECTION_PROMPT}\n\n---\n\n${payload.text}`;
            return next();
          },
        });
      }

      // Update graph on turn end
      ctx.registerMiddleware("turn:end", {
        priority: 100,
        handler: async (payload, next) => {
          if (payload.sessionId) {
            builder!.handleTurnEnd(payload.sessionId);
          }
          return next();
        },
      });

      ctx.log.info("Neuxon plugin ready");
    },

    async teardown() {
      if (serverHandle) {
        serverHandle.server.close();
        serverHandle = null;
      }
      sseManager?.destroy();
      sseManager = null;
      store?.destroy();
      store = null;
      builder = null;
    },
  };
}

export default createNeuxonPlugin();
