# Neuxon Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an OpenACP plugin that visualizes AI agent progress as a real-time knowledge graph served via web UI.

**Architecture:** Plugin hooks into OpenACP's middleware (agent:beforePrompt, turn:end) and events (agent:event) to build a graph of AI steps. An HTTP server serves a Canvas 2D dashboard that updates via SSE. AI agents declare steps with `[STEP]` blocks; the plugin also auto-detects steps from tool calls.

**Tech Stack:** TypeScript, tsup, Vitest, Zod, Hono, @hono/node-server, nanoid, @openacp/plugin-sdk

---

## File Structure

```
src/
  index.ts                — Plugin entry (OpenACPPlugin default export)
  types.ts                — GraphNode, GraphEdge, SessionGraph, ActivityEntry, StepBlock
  step-detector.ts        — Parse [STEP] blocks from text + auto-detect from tool calls
  session-graph-store.ts  — In-memory Map<sessionId, SessionGraph>
  graph-builder.ts        — Orchestrates StepDetector + Store, handles events
  server.ts               — Hono HTTP server + SSE manager
  neuxon-command.ts       — /neuxon command handler
  templates/
    dashboard.ts          — HTML template generator (CSS + JS + Canvas inline)
  __tests__/
    step-detector.test.ts
    session-graph-store.test.ts
    graph-builder.test.ts
    server.test.ts
```

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `CLAUDE.md`
- Modify: `.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "openacp-neuxon",
  "version": "0.1.0",
  "description": "AI journey graph — visualize agent progress as a real-time knowledge graph",
  "license": "MIT",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepublishOnly": "npm run build"
  },
  "keywords": ["openacp", "openacp-plugin", "neuxon", "graph", "visualization"],
  "engines": {
    "node": ">=20",
    "openacp": ">=2026.0326.0"
  },
  "peerDependencies": {
    "@openacp/cli": ">=2026.0326.0"
  },
  "dependencies": {
    "hono": "^4.7.0",
    "@hono/node-server": "^1.13.0",
    "nanoid": "^5.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@openacp/cli": "file:../OpenACP",
    "@types/node": "^22.0.0",
    "tsup": "^8.5.0",
    "typescript": "^5.9.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "declaration": false,
    "sourceMap": false,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src"],
  "exclude": ["src/__tests__"]
}
```

- [ ] **Step 3: Create tsup.config.ts**

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  outDir: "dist",
  bundle: true,
  splitting: false,
  sourcemap: true,
  dts: true,
  clean: true,
  external: ["@openacp/cli"],
  noExternal: [/.*/],
  esbuildOptions(options) {
    options.resolveExtensions = [".ts", ".js", ".mjs"];
  },
});
```

- [ ] **Step 4: Create CLAUDE.md**

```markdown
# CLAUDE.md

This file provides context for AI coding agents working on this plugin.

## Project Overview

- **Package**: openacp-neuxon
- **Type**: OpenACP plugin
- **Purpose**: Visualize AI agent progress as a real-time knowledge graph
- **Entry point**: `src/index.ts` (default export of OpenACPPlugin object)

## Build & Run

\`\`\`bash
npm install           # Install dependencies
npm run build         # Bundle with tsup
npm run dev           # Watch mode
npm run typecheck     # Type-check only (tsc --noEmit)
npm test              # Run tests (vitest)
\`\`\`

## Conventions

- ESM-only (`"type": "module"`), all imports use `.js` extension
- TypeScript strict mode, target ES2022, NodeNext module resolution
- tsup bundles everything into single `dist/index.js` — tsc is typecheck only
- Only `@openacp/cli` is external (peer dep)
- Tests use Vitest in `src/__tests__/`
```

- [ ] **Step 5: Update .gitignore**

Add `node_modules/` and `dist/` if not already present (they are — but ensure `.superpowers/` is there too).

- [ ] **Step 6: Install dependencies**

```bash
cd /Users/lab3/Desktop/agi/acp/openacp-neuxon
npm install
```

- [ ] **Step 7: Verify typecheck works**

```bash
npm run typecheck
```

Expected: passes (no source files yet, but config is valid).

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json tsup.config.ts CLAUDE.md .gitignore
git commit -m "chore: project scaffolding — package.json, tsconfig, tsup, CLAUDE.md"
```

---

### Task 2: Types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create src/types.ts**

```typescript
export interface ActivityEntry {
  time: string;       // ISO timestamp
  action: string;     // "read", "write", "exec", "bug", "patch"
  text: string;       // e.g. "auth.ts +47 lines"
}

export interface GraphNode {
  id: string;
  label: string;
  status: "done" | "active" | "pending" | "detour";
  layman: string;
  cause: string;
  expect: string;
  techDetails: string | null;
  activity: ActivityEntry[];
  startedAt: string;
  completedAt: string | null;
  order: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  type: "normal" | "detour" | "resolved" | "pending";
}

export interface SessionGraph {
  sessionId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  activeNodeId: string | null;
  progress: number;
  agentName: string;
  createdAt: string;
}

export interface StepBlock {
  name: string;
  why: string;
  expect: string;
}

export type SSEEvent =
  | { type: "node:added"; sessionId: string; node: GraphNode }
  | { type: "node:updated"; sessionId: string; nodeId: string; patch: Partial<GraphNode> }
  | { type: "edge:added"; sessionId: string; edge: GraphEdge }
  | { type: "activity"; sessionId: string; nodeId: string; entry: ActivityEntry }
  | { type: "progress"; sessionId: string; progress: number }
  | { type: "graph:full"; sessionId: string; graph: SessionGraph };
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add core type definitions — GraphNode, GraphEdge, SessionGraph, SSEEvent"
```

---

### Task 3: StepDetector

**Files:**
- Create: `src/step-detector.ts`
- Create: `src/__tests__/step-detector.test.ts`

- [ ] **Step 1: Write tests for StepDetector**

```typescript
import { describe, it, expect } from "vitest";
import { StepDetector } from "../step-detector.js";

describe("StepDetector", () => {
  describe("parseStepBlock", () => {
    it("parses a valid [STEP] block", () => {
      const text = `Some text before
[STEP name="Build API" why="Login needed first" expect="Working auth endpoints"]
Some text after`;

      const result = StepDetector.parseStepBlock(text);
      expect(result).toEqual({
        name: "Build API",
        why: "Login needed first",
        expect: "Working auth endpoints",
      });
    });

    it("returns null when no [STEP] block", () => {
      const result = StepDetector.parseStepBlock("just normal text");
      expect(result).toBeNull();
    });

    it("parses [STEP] with multiline text around it", () => {
      const text = `I'll start by analyzing the code.
[STEP name="Analyze Code" why="Need to understand the project" expect="A clear picture of the codebase"]
Let me read the files...`;

      const result = StepDetector.parseStepBlock(text);
      expect(result).not.toBeNull();
      expect(result!.name).toBe("Analyze Code");
    });

    it("parses the first [STEP] if multiple exist", () => {
      const text = `[STEP name="First" why="a" expect="b"]
[STEP name="Second" why="c" expect="d"]`;

      const result = StepDetector.parseStepBlock(text);
      expect(result!.name).toBe("First");
    });
  });

  describe("parseAllStepBlocks", () => {
    it("parses multiple [STEP] blocks", () => {
      const text = `[STEP name="First" why="a" expect="b"]
text
[STEP name="Second" why="c" expect="d"]`;

      const results = StepDetector.parseAllStepBlocks(text);
      expect(results).toHaveLength(2);
      expect(results[0].name).toBe("First");
      expect(results[1].name).toBe("Second");
    });
  });

  describe("autoDetectAction", () => {
    it("detects file read as 'read'", () => {
      expect(StepDetector.autoDetectAction("Read", "completed")).toBe("read");
      expect(StepDetector.autoDetectAction("Grep", "completed")).toBe("read");
      expect(StepDetector.autoDetectAction("Glob", "completed")).toBe("read");
    });

    it("detects file write as 'write'", () => {
      expect(StepDetector.autoDetectAction("Edit", "completed")).toBe("write");
      expect(StepDetector.autoDetectAction("Write", "completed")).toBe("write");
    });

    it("detects command execution as 'exec'", () => {
      expect(StepDetector.autoDetectAction("Bash", "completed")).toBe("exec");
    });

    it("detects errors as 'bug'", () => {
      expect(StepDetector.autoDetectAction("Bash", "error")).toBe("bug");
    });

    it("returns 'other' for unknown tools", () => {
      expect(StepDetector.autoDetectAction("UnknownTool", "completed")).toBe("other");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `step-detector.ts` does not exist yet.

- [ ] **Step 3: Implement StepDetector**

```typescript
import type { StepBlock } from "./types.js";

const STEP_REGEX =
  /\[STEP\s+name="([^"]+)"\s+why="([^"]+)"\s+expect="([^"]+)"\s*\]/g;

const READ_TOOLS = new Set(["Read", "Grep", "Glob", "Search", "Agent"]);
const WRITE_TOOLS = new Set(["Edit", "Write", "NotebookEdit"]);
const EXEC_TOOLS = new Set(["Bash"]);

export class StepDetector {
  static parseStepBlock(text: string): StepBlock | null {
    const match = new RegExp(STEP_REGEX.source).exec(text);
    if (!match) return null;
    return { name: match[1], why: match[2], expect: match[3] };
  }

  static parseAllStepBlocks(text: string): StepBlock[] {
    const results: StepBlock[] = [];
    const regex = new RegExp(STEP_REGEX.source, "g");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      results.push({ name: match[1], why: match[2], expect: match[3] });
    }
    return results;
  }

  static autoDetectAction(
    toolName: string,
    status: string,
  ): "read" | "write" | "exec" | "bug" | "other" {
    if (status === "error") return "bug";
    if (READ_TOOLS.has(toolName)) return "read";
    if (WRITE_TOOLS.has(toolName)) return "write";
    if (EXEC_TOOLS.has(toolName)) return "exec";
    return "other";
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/step-detector.ts src/__tests__/step-detector.test.ts
git commit -m "feat: add StepDetector — parses [STEP] blocks and auto-detects tool actions"
```

---

### Task 4: SessionGraphStore

**Files:**
- Create: `src/session-graph-store.ts`
- Create: `src/__tests__/session-graph-store.test.ts`

- [ ] **Step 1: Write tests for SessionGraphStore**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { SessionGraphStore } from "../session-graph-store.js";
import type { GraphNode, GraphEdge } from "../types.js";

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: "n1",
    label: "TEST",
    status: "active",
    layman: "test node",
    cause: "test cause",
    expect: "test expect",
    techDetails: null,
    activity: [],
    startedAt: new Date().toISOString(),
    completedAt: null,
    order: 0,
    ...overrides,
  };
}

function makeEdge(overrides: Partial<GraphEdge> = {}): GraphEdge {
  return {
    id: "e1",
    from: "n1",
    to: "n2",
    label: "leads to",
    type: "normal",
    ...overrides,
  };
}

describe("SessionGraphStore", () => {
  let store: SessionGraphStore;

  beforeEach(() => {
    store = new SessionGraphStore();
  });

  it("creates a new graph with getOrCreate", () => {
    const graph = store.getOrCreate("sess-1", "claude-code");
    expect(graph.sessionId).toBe("sess-1");
    expect(graph.agentName).toBe("claude-code");
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
    expect(graph.progress).toBe(0);
  });

  it("returns existing graph on second getOrCreate", () => {
    const g1 = store.getOrCreate("sess-1", "claude-code");
    g1.progress = 50;
    const g2 = store.getOrCreate("sess-1", "claude-code");
    expect(g2.progress).toBe(50);
  });

  it("adds a node", () => {
    store.getOrCreate("sess-1", "claude");
    const node = makeNode({ id: "n1", label: "INIT" });
    store.addNode("sess-1", node);
    const graph = store.get("sess-1")!;
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].label).toBe("INIT");
  });

  it("adds an edge", () => {
    store.getOrCreate("sess-1", "claude");
    store.addNode("sess-1", makeNode({ id: "n1" }));
    store.addNode("sess-1", makeNode({ id: "n2" }));
    store.addEdge("sess-1", makeEdge({ from: "n1", to: "n2" }));
    expect(store.get("sess-1")!.edges).toHaveLength(1);
  });

  it("updates a node", () => {
    store.getOrCreate("sess-1", "claude");
    store.addNode("sess-1", makeNode({ id: "n1", status: "active" }));
    store.updateNode("sess-1", "n1", { status: "done" });
    expect(store.get("sess-1")!.nodes[0].status).toBe("done");
  });

  it("sets active node", () => {
    store.getOrCreate("sess-1", "claude");
    store.addNode("sess-1", makeNode({ id: "n1" }));
    store.setActiveNode("sess-1", "n1");
    expect(store.get("sess-1")!.activeNodeId).toBe("n1");
  });

  it("removes a graph", () => {
    store.getOrCreate("sess-1", "claude");
    store.remove("sess-1");
    expect(store.get("sess-1")).toBeUndefined();
  });

  it("lists all graphs", () => {
    store.getOrCreate("sess-1", "claude");
    store.getOrCreate("sess-2", "codex");
    expect(store.list()).toHaveLength(2);
  });

  it("calculates progress from completed nodes", () => {
    store.getOrCreate("sess-1", "claude");
    store.addNode("sess-1", makeNode({ id: "n1", status: "done", order: 0 }));
    store.addNode("sess-1", makeNode({ id: "n2", status: "active", order: 1 }));
    store.addNode("sess-1", makeNode({ id: "n3", status: "pending", order: 2 }));
    store.recalcProgress("sess-1");
    // 1 done out of 3 nodes (not counting detour) = 33%
    expect(store.get("sess-1")!.progress).toBe(33);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL

- [ ] **Step 3: Implement SessionGraphStore**

```typescript
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

  updateNode(
    sessionId: string,
    nodeId: string,
    patch: Partial<GraphNode>,
  ): void {
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/session-graph-store.ts src/__tests__/session-graph-store.test.ts
git commit -m "feat: add SessionGraphStore — in-memory graph state per session"
```

---

### Task 5: GraphBuilder

**Files:**
- Create: `src/graph-builder.ts`
- Create: `src/__tests__/graph-builder.test.ts`

- [ ] **Step 1: Write tests for GraphBuilder**

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { GraphBuilder } from "../graph-builder.js";
import { SessionGraphStore } from "../session-graph-store.js";

describe("GraphBuilder", () => {
  let store: SessionGraphStore;
  let builder: GraphBuilder;
  const onEvent = vi.fn();

  beforeEach(() => {
    store = new SessionGraphStore();
    builder = new GraphBuilder(store, onEvent);
    onEvent.mockClear();
  });

  it("initializes a session with an INIT node", () => {
    builder.initSession("sess-1", "claude-code");
    const graph = store.get("sess-1")!;
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].label).toBe("INIT");
    expect(graph.nodes[0].status).toBe("done");
    expect(graph.activeNodeId).toBeNull();
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "graph:full" }),
    );
  });

  it("handles a [STEP] block from text event", () => {
    builder.initSession("sess-1", "claude");
    builder.handleTextEvent(
      "sess-1",
      'I will start analyzing. [STEP name="Analyze Code" why="Need to understand structure" expect="Clear picture of codebase"]',
    );
    const graph = store.get("sess-1")!;
    // INIT + Analyze Code
    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes[1].label).toBe("Analyze Code");
    expect(graph.nodes[1].status).toBe("active");
    expect(graph.nodes[1].layman).toContain("understand structure");
    expect(graph.activeNodeId).toBe(graph.nodes[1].id);
    // Edge from INIT to Analyze
    expect(graph.edges).toHaveLength(1);
  });

  it("handles tool call events as activity entries", () => {
    builder.initSession("sess-1", "claude");
    builder.handleTextEvent(
      "sess-1",
      '[STEP name="Build" why="a" expect="b"]',
    );
    builder.handleToolCallEvent("sess-1", "Edit", "completed", "src/api.ts");
    const graph = store.get("sess-1")!;
    const active = graph.nodes.find((n) => n.status === "active")!;
    expect(active.activity).toHaveLength(1);
    expect(active.activity[0].action).toBe("write");
    expect(active.activity[0].text).toContain("src/api.ts");
  });

  it("creates detour node on error tool call", () => {
    builder.initSession("sess-1", "claude");
    builder.handleTextEvent(
      "sess-1",
      '[STEP name="Build" why="a" expect="b"]',
    );
    builder.handleToolCallEvent("sess-1", "Bash", "error", "npm test failed");
    const graph = store.get("sess-1")!;
    const detour = graph.nodes.find((n) => n.status === "detour");
    expect(detour).toBeDefined();
    expect(detour!.label).toContain("Issue");
  });

  it("marks current step done on turn end", () => {
    builder.initSession("sess-1", "claude");
    builder.handleTextEvent(
      "sess-1",
      '[STEP name="Analyze" why="a" expect="b"]',
    );
    builder.handleTurnEnd("sess-1");
    const graph = store.get("sess-1")!;
    const analyze = graph.nodes.find((n) => n.label === "Analyze")!;
    expect(analyze.status).toBe("done");
    expect(analyze.completedAt).not.toBeNull();
  });

  it("emits SSE events on changes", () => {
    builder.initSession("sess-1", "claude");
    expect(onEvent).toHaveBeenCalled();
    onEvent.mockClear();

    builder.handleTextEvent(
      "sess-1",
      '[STEP name="Build" why="a" expect="b"]',
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "node:added" }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL

- [ ] **Step 3: Implement GraphBuilder**

```typescript
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

    // Add activity entry to active node
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

    // Create detour node on error
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
      order: -1, // detours don't count in order
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/graph-builder.ts src/__tests__/graph-builder.test.ts
git commit -m "feat: add GraphBuilder — converts agent events to graph nodes/edges with SSE emission"
```

---

### Task 6: HTTP Server + SSE

**Files:**
- Create: `src/server.ts`
- Create: `src/__tests__/server.test.ts`

- [ ] **Step 1: Write tests for server**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createNeuxonApp } from "../server.js";
import { SessionGraphStore } from "../session-graph-store.js";

describe("Neuxon HTTP Server", () => {
  let store: SessionGraphStore;
  let app: ReturnType<typeof createNeuxonApp>;

  beforeEach(() => {
    store = new SessionGraphStore();
    app = createNeuxonApp(store);
  });

  it("GET /health returns ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("GET /api/sessions returns empty list", async () => {
    const res = await app.request("/api/sessions");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toEqual([]);
  });

  it("GET /api/sessions returns existing graphs", async () => {
    store.getOrCreate("sess-1", "claude");
    const res = await app.request("/api/sessions");
    const body = await res.json();
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].sessionId).toBe("sess-1");
  });

  it("GET /api/graph/:sessionId returns graph", async () => {
    store.getOrCreate("sess-1", "claude");
    const res = await app.request("/api/graph/sess-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionId).toBe("sess-1");
  });

  it("GET /api/graph/:sessionId returns 404 for unknown", async () => {
    const res = await app.request("/api/graph/unknown");
    expect(res.status).toBe(404);
  });

  it("GET / returns HTML dashboard", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("NEUXON");
    expect(text).toContain("<canvas");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL

- [ ] **Step 3: Implement server**

```typescript
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

// SSE manager — tracks connected clients
export class SSEManager {
  private clients = new Map<string, Set<WritableStreamDefaultWriter>>();

  addClient(
    sessionId: string,
    writer: WritableStreamDefaultWriter,
  ): void {
    if (!this.clients.has(sessionId)) {
      this.clients.set(sessionId, new Set());
    }
    this.clients.get(sessionId)!.add(writer);
  }

  removeClient(
    sessionId: string,
    writer: WritableStreamDefaultWriter,
  ): void {
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

// Start the full server with SSE support
export function startNeuxonServer(
  store: SessionGraphStore,
  sseManager: SSEManager,
  port: number,
): { server: ReturnType<typeof serve>; actualPort: number } | null {
  const app = createNeuxonApp(store);

  // SSE endpoint
  app.get("/api/events", (c) => {
    const sessionId = c.req.query("sessionId");
    if (!sessionId) {
      return c.json({ error: "sessionId required" }, 400);
    }

    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    sseManager.addClient(sessionId, writer);

    // Send initial full graph
    const graph = store.get(sessionId);
    if (graph) {
      const init = `event: graph:full\ndata: ${JSON.stringify({ type: "graph:full", sessionId, graph })}\n\n`;
      writer.write(new TextEncoder().encode(init));
    }

    // Cleanup on disconnect
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

  // Try ports
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
```

- [ ] **Step 4: Create minimal dashboard template**

Create `src/templates/dashboard.ts` — for now just a minimal HTML that passes the test. The full UI will be ported from the mockup in Task 7.

```typescript
export function generateDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>NEUXON — AI Journey Graph</title>
</head>
<body style="background:#0a0e14;color:#e0e0e0;font-family:system-ui,sans-serif;">
<canvas id="graph"></canvas>
<h1 style="color:#00ff41;text-align:center;margin-top:40vh;">NEUXON</h1>
<p style="text-align:center;color:#8b949e;">Loading graph...</p>
<script>
// Will be replaced with full dashboard in Task 7
const params = new URLSearchParams(location.search);
const sessionId = params.get('sessionId');
if (sessionId) {
  fetch('/api/graph/' + sessionId)
    .then(r => r.json())
    .then(graph => {
      document.querySelector('p').textContent =
        graph.nodes ? graph.nodes.length + ' nodes loaded' : 'No graph found';
    })
    .catch(() => {
      document.querySelector('p').textContent = 'Waiting for session...';
    });
}
</script>
</body>
</html>`;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test
```

Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/server.ts src/templates/dashboard.ts src/__tests__/server.test.ts
git commit -m "feat: add HTTP server with SSE support — /api/graph, /api/sessions, /api/events"
```

---

### Task 7: Dashboard HTML template (full UI)

**Files:**
- Modify: `src/templates/dashboard.ts`

- [ ] **Step 1: Port the mockup into the template generator**

Replace `src/templates/dashboard.ts` with the full dashboard. This is the production version of `mockups/06-2d-sharp.html`, but with dynamic data loading from `/api/graph/:sessionId` and SSE connection to `/api/events?sessionId=:id`.

The template is a large HTML string (the full working mockup adapted to load real data). The key changes from the static mockup:
- Remove hardcoded NODES/EDGES arrays
- On page load: read `?sessionId=` from URL, fetch `/api/graph/:sessionId`
- Connect to SSE at `/api/events?sessionId=:id`
- On SSE events: update local graph data + re-render
- Step list (left panel) rendered dynamically from graph.nodes
- Detail panel rendered dynamically on node click
- Progress bar reads from graph.progress

Due to the large size of this file, the implementation should:
1. Copy the CSS and layout structure from `mockups/06-2d-sharp.html` exactly
2. Replace the static `<script>` section with dynamic data loading
3. Keep all the Canvas rendering functions (drawNode, drawEdge, drawParticles) intact
4. Add SSE event handlers that call the existing render functions

- [ ] **Step 2: Verify the dashboard loads**

```bash
npm run build
```

Expected: builds successfully.

- [ ] **Step 3: Commit**

```bash
git add src/templates/dashboard.ts
git commit -m "feat: full dashboard template — 3-column layout with real-time SSE graph updates"
```

---

### Task 8: Neuxon command

**Files:**
- Create: `src/neuxon-command.ts`

- [ ] **Step 1: Create the /neuxon command handler**

```typescript
import type { GraphBuilder } from "./graph-builder.js";
import type { SessionGraphStore } from "./session-graph-store.js";

export interface NeuxonCommandDef {
  name: string;
  description: string;
  usage: string;
  category: "plugin";
  handler: (args: {
    sessionId?: string;
    text: string;
    channelId: string;
    threadId?: string;
  }) => Promise<{ type: string; text: string } | void>;
}

export function createNeuxonCommand(
  store: SessionGraphStore,
  getUrl: () => string,
): NeuxonCommandDef {
  return {
    name: "neuxon",
    description: "View AI progress graph",
    usage: "[status | sessions]",
    category: "plugin",

    async handler(args) {
      const subcommand = args.text.trim().toLowerCase();
      const baseUrl = getUrl();

      if (subcommand === "sessions") {
        const graphs = store.list();
        if (graphs.length === 0) {
          return { type: "text", text: "No active Neuxon sessions." };
        }
        const lines = graphs.map(
          (g) =>
            `• ${g.agentName} — ${g.progress}% — ${g.nodes.length} nodes\n  ${baseUrl}/?sessionId=${g.sessionId}`,
        );
        return {
          type: "text",
          text: `**Active Neuxon Sessions:**\n\n${lines.join("\n\n")}`,
        };
      }

      if (subcommand === "status") {
        if (!args.sessionId) {
          return {
            type: "text",
            text: "No active session. Use `/neuxon sessions` to list all.",
          };
        }
        const graph = store.get(args.sessionId);
        if (!graph) {
          return { type: "text", text: "No Neuxon graph for this session." };
        }
        const active = graph.nodes.find((n) => n.status === "active");
        const done = graph.nodes.filter((n) => n.status === "done").length;
        const total = graph.nodes.filter((n) => n.status !== "detour").length;
        return {
          type: "text",
          text: `**Neuxon Progress:** ${graph.progress}% (${done}/${total} steps)\n${active ? `**Currently:** ${active.label} — ${active.layman}` : "Idle"}\n\n🔗 ${baseUrl}/?sessionId=${args.sessionId}`,
        };
      }

      // Default: show link
      const sessionId = args.sessionId;
      const url = sessionId
        ? `${baseUrl}/?sessionId=${sessionId}`
        : baseUrl;
      return {
        type: "text",
        text: `🧠 **Neuxon — AI Journey Graph**\n\nOpen in browser: ${url}`,
      };
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/neuxon-command.ts
git commit -m "feat: add /neuxon command — show graph URL, status, list sessions"
```

---

### Task 9: Plugin entry point

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Create the plugin entry point**

```typescript
import { z } from "zod";
import type { OpenACPPlugin, PluginContext } from "@openacp/plugin-sdk";
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
        ctx.log.info({ port: result.actualPort }, "Neuxon server started");
      } else {
        ctx.log.warn({ port }, "Neuxon server failed to start");
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
          handler: async (payload: any, next: () => any) => {
            payload.text = `${STEP_INJECTION_PROMPT}\n\n---\n\n${payload.text}`;
            return next();
          },
        });
      }

      // Update graph on turn end
      ctx.registerMiddleware("turn:end", {
        priority: 100,
        handler: async (payload: any, next: () => any) => {
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
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build
```

Expected: PASS — `dist/index.js` created.

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: plugin entry point — wires GraphBuilder, Server, SSE, middleware hooks, /neuxon command"
```

---

### Task 10: Final build verification and cleanup

- [ ] **Step 1: Full clean build**

```bash
rm -rf dist
npm run build
```

Expected: `dist/index.js` and `dist/index.d.ts` created without errors.

- [ ] **Step 2: Run all tests one final time**

```bash
npm test
```

Expected: ALL tests pass.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: No errors.

- [ ] **Step 4: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: final build verification — all tests pass, typecheck clean"
```
