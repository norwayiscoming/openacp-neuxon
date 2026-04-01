# Neuxon Knowledge Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve Neuxon from an in-memory visualization plugin into a persistent knowledge graph that caches AI results, injects prior context, and saves tokens across sessions.

**Architecture:** Layered modules in a single plugin. SQLite (via sql.js/WASM) for persistence, @xenova/transformers for local embeddings, cosine similarity for semantic search. In-memory cache for active sessions, SQLite for history. Context engine classifies tasks as QA/creative and decides cache-hit vs inject vs skip.

**Tech Stack:** TypeScript, sql.js, @xenova/transformers (all-MiniLM-L6-v2), Vitest, existing Hono server + SSE

---

### File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `package.json` | Modify | Add sql.js, @xenova/transformers deps |
| `tsup.config.ts` | Modify | Mark sql.js + transformers as external |
| `src/types.ts` | Modify | Add knowledge graph fields to types |
| `src/db.ts` | Create | sql.js wrapper, schema init, read/write helpers |
| `src/graph-store.ts` | Create | Replaces SessionGraphStore, memory + SQLite |
| `src/session-graph-store.ts` | Delete | Replaced by graph-store.ts |
| `src/knowledge-index.ts` | Create | Local embedding, tag extraction, similarity search |
| `src/context-engine.ts` | Create | Task classify, cache/inject/skip decision |
| `src/step-detector.ts` | Modify | Add [TASK type="..."] parsing |
| `src/graph-builder.ts` | Modify | Use new graph-store, store full_answer + task_type |
| `src/index.ts` | Modify | Wire new modules, update middleware |
| `src/neuxon-command.ts` | Modify | Add recall, refresh, forget commands |
| `src/server.ts` | Modify | Load historical sessions from SQLite |
| `src/templates/dashboard.ts` | Modify | CACHE node color, session count badge |
| `src/__tests__/db.test.ts` | Create | SQLite wrapper tests |
| `src/__tests__/graph-store.test.ts` | Create | Persistence + cache tests |
| `src/__tests__/knowledge-index.test.ts` | Create | Embedding + search tests |
| `src/__tests__/context-engine.test.ts` | Create | Classification + decision tests |
| `src/__tests__/step-detector.test.ts` | Create | [TASK] parsing tests |

---

### Task 1: Add Dependencies & Configure Build

**Files:**
- Modify: `package.json`
- Modify: `tsup.config.ts`

- [ ] **Step 1: Install new dependencies**

```bash
npm install sql.js @xenova/transformers
```

- [ ] **Step 2: Update tsup.config.ts to externalize WASM-dependent packages**

In `tsup.config.ts`, change the external array to include sql.js and transformers (they can't be bundled into a single ESM file due to WASM/ONNX):

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
  external: ["@openacp/cli", "sql.js", "@xenova/transformers"],
  noExternal: [/.*/],
  esbuildOptions(options) {
    options.resolveExtensions = [".ts", ".js", ".mjs"];
  },
});
```

- [ ] **Step 3: Verify build still works**

```bash
npm run build
```

Expected: Build succeeds, `dist/index.js` created.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json tsup.config.ts
git commit -m "chore: add sql.js and @xenova/transformers dependencies"
```

---

### Task 2: Extend Types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add knowledge graph fields to GraphNode and new types**

Replace the full content of `src/types.ts`:

```typescript
export interface ActivityEntry {
  time: string;
  action: string;
  text: string;
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

  // Knowledge graph fields
  taskType?: "qa" | "creative" | null;
  tags?: string[];
  embedding?: Float32Array | null;
  fullAnswer?: string | null;
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

export interface TaskBlock {
  type: "qa" | "creative";
}

export interface SearchResult {
  nodeId: string;
  sessionId: string;
  label: string;
  score: number;
  taskType: "qa" | "creative" | null;
  tags: string[];
  fullAnswer: string | null;
  createdAt: string;
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
npx tsc --noEmit
```

Expected: No errors (existing code uses `?` optional fields so backward compat is fine).

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add knowledge graph fields to types"
```

---

### Task 3: SQLite Database Layer

**Files:**
- Create: `src/db.ts`
- Create: `src/__tests__/db.test.ts`

- [ ] **Step 1: Write failing tests for db module**

Create `src/__tests__/db.test.ts`:

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { NeuxonDB } from "../db.js";

describe("NeuxonDB", () => {
  let db: NeuxonDB;

  afterEach(() => {
    db?.close();
  });

  it("initializes in-memory and creates tables", () => {
    db = new NeuxonDB(); // in-memory for tests
    const tables = db.listTables();
    expect(tables).toContain("sessions");
    expect(tables).toContain("nodes");
    expect(tables).toContain("edges");
    expect(tables).toContain("activity");
  });

  it("inserts and retrieves a session", () => {
    db = new NeuxonDB();
    db.upsertSession("s1", "agent-1", "2026-04-01T00:00:00Z");
    const session = db.getSession("s1");
    expect(session).not.toBeNull();
    expect(session!.agent_name).toBe("agent-1");
  });

  it("inserts and retrieves nodes", () => {
    db = new NeuxonDB();
    db.upsertSession("s1", "agent-1", "2026-04-01T00:00:00Z");
    db.upsertNode({
      id: "n1",
      session_id: "s1",
      label: "INIT",
      status: "done",
      order: 0,
      started_at: "2026-04-01T00:00:00Z",
    });
    const nodes = db.getNodesBySession("s1");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].label).toBe("INIT");
  });

  it("inserts and retrieves edges", () => {
    db = new NeuxonDB();
    db.upsertSession("s1", "agent-1", "2026-04-01T00:00:00Z");
    db.upsertNode({ id: "n1", session_id: "s1", label: "A", status: "done", order: 0 });
    db.upsertNode({ id: "n2", session_id: "s1", label: "B", status: "done", order: 1 });
    db.upsertEdge({ id: "e1", session_id: "s1", from_id: "n1", to_id: "n2", label: "leads to", type: "normal" });
    const edges = db.getEdgesBySession("s1");
    expect(edges).toHaveLength(1);
    expect(edges[0].from_id).toBe("n1");
  });

  it("stores and retrieves embedding as Float32Array", () => {
    db = new NeuxonDB();
    db.upsertSession("s1", "agent-1", "2026-04-01T00:00:00Z");
    const embedding = new Float32Array([0.1, 0.2, 0.3]);
    db.upsertNode({
      id: "n1",
      session_id: "s1",
      label: "RESULT",
      status: "done",
      order: 0,
      embedding: Buffer.from(embedding.buffer),
      tags: JSON.stringify(["web3", "news"]),
      task_type: "qa",
      full_answer: "Web3 is great",
    });
    const results = db.getResultNodesWithEmbeddings();
    expect(results).toHaveLength(1);
    expect(results[0].task_type).toBe("qa");
    expect(results[0].tags).toBe('["web3","news"]');
    const retrieved = new Float32Array(results[0].embedding.buffer);
    expect(retrieved[0]).toBeCloseTo(0.1);
  });

  it("deletes a session and its data", () => {
    db = new NeuxonDB();
    db.upsertSession("s1", "agent-1", "2026-04-01T00:00:00Z");
    db.upsertNode({ id: "n1", session_id: "s1", label: "A", status: "done", order: 0 });
    db.deleteSession("s1");
    expect(db.getSession("s1")).toBeNull();
    expect(db.getNodesBySession("s1")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/db.test.ts
```

Expected: FAIL — `NeuxonDB` does not exist.

- [ ] **Step 3: Implement db.ts**

Create `src/db.ts`:

```typescript
import initSqlJs, { type Database } from "sql.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  agent_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL,
  layman TEXT,
  cause TEXT,
  expect TEXT,
  tech_details TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,
  task_type TEXT,
  tags TEXT,
  embedding BLOB,
  full_answer TEXT
);

CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  label TEXT,
  type TEXT NOT NULL DEFAULT 'normal'
);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id TEXT NOT NULL,
  time TEXT NOT NULL,
  action TEXT,
  text TEXT
);

CREATE INDEX IF NOT EXISTS idx_nodes_session ON nodes(session_id);
CREATE INDEX IF NOT EXISTS idx_nodes_task_type ON nodes(task_type);
CREATE INDEX IF NOT EXISTS idx_edges_session ON edges(session_id);
CREATE INDEX IF NOT EXISTS idx_activity_node ON activity(node_id);
`;

export interface NodeRow {
  id: string;
  session_id: string;
  label: string;
  status: string;
  layman: string | null;
  cause: string | null;
  expect: string | null;
  tech_details: string | null;
  order: number;
  started_at: string | null;
  completed_at: string | null;
  task_type: string | null;
  tags: string | null;
  embedding: Buffer | null;
  full_answer: string | null;
}

export interface EdgeRow {
  id: string;
  session_id: string;
  from_id: string;
  to_id: string;
  label: string | null;
  type: string;
}

export interface SessionRow {
  id: string;
  agent_name: string;
  created_at: string;
  updated_at: string;
}

export interface ActivityRow {
  id: number;
  node_id: string;
  time: string;
  action: string | null;
  text: string | null;
}

export class NeuxonDB {
  private db: Database;

  constructor(filePath?: string) {
    // sql.js initSqlJs is async, but we use synchronous init for simplicity
    // The caller must use NeuxonDB.create() for file-based DBs
    // This constructor creates in-memory DB synchronously for tests
    const SQL = require("sql.js");
    const SqlJs = SQL.default || SQL;
    // For sync constructor, we need the WASM to be loaded already
    // This works for testing; production uses static create()
    this.db = new SqlJs.Database();
    this.db.run(SCHEMA);
  }

  static async create(filePath?: string): Promise<NeuxonDB> {
    const instance = Object.create(NeuxonDB.prototype) as NeuxonDB;
    const SQL = await initSqlJs();
    if (filePath) {
      const fs = await import("node:fs");
      let data: Buffer | undefined;
      try {
        data = fs.readFileSync(filePath);
      } catch {
        // File doesn't exist yet — will create on save
      }
      instance.db = new SQL.Database(data);
    } else {
      instance.db = new SQL.Database();
    }
    instance.db.run(SCHEMA);
    return instance;
  }

  listTables(): string[] {
    const result = this.db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    if (result.length === 0) return [];
    return result[0].values.map((row) => row[0] as string);
  }

  upsertSession(id: string, agentName: string, createdAt: string): void {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT OR REPLACE INTO sessions (id, agent_name, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
      [id, agentName, createdAt, now],
    );
  }

  getSession(id: string): SessionRow | null {
    const stmt = this.db.prepare("SELECT * FROM sessions WHERE id = ?");
    stmt.bind([id]);
    if (stmt.step()) {
      const row = stmt.getAsObject() as unknown as SessionRow;
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  }

  listSessions(): SessionRow[] {
    const result = this.db.exec("SELECT * FROM sessions ORDER BY created_at DESC");
    if (result.length === 0) return [];
    return result[0].values.map((row) => ({
      id: row[0] as string,
      agent_name: row[1] as string,
      created_at: row[2] as string,
      updated_at: row[3] as string,
    }));
  }

  upsertNode(node: Partial<NodeRow> & { id: string; session_id: string; label: string; status: string; order: number }): void {
    this.db.run(
      `INSERT OR REPLACE INTO nodes (id, session_id, label, status, layman, cause, expect, tech_details, "order", started_at, completed_at, task_type, tags, embedding, full_answer)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        node.id, node.session_id, node.label, node.status,
        node.layman ?? null, node.cause ?? null, node.expect ?? null, node.tech_details ?? null,
        node.order, node.started_at ?? null, node.completed_at ?? null,
        node.task_type ?? null, node.tags ?? null, node.embedding ?? null, node.full_answer ?? null,
      ],
    );
  }

  getNodesBySession(sessionId: string): NodeRow[] {
    const result = this.db.exec("SELECT * FROM nodes WHERE session_id = ? ORDER BY \"order\"", [sessionId]);
    if (result.length === 0) return [];
    const cols = result[0].columns;
    return result[0].values.map((row) => {
      const obj: any = {};
      cols.forEach((col, i) => { obj[col] = row[i]; });
      return obj as NodeRow;
    });
  }

  getResultNodesWithEmbeddings(): NodeRow[] {
    const result = this.db.exec("SELECT * FROM nodes WHERE label = 'RESULT' AND embedding IS NOT NULL");
    if (result.length === 0) return [];
    const cols = result[0].columns;
    return result[0].values.map((row) => {
      const obj: any = {};
      cols.forEach((col, i) => { obj[col] = row[i]; });
      return obj as NodeRow;
    });
  }

  upsertEdge(edge: { id: string; session_id: string; from_id: string; to_id: string; label?: string; type: string }): void {
    this.db.run(
      `INSERT OR REPLACE INTO edges (id, session_id, from_id, to_id, label, type) VALUES (?, ?, ?, ?, ?, ?)`,
      [edge.id, edge.session_id, edge.from_id, edge.to_id, edge.label ?? null, edge.type],
    );
  }

  getEdgesBySession(sessionId: string): EdgeRow[] {
    const result = this.db.exec("SELECT * FROM edges WHERE session_id = ?", [sessionId]);
    if (result.length === 0) return [];
    const cols = result[0].columns;
    return result[0].values.map((row) => {
      const obj: any = {};
      cols.forEach((col, i) => { obj[col] = row[i]; });
      return obj as EdgeRow;
    });
  }

  addActivity(nodeId: string, time: string, action: string, text: string): void {
    this.db.run(
      "INSERT INTO activity (node_id, time, action, text) VALUES (?, ?, ?, ?)",
      [nodeId, time, action, text],
    );
  }

  getActivitiesByNode(nodeId: string): ActivityRow[] {
    const result = this.db.exec("SELECT * FROM activity WHERE node_id = ? ORDER BY id", [nodeId]);
    if (result.length === 0) return [];
    const cols = result[0].columns;
    return result[0].values.map((row) => {
      const obj: any = {};
      cols.forEach((col, i) => { obj[col] = row[i]; });
      return obj as ActivityRow;
    });
  }

  deleteSession(sessionId: string): void {
    this.db.run("DELETE FROM activity WHERE node_id IN (SELECT id FROM nodes WHERE session_id = ?)", [sessionId]);
    this.db.run("DELETE FROM edges WHERE session_id = ?", [sessionId]);
    this.db.run("DELETE FROM nodes WHERE session_id = ?", [sessionId]);
    this.db.run("DELETE FROM sessions WHERE id = ?", [sessionId]);
  }

  saveToFile(filePath: string): void {
    const fs = require("node:fs");
    const data = this.db.export();
    fs.writeFileSync(filePath, Buffer.from(data));
  }

  close(): void {
    this.db.close();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/db.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db.ts src/__tests__/db.test.ts
git commit -m "feat: add SQLite database layer with sql.js"
```

---

### Task 4: Graph Store (replaces SessionGraphStore)

**Files:**
- Create: `src/graph-store.ts`
- Create: `src/__tests__/graph-store.test.ts`
- Modify: `src/graph-builder.ts` (import change)
- Modify: `src/index.ts` (swap store)
- Delete: `src/session-graph-store.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/graph-store.test.ts`:

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { GraphStore } from "../graph-store.js";

describe("GraphStore", () => {
  let store: GraphStore;

  afterEach(() => {
    store?.destroy();
  });

  it("creates a session graph and persists to SQLite", () => {
    store = new GraphStore(); // in-memory DB
    const graph = store.getOrCreate("s1", "agent-1");
    expect(graph.sessionId).toBe("s1");
    // Verify it's in SQLite too
    const fromDb = store.getFromDb("s1");
    expect(fromDb).not.toBeNull();
    expect(fromDb!.sessionId).toBe("s1");
  });

  it("adds nodes to both memory and SQLite", () => {
    store = new GraphStore();
    store.getOrCreate("s1", "agent-1");
    store.addNode("s1", {
      id: "n1", label: "INIT", status: "done", layman: "Init",
      cause: "", expect: "", techDetails: null, activity: [],
      startedAt: "2026-04-01T00:00:00Z", completedAt: null, order: 0,
    });
    expect(store.get("s1")!.nodes).toHaveLength(1);
    const fromDb = store.getFromDb("s1");
    expect(fromDb!.nodes).toHaveLength(1);
  });

  it("loads historical session from SQLite on get()", () => {
    store = new GraphStore();
    store.getOrCreate("s1", "agent-1");
    store.addNode("s1", {
      id: "n1", label: "INIT", status: "done", layman: "Init",
      cause: "", expect: "", techDetails: null, activity: [],
      startedAt: "2026-04-01T00:00:00Z", completedAt: null, order: 0,
    });
    // Evict from memory cache
    store.evictFromCache("s1");
    // Should load from SQLite
    const graph = store.get("s1");
    expect(graph).not.toBeNull();
    expect(graph!.nodes).toHaveLength(1);
  });

  it("lists all sessions including historical", () => {
    store = new GraphStore();
    store.getOrCreate("s1", "agent-1");
    store.getOrCreate("s2", "agent-2");
    store.evictFromCache("s1");
    const all = store.list();
    expect(all.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/graph-store.test.ts
```

Expected: FAIL — `GraphStore` does not exist.

- [ ] **Step 3: Implement graph-store.ts**

Create `src/graph-store.ts` — same interface as `SessionGraphStore` but backed by SQLite:

```typescript
import type { SessionGraph, GraphNode, GraphEdge } from "./types.js";
import { NeuxonDB } from "./db.js";

export class GraphStore {
  private cache = new Map<string, SessionGraph>();
  private db: NeuxonDB;

  constructor(db?: NeuxonDB) {
    this.db = db ?? new NeuxonDB();
  }

  static async createWithFile(filePath: string): Promise<GraphStore> {
    const db = await NeuxonDB.create(filePath);
    const store = new GraphStore(db);
    return store;
  }

  getOrCreate(sessionId: string, agentName: string): SessionGraph {
    let graph = this.cache.get(sessionId);
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
      this.cache.set(sessionId, graph);
      this.db.upsertSession(sessionId, agentName, graph.createdAt);
    }
    return graph;
  }

  get(sessionId: string): SessionGraph | undefined {
    const cached = this.cache.get(sessionId);
    if (cached) return cached;
    // Try loading from SQLite
    return this.getFromDb(sessionId) ?? undefined;
  }

  getFromDb(sessionId: string): SessionGraph | null {
    const session = this.db.getSession(sessionId);
    if (!session) return null;
    const nodeRows = this.db.getNodesBySession(sessionId);
    const edgeRows = this.db.getEdgesBySession(sessionId);
    const nodes: GraphNode[] = nodeRows.map((r) => ({
      id: r.id,
      label: r.label,
      status: r.status as GraphNode["status"],
      layman: r.layman ?? "",
      cause: r.cause ?? "",
      expect: r.expect ?? "",
      techDetails: r.tech_details,
      activity: this.db.getActivitiesByNode(r.id).map((a) => ({
        time: a.time, action: a.action ?? "", text: a.text ?? "",
      })),
      startedAt: r.started_at ?? "",
      completedAt: r.completed_at,
      order: r.order,
      taskType: r.task_type as GraphNode["taskType"],
      tags: r.tags ? JSON.parse(r.tags) : undefined,
      fullAnswer: r.full_answer,
    }));
    const edges: GraphEdge[] = edgeRows.map((r) => ({
      id: r.id, from: r.from_id, to: r.to_id,
      label: r.label ?? "", type: r.type as GraphEdge["type"],
    }));
    const graph: SessionGraph = {
      sessionId, nodes, edges,
      activeNodeId: null, progress: 0,
      agentName: session.agent_name,
      createdAt: session.created_at,
    };
    this.recalcProgress(sessionId, graph);
    return graph;
  }

  list(): SessionGraph[] {
    // Merge cached + SQLite sessions
    const sessions = this.db.listSessions();
    const result: SessionGraph[] = [];
    const seen = new Set<string>();
    for (const [id, graph] of this.cache) {
      result.push(graph);
      seen.add(id);
    }
    for (const s of sessions) {
      if (!seen.has(s.id)) {
        const graph = this.getFromDb(s.id);
        if (graph) result.push(graph);
      }
    }
    return result;
  }

  addNode(sessionId: string, node: GraphNode): void {
    const graph = this.cache.get(sessionId);
    if (graph) graph.nodes.push(node);
    this.db.upsertNode({
      id: node.id, session_id: sessionId, label: node.label, status: node.status,
      layman: node.layman, cause: node.cause, expect: node.expect,
      tech_details: node.techDetails, order: node.order,
      started_at: node.startedAt, completed_at: node.completedAt,
      task_type: node.taskType ?? null,
      tags: node.tags ? JSON.stringify(node.tags) : null,
      embedding: node.embedding ? Buffer.from(node.embedding.buffer) : null,
      full_answer: node.fullAnswer ?? null,
    });
  }

  addEdge(sessionId: string, edge: GraphEdge): void {
    const graph = this.cache.get(sessionId);
    if (graph) graph.edges.push(edge);
    this.db.upsertEdge({
      id: edge.id, session_id: sessionId,
      from_id: edge.from, to_id: edge.to,
      label: edge.label, type: edge.type,
    });
  }

  updateNode(sessionId: string, nodeId: string, patch: Partial<GraphNode>): void {
    const graph = this.cache.get(sessionId);
    if (graph) {
      const node = graph.nodes.find((n) => n.id === nodeId);
      if (node) Object.assign(node, patch);
    }
    // Re-persist full node
    const fullNode = graph?.nodes.find((n) => n.id === nodeId);
    if (fullNode) {
      this.db.upsertNode({
        id: fullNode.id, session_id: sessionId, label: fullNode.label,
        status: fullNode.status, layman: fullNode.layman, cause: fullNode.cause,
        expect: fullNode.expect, tech_details: fullNode.techDetails, order: fullNode.order,
        started_at: fullNode.startedAt, completed_at: fullNode.completedAt,
        task_type: fullNode.taskType ?? null,
        tags: fullNode.tags ? JSON.stringify(fullNode.tags) : null,
        embedding: fullNode.embedding ? Buffer.from(fullNode.embedding.buffer) : null,
        full_answer: fullNode.fullAnswer ?? null,
      });
    }
  }

  setActiveNode(sessionId: string, nodeId: string | null): void {
    const graph = this.cache.get(sessionId);
    if (graph) graph.activeNodeId = nodeId;
  }

  recalcProgress(sessionId: string, graph?: SessionGraph): void {
    const g = graph ?? this.cache.get(sessionId);
    if (!g) return;
    const countable = g.nodes.filter((n) => n.status !== "detour");
    if (countable.length === 0) { g.progress = 0; return; }
    const done = countable.filter((n) => n.status === "done").length;
    g.progress = Math.round((done / countable.length) * 100);
  }

  evictFromCache(sessionId: string): void {
    this.cache.delete(sessionId);
  }

  deleteSession(sessionId: string): void {
    this.cache.delete(sessionId);
    this.db.deleteSession(sessionId);
  }

  getDb(): NeuxonDB {
    return this.db;
  }

  saveToDisk(filePath: string): void {
    this.db.saveToFile(filePath);
  }

  destroy(): void {
    this.cache.clear();
    this.db.close();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/graph-store.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Update graph-builder.ts and index.ts to use GraphStore instead of SessionGraphStore**

In `src/graph-builder.ts`, change the import:
```typescript
// Old: import { SessionGraphStore } from "./session-graph-store.js";
import { GraphStore } from "./graph-store.js";
```

Replace all `SessionGraphStore` type references with `GraphStore`. The method signatures are identical so no other changes needed.

In `src/index.ts`, change:
```typescript
// Old: import { SessionGraphStore } from "./session-graph-store.js";
import { GraphStore } from "./graph-store.js";
```

Replace `new SessionGraphStore()` with `new GraphStore()`. Update the type of `store` variable from `SessionGraphStore` to `GraphStore`.

In `src/server.ts`, update imports similarly if `SessionGraphStore` is referenced.

- [ ] **Step 6: Delete old session-graph-store.ts**

```bash
rm src/session-graph-store.ts
```

- [ ] **Step 7: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/graph-store.ts src/__tests__/graph-store.test.ts src/graph-builder.ts src/index.ts src/server.ts
git rm src/session-graph-store.ts
git commit -m "feat: replace SessionGraphStore with persistent GraphStore"
```

---

### Task 5: Step Detector — Parse [TASK] Blocks

**Files:**
- Modify: `src/step-detector.ts`
- Create: `src/__tests__/step-detector.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/step-detector.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { StepDetector } from "../step-detector.js";

describe("StepDetector", () => {
  describe("parseTaskBlock", () => {
    it("parses [TASK type=\"qa\"]", () => {
      const result = StepDetector.parseTaskBlock('[TASK type="qa"]');
      expect(result).toEqual({ type: "qa" });
    });

    it("parses [TASK type=\"creative\"]", () => {
      const result = StepDetector.parseTaskBlock('[TASK type="creative"]');
      expect(result).toEqual({ type: "creative" });
    });

    it("returns null for no match", () => {
      const result = StepDetector.parseTaskBlock("no task block here");
      expect(result).toBeNull();
    });

    it("finds task block in larger text", () => {
      const text = 'Some text\n[TASK type="qa"]\nMore text';
      const result = StepDetector.parseTaskBlock(text);
      expect(result).toEqual({ type: "qa" });
    });
  });

  describe("parseStepBlock", () => {
    it("parses existing [STEP] blocks", () => {
      const text = '[STEP name="Research" why="need info" expect="results"]';
      const result = StepDetector.parseStepBlock(text);
      expect(result).toEqual({ name: "Research", why: "need info", expect: "results" });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify parseTaskBlock fails**

```bash
npx vitest run src/__tests__/step-detector.test.ts
```

Expected: parseTaskBlock tests FAIL (method doesn't exist), parseStepBlock tests PASS.

- [ ] **Step 3: Add parseTaskBlock to step-detector.ts**

Add to `src/step-detector.ts`:

```typescript
import type { StepBlock, TaskBlock } from "./types.js";

const STEP_REGEX =
  /\[STEP\s+name="([^"]+)"\s+why="([^"]+)"\s+expect="([^"]+)"\s*\]/g;

const TASK_REGEX = /\[TASK\s+type="(qa|creative)"\s*\]/;

// ... existing methods unchanged ...

export class StepDetector {
  // ... existing static methods ...

  static parseTaskBlock(text: string): TaskBlock | null {
    const match = TASK_REGEX.exec(text);
    if (!match) return null;
    return { type: match[1] as "qa" | "creative" };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/step-detector.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/step-detector.ts src/__tests__/step-detector.test.ts
git commit -m "feat: add [TASK type] block parsing to StepDetector"
```

---

### Task 6: Knowledge Index — Embedding + Search

**Files:**
- Create: `src/knowledge-index.ts`
- Create: `src/__tests__/knowledge-index.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/knowledge-index.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { KnowledgeIndex } from "../knowledge-index.js";
import { NeuxonDB } from "../db.js";

describe("KnowledgeIndex", () => {
  let db: NeuxonDB;
  let index: KnowledgeIndex;

  afterEach(() => {
    db?.close();
  });

  it("extracts tags from text", () => {
    const tags = KnowledgeIndex.extractTags(
      "Web3 DeFi NFT blockchain news April 2026",
      ["Search Web3", "Fetch Data"],
    );
    expect(tags).toContain("web3");
    expect(tags).toContain("defi");
    expect(tags).toContain("nft");
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.length).toBeLessThanOrEqual(10);
  });

  it("computes cosine similarity", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([1, 0, 0]);
    expect(KnowledgeIndex.cosineSimilarity(a, b)).toBeCloseTo(1.0);

    const c = new Float32Array([0, 1, 0]);
    expect(KnowledgeIndex.cosineSimilarity(a, c)).toBeCloseTo(0.0);
  });

  it("searches by tags when no embeddings available", () => {
    db = new NeuxonDB();
    index = new KnowledgeIndex(db);

    db.upsertSession("s1", "agent", "2026-04-01T00:00:00Z");
    db.upsertNode({
      id: "r1", session_id: "s1", label: "RESULT", status: "done", order: 1,
      tags: JSON.stringify(["web3", "news"]),
      task_type: "qa",
      full_answer: "Web3 is great",
    });

    const results = index.searchByTags(["web3"]);
    expect(results).toHaveLength(1);
    expect(results[0].nodeId).toBe("r1");
    expect(results[0].score).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/knowledge-index.test.ts
```

Expected: FAIL — `KnowledgeIndex` does not exist.

- [ ] **Step 3: Implement knowledge-index.ts**

Create `src/knowledge-index.ts`:

```typescript
import type { NeuxonDB, NodeRow } from "./db.js";
import type { SearchResult } from "./types.js";

export class KnowledgeIndex {
  private db: NeuxonDB;
  private pipeline: any = null;
  private pipelineLoading: Promise<void> | null = null;

  constructor(db: NeuxonDB) {
    this.db = db;
  }

  async initEmbedding(modelName: string): Promise<void> {
    if (this.pipeline || this.pipelineLoading) return;
    this.pipelineLoading = (async () => {
      try {
        const { pipeline } = await import("@xenova/transformers");
        this.pipeline = await pipeline("feature-extraction", modelName);
      } catch (err) {
        console.warn("[neuxon] Failed to load embedding model, falling back to tag-only search:", err);
        this.pipeline = null;
      }
    })();
    await this.pipelineLoading;
  }

  async embed(text: string): Promise<Float32Array | null> {
    if (!this.pipeline) return null;
    const output = await this.pipeline(text, { pooling: "mean", normalize: true });
    return new Float32Array(output.data);
  }

  static extractTags(text: string, stepLabels: string[]): string[] {
    const combined = (text + " " + stepLabels.join(" ")).toLowerCase();
    // Extract meaningful words (3+ chars, not common stop words)
    const stopWords = new Set([
      "the", "and", "for", "that", "this", "with", "from", "are", "was",
      "were", "been", "have", "has", "had", "will", "would", "could",
      "should", "may", "might", "can", "does", "did", "not", "but",
      "its", "all", "any", "each", "just", "more", "than", "into",
      "also", "very", "here", "there", "when", "what", "how", "who",
    ]);
    const words = combined.match(/[a-z0-9]{3,}/g) || [];
    const unique = [...new Set(words)].filter((w) => !stopWords.has(w));
    // Return top 10 most meaningful (longest first as heuristic)
    return unique.sort((a, b) => b.length - a.length).slice(0, 10);
  }

  static cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
  }

  async search(queryText: string, topK: number = 5): Promise<SearchResult[]> {
    const queryEmbedding = await this.embed(queryText);
    const resultNodes = this.db.getResultNodesWithEmbeddings();

    if (queryEmbedding && resultNodes.length > 0) {
      return this.searchByEmbedding(queryEmbedding, resultNodes, queryText, topK);
    }

    // Fallback: tag-based search
    const queryTags = KnowledgeIndex.extractTags(queryText, []);
    return this.searchByTags(queryTags, topK);
  }

  private searchByEmbedding(
    queryEmbedding: Float32Array,
    nodes: NodeRow[],
    queryText: string,
    topK: number,
  ): SearchResult[] {
    const queryTags = KnowledgeIndex.extractTags(queryText, []);

    const scored = nodes.map((node) => {
      const nodeEmbedding = new Float32Array(
        (node.embedding as Buffer).buffer,
        (node.embedding as Buffer).byteOffset,
        (node.embedding as Buffer).byteLength / 4,
      );
      let score = KnowledgeIndex.cosineSimilarity(queryEmbedding, nodeEmbedding);

      // Boost with tag overlap
      const nodeTags: string[] = node.tags ? JSON.parse(node.tags) : [];
      const tagOverlap = queryTags.filter((t) => nodeTags.includes(t)).length;
      if (nodeTags.length > 0 && tagOverlap > 0) {
        score += (tagOverlap / nodeTags.length) * 0.1;
      }

      return {
        nodeId: node.id,
        sessionId: node.session_id,
        label: node.label,
        score: Math.min(1, score),
        taskType: node.task_type as "qa" | "creative" | null,
        tags: nodeTags,
        fullAnswer: node.full_answer,
        createdAt: node.started_at ?? "",
      };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  searchByTags(queryTags: string[], topK: number = 5): SearchResult[] {
    const allResults = this.db.getResultNodesWithEmbeddings();
    // Also get RESULT nodes without embeddings for tag search
    const result = this.db.exec(
      "SELECT * FROM nodes WHERE label = 'RESULT'",
    );
    const allNodes: NodeRow[] = result.length > 0
      ? result[0].values.map((row: any) => {
          const obj: any = {};
          result[0].columns.forEach((col: string, i: number) => { obj[col] = row[i]; });
          return obj;
        })
      : [];

    const scored = allNodes.map((node) => {
      const nodeTags: string[] = node.tags ? JSON.parse(node.tags) : [];
      const overlap = queryTags.filter((t) => nodeTags.includes(t)).length;
      const score = nodeTags.length > 0 ? overlap / Math.max(queryTags.length, nodeTags.length) : 0;

      return {
        nodeId: node.id,
        sessionId: node.session_id,
        label: node.label,
        score,
        taskType: node.task_type as "qa" | "creative" | null,
        tags: nodeTags,
        fullAnswer: node.full_answer,
        createdAt: node.started_at ?? "",
      };
    });

    return scored
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}
```

Note: The `searchByTags` method accesses `this.db.exec` directly — we need to expose that. Add to `db.ts`:

```typescript
exec(sql: string, params?: any[]): any[] {
  return this.db.exec(sql, params);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/knowledge-index.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/knowledge-index.ts src/__tests__/knowledge-index.test.ts src/db.ts
git commit -m "feat: add KnowledgeIndex with embedding + tag search"
```

---

### Task 7: Context Engine — Cache/Inject/Skip

**Files:**
- Create: `src/context-engine.ts`
- Create: `src/__tests__/context-engine.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/context-engine.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { ContextEngine, type ContextDecision } from "../context-engine.js";
import type { SearchResult } from "../types.js";

describe("ContextEngine", () => {
  it("returns cache-hit for high score QA result", () => {
    const engine = new ContextEngine(0.85, 0.5);
    const results: SearchResult[] = [{
      nodeId: "r1", sessionId: "s1", label: "RESULT",
      score: 0.92, taskType: "qa",
      tags: ["web3"], fullAnswer: "Web3 answer here",
      createdAt: "2026-04-01T00:00:00Z",
    }];
    const decision = engine.decide(results);
    expect(decision.action).toBe("cache-hit");
    expect(decision.result!.nodeId).toBe("r1");
  });

  it("returns inject for creative task even with high score", () => {
    const engine = new ContextEngine(0.85, 0.5);
    const results: SearchResult[] = [{
      nodeId: "r1", sessionId: "s1", label: "RESULT",
      score: 0.95, taskType: "creative",
      tags: ["design"], fullAnswer: "Design plan",
      createdAt: "2026-04-01T00:00:00Z",
    }];
    const decision = engine.decide(results);
    expect(decision.action).toBe("inject");
  });

  it("returns inject for medium score QA", () => {
    const engine = new ContextEngine(0.85, 0.5);
    const results: SearchResult[] = [{
      nodeId: "r1", sessionId: "s1", label: "RESULT",
      score: 0.7, taskType: "qa",
      tags: ["web3"], fullAnswer: "Partial answer",
      createdAt: "2026-04-01T00:00:00Z",
    }];
    const decision = engine.decide(results);
    expect(decision.action).toBe("inject");
  });

  it("returns skip for low score", () => {
    const engine = new ContextEngine(0.85, 0.5);
    const results: SearchResult[] = [{
      nodeId: "r1", sessionId: "s1", label: "RESULT",
      score: 0.3, taskType: "qa",
      tags: ["unrelated"], fullAnswer: "Unrelated",
      createdAt: "2026-04-01T00:00:00Z",
    }];
    const decision = engine.decide(results);
    expect(decision.action).toBe("skip");
  });

  it("returns skip for empty results", () => {
    const engine = new ContextEngine(0.85, 0.5);
    const decision = engine.decide([]);
    expect(decision.action).toBe("skip");
  });

  it("formats inject text correctly", () => {
    const engine = new ContextEngine(0.85, 0.5);
    const result: SearchResult = {
      nodeId: "r1", sessionId: "s1", label: "RESULT",
      score: 0.7, taskType: "qa",
      tags: ["web3", "news"], fullAnswer: "Web3 is evolving",
      createdAt: "2026-04-01T10:00:00Z",
    };
    const text = engine.formatInjectText(result);
    expect(text).toContain("[Neuxon Context]");
    expect(text).toContain("s1");
    expect(text).toContain("#web3");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/context-engine.test.ts
```

Expected: FAIL — `ContextEngine` does not exist.

- [ ] **Step 3: Implement context-engine.ts**

Create `src/context-engine.ts`:

```typescript
import type { SearchResult } from "./types.js";

export interface ContextDecision {
  action: "cache-hit" | "inject" | "skip";
  result?: SearchResult;
  injectText?: string;
}

export class ContextEngine {
  private cacheThreshold: number;
  private injectThreshold: number;

  constructor(cacheThreshold: number = 0.85, injectThreshold: number = 0.5) {
    this.cacheThreshold = cacheThreshold;
    this.injectThreshold = injectThreshold;
  }

  decide(results: SearchResult[]): ContextDecision {
    if (results.length === 0) {
      return { action: "skip" };
    }

    const best = results[0];

    // High score + QA = cache hit (return stored answer directly)
    if (best.score >= this.cacheThreshold && best.taskType === "qa") {
      return { action: "cache-hit", result: best };
    }

    // Medium score OR creative task = inject context
    if (best.score >= this.injectThreshold) {
      return {
        action: "inject",
        result: best,
        injectText: this.formatInjectText(best),
      };
    }

    // Low score = skip
    return { action: "skip" };
  }

  formatInjectText(result: SearchResult): string {
    const tags = result.tags.map((t) => `#${t}`).join(" ");
    const summary = result.fullAnswer
      ? result.fullAnswer.length > 300
        ? result.fullAnswer.slice(0, 297) + "..."
        : result.fullAnswer
      : "(no answer stored)";
    const timeAgo = this.timeAgo(result.createdAt);

    return `[Neuxon Context] Previously on this topic:
- Session ${result.sessionId.slice(0, 8)} (${timeAgo}): ${summary}
- Tags: ${tags}
Use this as background. Don't repeat the same research.`;
  }

  formatCacheHitResponse(result: SearchResult): string {
    const timeAgo = this.timeAgo(result.createdAt);
    return `${result.fullAnswer ?? "(no answer stored)"}

---
_From session #${result.sessionId.slice(0, 8)} (${timeAgo}) — type /neuxon refresh to re-research_`;
  }

  private timeAgo(isoDate: string): string {
    const diff = Date.now() - new Date(isoDate).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/context-engine.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/context-engine.ts src/__tests__/context-engine.test.ts
git commit -m "feat: add ContextEngine with cache-hit/inject/skip decision"
```

---

### Task 8: Wire Everything Into Plugin Entry

**Files:**
- Modify: `src/index.ts`
- Modify: `src/graph-builder.ts`

- [ ] **Step 1: Update STEP_INJECTION_PROMPT to include [TASK] classification**

In `src/index.ts`, update the prompt:

```typescript
const STEP_INJECTION_PROMPT = `[System — Neuxon Progress Tracker]

Declare each distinct phase of your work with a [STEP] block:

[STEP name="<short name>" why="<why this step, in simple terms>" expect="<what the user will get when done>"]

Also classify your overall task type:
[TASK type="qa"] — for factual lookups, searches, questions with definitive answers
[TASK type="creative"] — for brainstorming, design, writing, planning, coding

Rules:
- Declare a [STEP] for EVERY distinct phase: planning, researching, analyzing, searching, reading, writing, testing, summarizing, etc.
- Write "name" as a short action (e.g., "Plan Approach", "Search Sources", "Analyze Results", "Write Summary", "Review Code")
- Write "why" explaining the reason a non-technical person would understand
- Write "expect" describing the visible result in plain terms
- Declare 3-8 steps per task — break work into meaningful phases
- Declare a new [STEP] BEFORE each phase starts, not after
- Declare [TASK type="..."] once at the start of your response
- You can declare steps mid-response — just include the [STEP] block in your output`;
```

- [ ] **Step 2: Update plugin setup to initialize persistence + knowledge modules**

In `src/index.ts`, update the `setup` function:

```typescript
import { GraphStore } from "./graph-store.js";
import { KnowledgeIndex } from "./knowledge-index.js";
import { ContextEngine } from "./context-engine.js";
import { StepDetector } from "./step-detector.js";
import path from "node:path";
```

In the `setup()` function body, replace `store = new SessionGraphStore()` with:

```typescript
// Initialize persistent store
const dataDir = ctx.storage?.getPath?.() ?? "";
const dbPath = dataDir ? path.join(dataDir, "neuxon.db") : undefined;
if (dbPath) {
  store = await GraphStore.createWithFile(dbPath);
} else {
  store = new GraphStore(); // in-memory fallback
}

// Initialize knowledge index
const knowledgeIndex = new KnowledgeIndex(store.getDb());
const embeddingModel = config.embeddingModel ?? "Xenova/all-MiniLM-L6-v2";
knowledgeIndex.initEmbedding(embeddingModel).catch((err) => {
  ctx.log.warn(`[neuxon] Embedding model failed to load: ${err}`);
});

// Initialize context engine
const contextEngine = new ContextEngine(
  config.cacheHitThreshold ?? 0.85,
  config.injectThreshold ?? 0.5,
);
```

- [ ] **Step 3: Add context engine middleware (before the existing beforePrompt middleware)**

```typescript
// Context engine: search prior knowledge before sending to AI
ctx.registerMiddleware("agent:beforePrompt", {
  priority: 40, // Before the STEP injection at 45
  handler: async (payload, next) => {
    if (!payload.sessionId || !payload.text) return next();

    const results = await knowledgeIndex.search(payload.text, 3);
    const decision = contextEngine.decide(results);

    if (decision.action === "cache-hit" && decision.result) {
      ctx.log.info(`[neuxon] Cache hit for session ${payload.sessionId}, returning stored result`);
      // Return cached result directly — skip AI
      payload.response = contextEngine.formatCacheHitResponse(decision.result);
      payload.skipAI = true;
      return next();
    }

    if (decision.action === "inject" && decision.injectText) {
      ctx.log.info(`[neuxon] Injecting prior context for session ${payload.sessionId}`);
      payload.text = `${decision.injectText}\n\n---\n\n${payload.text}`;
    }

    return next();
  },
});
```

- [ ] **Step 4: Update turn:end handler to index RESULT nodes**

After the existing `builder!.handleTurnEnd(...)` call, add:

```typescript
// Index the RESULT node for future search
const graph = store!.get(payload.sessionId);
if (graph) {
  const resultNode = graph.nodes.find((n) => n.label === "RESULT" && n.fullAnswer);
  if (resultNode) {
    // Parse task type from response
    const taskBlock = StepDetector.parseTaskBlock(fullResponse);
    if (taskBlock) {
      resultNode.taskType = taskBlock.type;
    }

    // Extract tags from step labels
    const stepLabels = graph.nodes
      .filter((n) => n.label !== "INIT" && n.label !== "RESULT")
      .map((n) => n.label);
    resultNode.tags = KnowledgeIndex.extractTags(
      resultNode.fullAnswer ?? "",
      stepLabels,
    );

    // Generate embedding async
    knowledgeIndex.embed(resultNode.fullAnswer ?? "").then((emb) => {
      if (emb) {
        resultNode.embedding = emb;
        store!.updateNode(payload.sessionId, resultNode.id, {
          taskType: resultNode.taskType,
          tags: resultNode.tags,
          embedding: emb,
        });
      }
    });

    // Persist immediately (tags + taskType, embedding comes async)
    store!.updateNode(payload.sessionId, resultNode.id, {
      taskType: resultNode.taskType,
      tags: resultNode.tags,
    });
  }

  // Save DB to disk periodically
  if (dbPath) {
    store!.saveToDisk(dbPath);
  }
}
```

- [ ] **Step 5: Update graph-builder to store fullAnswer on RESULT nodes**

In `src/graph-builder.ts`, in the `handleTurnEnd` method where `resultNode` is created, add the `fullAnswer` field (already partially done but ensure it uses the new type field):

```typescript
const resultNode: GraphNode = {
  // ... existing fields ...
  fullAnswer: cleanResponse || null,
};
```

- [ ] **Step 6: Update settings schema**

In `src/index.ts`, update the `settingsSchema`:

```typescript
const settingsSchema = z.object({
  port: z.number().int().min(1024).max(65535).default(3200),
  autoInjectPrompt: z.boolean().default(true),
  maxNodesPerSession: z.number().int().min(5).max(200).default(50),
  persistence: z.boolean().default(true),
  cacheHitThreshold: z.number().min(0).max(1).default(0.85),
  injectThreshold: z.number().min(0).max(1).default(0.5),
  embeddingModel: z.string().default("Xenova/all-MiniLM-L6-v2"),
});
```

- [ ] **Step 7: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/index.ts src/graph-builder.ts
git commit -m "feat: wire knowledge index + context engine into plugin"
```

---

### Task 9: New Commands — recall, refresh, forget

**Files:**
- Modify: `src/neuxon-command.ts`

- [ ] **Step 1: Add recall command handler**

In `src/neuxon-command.ts`, update the handler to support new subcommands. The function needs access to `KnowledgeIndex` and `GraphStore`:

```typescript
import type { GraphStore } from "./graph-store.js";
import type { KnowledgeIndex } from "./knowledge-index.js";

export function createNeuxonCommand(
  store: GraphStore,
  getUrl: () => string,
  knowledgeIndex?: KnowledgeIndex,
): NeuxonCommandDef {
  return {
    // ... existing name, description, usage, category ...
    usage: "[status | sessions | recall <topic> | refresh | forget <sessionId>]",

    async handler(args) {
      const subcommand = (args.text ?? "").trim().toLowerCase();

      // ... existing handlers for "", "sessions", "status" ...

      if (subcommand.startsWith("recall")) {
        const topic = (args.text ?? "").replace(/^recall\s*/i, "").trim();
        if (!topic) {
          return { type: "text", text: "Usage: `/neuxon recall <topic>`" };
        }
        if (!knowledgeIndex) {
          return { type: "text", text: "Knowledge index not available." };
        }
        const results = await knowledgeIndex.search(topic, 5);
        if (results.length === 0) {
          return { type: "text", text: `No prior knowledge found for "${topic}".` };
        }
        const lines = results.map((r, i) =>
          `${i + 1}. **Session ${r.sessionId.slice(0, 8)}** (score: ${(r.score * 100).toFixed(0)}%) — ${r.tags.map(t => `#${t}`).join(" ")}\n   ${(r.fullAnswer ?? "").slice(0, 100)}...`
        );
        return {
          type: "text",
          text: `**Neuxon Recall: "${topic}"**\n\n${lines.join("\n\n")}`,
        };
      }

      if (subcommand.startsWith("forget")) {
        const sid = (args.text ?? "").replace(/^forget\s*/i, "").trim();
        if (!sid) {
          return { type: "text", text: "Usage: `/neuxon forget <sessionId>`" };
        }
        store.deleteSession(sid);
        return { type: "text", text: `Deleted knowledge for session ${sid}.` };
      }

      if (subcommand === "refresh") {
        return { type: "text", text: "Refresh: re-send your last message and Neuxon will skip the cache." };
      }

      // Default: show link (existing)
      // ...
    },
  };
}
```

- [ ] **Step 2: Update command registration in index.ts**

In `src/index.ts`, pass `knowledgeIndex` to `createNeuxonCommand`:

```typescript
ctx.registerCommand(
  createNeuxonCommand(store as GraphStore, getUrl, knowledgeIndex) as any,
);
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/neuxon-command.ts src/index.ts
git commit -m "feat: add /neuxon recall, forget, refresh commands"
```

---

### Task 10: Dashboard — CACHE Node + Session Count

**Files:**
- Modify: `src/templates/dashboard.ts`
- Modify: `src/server.ts`

- [ ] **Step 1: Add CACHE node color to PALETTE**

In the dashboard's PALETTE object, add:

```javascript
cache: { fill:'#22d3ee', bg:'#0a1a20', text:'#22d3ee', glow:'#22d3ee30' },
```

- [ ] **Step 2: Update drawNode to use cache palette**

In `drawNode`, update the palette selection:

```javascript
const isResult = n.label === 'RESULT';
const isCache = n.label === 'CACHED';
const pal = isCache ? PALETTE.cache : isResult ? PALETTE.result : (PALETTE[n.status] || PALETTE.pending);
```

- [ ] **Step 3: Add session count to topbar**

Update the topbar HTML to include a session count badge:

```html
<span id="session-count"></span>
```

And after loading data, update it:

```javascript
fetch('/api/sessions').then(r => r.json()).then(data => {
  const el = document.getElementById('session-count');
  if (el) el.textContent = (data.sessions?.length ?? 0) + ' sessions';
});
```

- [ ] **Step 4: Update server.ts to serve historical sessions from SQLite**

In `src/server.ts`, update the `/api/sessions` handler to use `store.list()` which now includes SQLite sessions.

- [ ] **Step 5: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/templates/dashboard.ts src/server.ts
git commit -m "feat: add CACHE node styling and session count to dashboard"
```

---

### Task 11: Integration Test + Final Verification

**Files:**
- Run all tests and verify full build

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass (db, graph-store, step-detector, knowledge-index, context-engine).

- [ ] **Step 2: Full build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 4: Manual smoke test**

Start dev instance with the plugin and verify:
1. Graph persists after restart (check `neuxon.db` file exists)
2. `/neuxon sessions` shows historical sessions
3. `/neuxon recall <topic>` returns results from prior sessions
4. Dashboard loads historical data on page refresh

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: integration verification — all tests pass, build clean"
```
