# Neuxon — AI Journey Graph Plugin Design

**Date:** 2026-04-01
**Repo:** openacp-neuxon
**Status:** Approved

## 1. Overview

Neuxon is an OpenACP plugin that visualizes AI agent progress as a real-time knowledge graph. It serves non-technical users (PMs, founders, non-dev end users) who want to understand what their AI is doing, why, and how far along it is — without reading code or logs.

When a user starts an AI session via OpenACP (Telegram/Discord), Neuxon provides a web URL they can open in a browser to watch the AI's journey unfold as an interactive graph.

## 2. Target Users

- **PM / Team Lead** — monitors AI progress, wants "how far along? any blockers?"
- **Non-tech end user** — hired AI to build something, wants "what is it doing? is it working?"

Both groups need plain-language explanations, not code or technical jargon.

## 3. Architecture

```
AI Agent (Claude Code, Codex, Gemini, ...)
  │ emits AgentEvents (text, tool_call, plan, usage, ...)
  ▼
OpenACP Core (EventBus + MiddlewareChain)
  │ Neuxon hooks into:
  │   - middleware: agent:beforePrompt, turn:end
  │   - events: agent:event, session:created
  ▼
Neuxon Plugin Backend
  ├── GraphBuilder — converts events into nodes/edges
  ├── StepDetector — parses [STEP] blocks + auto-detects from tool calls
  ├── SessionGraphStore — in-memory graph state per session
  └── HTTP Server — serves UI + SSE endpoint
        │
        ▼
  SSE stream (/api/neuxon/events?sessionId=xxx)
        │
        ▼
Neuxon Web UI (browser)
  ├── Canvas 2D graph renderer
  ├── Step list (left panel)
  ├── Detail panel (right panel, resizable)
  └── HUD (top bar, progress, bottom bar)
```

## 4. Plugin Integration

### 4.1 Permissions Required

```
kernel:access       — access sessionManager, config
events:read         — listen to agent:event, session:created
middleware:register — agent:beforePrompt, turn:end
services:register   — register "neuxon" service
commands:register   — /neuxon command
storage:read        — read settings
storage:write       — persist settings
```

### 4.2 Middleware Hooks

**`agent:beforePrompt`** (priority: 50)
- Injects a system instruction asking the AI to declare steps using `[STEP]` blocks:
  ```
  [STEP name="Build API" why="Login system needed first" expect="Working auth endpoints"]
  ```
- This is prepended to the user's prompt transparently (same pattern as Cowork's context injection).
- The AI declares milestones; Neuxon creates graph nodes from them.

**`turn:end`** (priority: 100)
- After each agent turn completes, Neuxon:
  1. Marks current step node as completed
  2. If AI declared a new `[STEP]`, creates the next node
  3. Auto-generates edge label from context
  4. Updates progress percentage
  5. Pushes update via SSE

### 4.3 Event Listeners

**`agent:event`**
- Listens for all AgentEvent types during a session
- **text events**: scans for `[STEP]` blocks, accumulates text for auto-status
- **tool_call events**: tracks file reads/writes, command executions for activity log and "files touched" list
- **plan events**: if agent emits a plan, uses plan entries as initial graph nodes
- **error events**: creates detour nodes

**`session:created`**
- Initializes a new SessionGraph for the session
- Creates the INIT node automatically

## 5. Core Components

### 5.1 GraphBuilder

Converts raw agent events into a graph data structure.

```typescript
interface GraphNode {
  id: string;                    // nanoid
  label: string;                 // "BUILD API"
  status: 'done' | 'active' | 'pending' | 'detour';
  layman: string;                // plain-language description (AI-generated)
  cause: string;                 // why this step exists (AI-generated)
  expect: string;                // expected outcome (AI-generated)
  techDetails: string | null;    // files touched, commands run
  activity: ActivityEntry[];     // live log of actions within this step
  startedAt: string;             // ISO timestamp
  completedAt: string | null;
  order: number;                 // sequential order for progress calc
}

interface GraphEdge {
  id: string;
  from: string;                  // node id
  to: string;                    // node id
  label: string;                 // relationship label (AI-generated or auto)
  type: 'normal' | 'detour' | 'resolved' | 'pending';
}

interface SessionGraph {
  sessionId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  activeNodeId: string | null;
  progress: number;              // 0-100
  agentName: string;
  createdAt: string;
}
```

### 5.2 StepDetector

Parses AI output to detect step declarations.

**Explicit detection** — AI writes `[STEP]` blocks:
```
[STEP name="Analyze Codebase" why="Need to understand project structure before making changes" expect="A map of all files and how they connect"]
```

**Auto detection** — fallback when AI doesn't write `[STEP]`:
- Groups of file reads → "Analyzing" step
- File writes → "Building" step  
- Command execution → "Testing" or "Running" step
- Error followed by fix → "Detour" node

**Plan detection** — if agent emits a `plan` event (AgentEvent type: plan):
- Each plan entry becomes a pending node
- Provides full graph structure upfront

### 5.3 SessionGraphStore

In-memory store of graphs per session.

```typescript
class SessionGraphStore {
  private graphs: Map<string, SessionGraph>;
  
  getOrCreate(sessionId: string, agentName: string): SessionGraph;
  get(sessionId: string): SessionGraph | undefined;
  addNode(sessionId: string, node: GraphNode): void;
  addEdge(sessionId: string, edge: GraphEdge): void;
  updateNode(sessionId: string, nodeId: string, patch: Partial<GraphNode>): void;
  setActiveNode(sessionId: string, nodeId: string): void;
  remove(sessionId: string): void;
}
```

No persistence needed — graphs are session-scoped and rebuilt on restart from agent re-initialization.

### 5.4 HTTP Server

Lightweight HTTP server (same pattern as OpenACP's tunnel plugin — uses Hono or raw http).

**Routes:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Serve the dashboard HTML (single-page app) |
| GET | `/api/graph/:sessionId` | Current graph state as JSON |
| GET | `/api/events?sessionId=:id` | SSE stream — pushes graph updates |
| GET | `/api/sessions` | List active sessions with graphs |
| GET | `/health` | Health check |

**SSE Events:**
```
event: node:added
data: {"sessionId":"abc","node":{...}}

event: node:updated  
data: {"sessionId":"abc","nodeId":"xyz","patch":{"status":"done"}}

event: edge:added
data: {"sessionId":"abc","edge":{...}}

event: activity
data: {"sessionId":"abc","nodeId":"xyz","entry":{"time":"...","action":"write","text":"auth.ts +47"}}

event: progress
data: {"sessionId":"abc","progress":57}
```

**Port:** configurable via plugin settings, default 3200. Falls back to 3201, 3202, etc. if occupied.

### 5.5 Web UI

Single HTML file served by the HTTP server (same approach as OpenACP's file-viewer — HTML template with inline CSS/JS, no build step).

**Layout:** 3-column dashboard
- **Left (220px):** Step timeline — vertical list of all steps with status indicators
- **Center (flexible):** Canvas 2D graph — nodes, edges, arrows, particles, labels
- **Right (320px, resizable):** Detail panel — plain-language description of selected node

**Graph rendering (Canvas 2D):**
- Nodes: circles with colored borders and glow effects
- Active node: 3 concentric spinning rings + "AI IS HERE" badge
- Completed nodes: solid green with checkmark
- Pending nodes: gray dashed outline
- Detour nodes: red with exclamation
- Edges: lines/curves with directional arrows and label pills
- Particles: small dots flowing along edges (neural signal effect)

**Interactivity:**
- Click any node → detail panel shows that node's info
- Hover node → tooltip with quick info
- Resize handle on detail panel (drag left/right)
- Auto-scroll step list to active step

**Data flow:**
1. On page load: fetch `/api/graph/:sessionId` for initial state
2. Connect to `/api/events?sessionId=:id` SSE stream
3. On each SSE event: update local graph data + re-render canvas

**Node positioning:**
- Use a simple force-directed layout or predefined horizontal flow
- Nodes are positioned left-to-right by `order` field
- Detour nodes are positioned below their parent
- Positions recalculate when new nodes are added (with smooth animation)

## 6. Step Injection Prompt

Prepended to each prompt via `agent:beforePrompt` middleware:

```
[System — Neuxon Progress Tracker]

When you start a new phase of work, declare it with a [STEP] block:

[STEP name="<short name>" why="<why this step, in simple terms>" expect="<what the user will get when done>"]

Rules:
- Write "name" as a short action (e.g., "Analyze Code", "Build Login", "Fix Bug")
- Write "why" explaining the reason a non-technical person would understand
- Write "expect" describing the visible result in plain terms
- Only declare a step when starting genuinely new work, not for every small action
- You can declare steps mid-response — just include the [STEP] block in your output
```

## 7. Command

**`/neuxon`** — registered as a plugin command

| Subcommand | Description |
|------------|-------------|
| `/neuxon` | Show link to the graph UI for current session |
| `/neuxon status` | Show text summary of current progress |
| `/neuxon sessions` | List all sessions with active graphs |

The command returns a clickable URL to the Neuxon dashboard.

## 8. Plugin Settings

```typescript
const settingsSchema = z.object({
  port: z.number().int().min(1024).max(65535).default(3200),
  autoInjectPrompt: z.boolean().default(true),
  maxNodesPerSession: z.number().int().min(5).max(200).default(50),
});
```

## 9. File Structure

```
src/
  index.ts                — Plugin entry point (OpenACPPlugin export)
  graph-builder.ts        — Converts events to graph nodes/edges
  step-detector.ts        — Parses [STEP] blocks + auto-detection
  session-graph-store.ts  — In-memory graph state per session
  server.ts               — HTTP server (routes + SSE)
  templates/
    dashboard.ts          — HTML template generator (inline CSS/JS)
  types.ts                — GraphNode, GraphEdge, SessionGraph, etc.
  __tests__/
    graph-builder.test.ts
    step-detector.test.ts
    session-graph-store.test.ts
    server.test.ts
dist/
  index.js                — Single bundled output (tsup)
mockups/                  — Design mockups (HTML files)
docs/
  superpowers/
    specs/                — This spec
package.json
tsconfig.json
tsup.config.ts
CLAUDE.md
```

## 10. Dependencies

```json
{
  "peerDependencies": {
    "@openacp/cli": ">=2026.0326.0"
  },
  "dependencies": {
    "nanoid": "^5.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@openacp/plugin-sdk": "^1.0.0",
    "@types/node": "^22.0.0",
    "typescript": "^5.9.0",
    "vitest": "^3.0.0",
    "tsup": "^8.0.0"
  }
}
```

## 11. Out of Scope (v0.1)

- No persistent storage of graphs (session-scoped only)
- No multi-session view on one page
- No authentication on the web UI
- No Cowork integration (multi-agent graph)
- No custom themes
- No graph export (PNG/JSON)

## 12. Future Improvements

- **Cowork integration** — show multiple agents' journeys on one graph
- **Session replay** — persist graph data, allow replaying past sessions
- **Telegram/Discord embed** — send graph snapshot as image in chat
- **Smart layout** — use force-directed physics for better auto-positioning
- **Custom node types** — different shapes for different step types
- **Graph sharing** — shareable public URL for the graph
