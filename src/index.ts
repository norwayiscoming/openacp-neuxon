import { z } from "zod";
import type { OpenACPPlugin, PluginContext } from "@openacp/cli";
import { GraphStore } from "./graph-store.js";
import { GraphBuilder } from "./graph-builder.js";
import { startNeuxonServer, SSEManager } from "./server.js";
import { createNeuxonCommand } from "./neuxon-command.js";

let store: GraphStore | null = null;
let builder: GraphBuilder | null = null;
let sseManager: SSEManager | null = null;
let serverHandle: { server: ReturnType<typeof import("@hono/node-server").serve>; actualPort: number } | null = null;
const textBuffers = new Map<string, string>();
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();
const fullResponses = new Map<string, string>();

const STEP_INJECTION_PROMPT = `[System — Neuxon Progress Tracker]

Declare each distinct phase of your work with a [STEP] block:

[STEP name="<short name>" why="<why this step, in simple terms>" expect="<what the user will get when done>"]

Rules:
- Declare a [STEP] for EVERY distinct phase: planning, researching, analyzing, searching, reading, writing, testing, summarizing, etc.
- Write "name" as a short action (e.g., "Plan Approach", "Search Sources", "Analyze Results", "Write Summary", "Review Code")
- Write "why" explaining the reason a non-technical person would understand
- Write "expect" describing the visible result in plain terms
- Declare 3-8 steps per task — break work into meaningful phases
- Declare a new [STEP] BEFORE each phase starts, not after
- You can declare steps mid-response — just include the [STEP] block in your output
- Example flow: [STEP name="Understand Request"...] → [STEP name="Research"...] → [STEP name="Analyze Findings"...] → [STEP name="Write Answer"...]`;

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
      store = await GraphStore.create();
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
          // Accumulate full response for RESULT node
          const fullPrev = fullResponses.get(sessionId) ?? "";
          fullResponses.set(sessionId, fullPrev + event.content);

          // Buffer streaming text chunks, flush after 500ms idle
          const prev = textBuffers.get(sessionId) ?? "";
          textBuffers.set(sessionId, prev + event.content);

          const existing = flushTimers.get(sessionId);
          if (existing) clearTimeout(existing);

          flushTimers.set(sessionId, setTimeout(() => {
            const buffered = textBuffers.get(sessionId);
            if (buffered) {
              ctx.log.info(`[neuxon] flushing text buffer, length=${buffered.length}, hasSTEP=${buffered.includes('[STEP')}`);
              builder!.handleTextEvent(sessionId, buffered);
              textBuffers.delete(sessionId);
            }
            flushTimers.delete(sessionId);
          }, 500));
        }

        if ((event.type === "tool_call" || event.type === "tool_update") && event.name && event.name !== "undefined") {
          ctx.log.info(`[neuxon] tool event: ${event.name} status=${event.status}`);
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
            // Flush any remaining text buffer
            const timer = flushTimers.get(payload.sessionId);
            if (timer) clearTimeout(timer);
            const buffered = textBuffers.get(payload.sessionId);
            if (buffered) {
              builder!.handleTextEvent(payload.sessionId, buffered);
              textBuffers.delete(payload.sessionId);
              flushTimers.delete(payload.sessionId);
            }
            const fullResponse = fullResponses.get(payload.sessionId) ?? "";
            builder!.handleTurnEnd(payload.sessionId, fullResponse);
            fullResponses.delete(payload.sessionId);
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
