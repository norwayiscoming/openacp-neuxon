# Neuxon Knowledge Graph — Design Spec

## Problem

Neuxon currently stores AI session graphs in-memory only. When the instance restarts, all data is lost. Sessions are isolated — a new session has zero knowledge of what previous sessions discovered. This leads to redundant work: the AI re-searches the same topics, re-reads the same files, and burns tokens on information it already found.

## Solution

Evolve Neuxon from a visualization tool into a **persistent knowledge graph** that:

1. Persists graph data across restarts (SQLite via sql.js)
2. Indexes RESULT nodes with local embeddings for semantic search
3. Auto-classifies tasks as QA vs creative
4. For QA tasks with high similarity matches: returns cached results directly
5. For creative tasks or medium matches: injects prior knowledge as context
6. Provides manual commands for recall, refresh, and cleanup

## Architecture

### Approach: Layered modules in a single plugin

All functionality stays in `openacp-neuxon`. Internal modules have clear boundaries:

```
src/
  index.ts                  — plugin entry, wires everything together
  types.ts                  — shared types (GraphNode, GraphEdge, etc.)

  # Existing (refactored)
  graph-builder.ts          — creates nodes/edges from agent events
  step-detector.ts          — parses [STEP] + [TASK] blocks
  server.ts                 — HTTP + SSE endpoints
  neuxon-command.ts         — /neuxon commands (add recall, refresh, forget)
  templates/dashboard.ts    — browser dashboard

  # New
  db.ts                     — sql.js wrapper, schema init, migrations
  graph-store.ts            — replaces SessionGraphStore, SQLite + in-memory cache
  knowledge-index.ts        — local embedding, tag extraction, similarity search
  context-engine.ts         — task classification, cache/inject/skip decision
```

### New Dependencies

- `sql.js` — SQLite compiled to WebAssembly, pure JS, no native build tools needed
- `@xenova/transformers` — local ONNX-based embedding model (`all-MiniLM-L6-v2`, ~22MB, auto-downloaded on first run)

No API keys required. Everything runs locally and offline.

## Data Model

### SQLite Schema (`neuxon.db`)

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  agent_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  label TEXT NOT NULL,
  status TEXT NOT NULL,          -- done/active/detour/pending
  layman TEXT,                   -- plain language explanation
  cause TEXT,
  expect TEXT,
  tech_details TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,

  -- Knowledge graph fields
  task_type TEXT,                -- "qa" | "creative" | null
  tags TEXT,                     -- JSON array: ["web3","news","defi"]
  embedding BLOB,               -- float32 vector (384 dims, ~1.5KB)
  full_answer TEXT               -- complete AI response (RESULT nodes only)
);

CREATE TABLE edges (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  from_id TEXT NOT NULL REFERENCES nodes(id),
  to_id TEXT NOT NULL REFERENCES nodes(id),
  label TEXT,
  type TEXT NOT NULL DEFAULT 'normal'   -- normal/detour
);

CREATE TABLE activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id TEXT NOT NULL REFERENCES nodes(id),
  time TEXT NOT NULL,
  action TEXT,
  text TEXT
);

CREATE INDEX idx_nodes_session ON nodes(session_id);
CREATE INDEX idx_nodes_task_type ON nodes(task_type);
CREATE INDEX idx_edges_session ON edges(session_id);
CREATE INDEX idx_activity_node ON activity(node_id);
```

### In-Memory Cache

`graph-store.ts` maintains a `Map<string, SessionGraph>` for active sessions (same as current `SessionGraphStore`). All writes go to both memory and SQLite. Reads for active sessions come from memory; reads for historical sessions come from SQLite.

## Knowledge Index

### Module: `knowledge-index.ts`

**On turn end (RESULT node created):**

1. AI has classified task type via `[TASK type="qa"|"creative"]` in its response
2. Extract tags from [STEP] labels + RESULT content
3. Generate embedding locally via `@xenova/transformers` pipeline (`all-MiniLM-L6-v2`, ~50ms per call)
4. Store embedding + tags in SQLite node row

**On search (new user message):**

1. Embed user message locally (~50ms)
2. Load all RESULT node embeddings from SQLite
3. Compute cosine similarity
4. Boost score with tag overlap
5. Return top-K results with scores

**Fallback:** If embedding model fails to load, fall back to tag-only keyword matching. The system degrades gracefully — no hard dependency on the ML model for core functionality.

## Context Engine

### Module: `context-engine.ts`

**Decision flow on new user message:**

```
User message arrives
    |
    v
Embed message locally (~50ms)
    |
    v
Search RESULT embeddings in SQLite (cosine similarity + tag boost)
    |
    v
Best match found?
    |
    +-- Score > 0.85 AND task_type = "qa"
    |     --> CACHE HIT: return stored RESULT directly
    |     --> Show: "From session #xxx (2h ago) — /neuxon refresh to re-research"
    |
    +-- Score 0.5-0.85 OR task_type = "creative"
    |     --> INJECT: add summary to prompt via agent:beforePrompt middleware
    |     --> Format: "[Neuxon Context] Previously on this topic:
    |                   - Session #xxx (2h ago): <summary ~200 chars>
    |                   - Tags: #web3 #defi
    |                   Use this as background. Don't repeat the same research."
    |
    +-- Score < 0.5
          --> SKIP: no injection, AI works normally
```

### Task Classification

Added to the existing STEP_INJECTION_PROMPT:

```
Also classify your overall task type with a [TASK] block:
[TASK type="qa"] — for factual lookups, searches, questions with definitive answers
[TASK type="creative"] — for brainstorming, design, writing, planning, coding
```

Parsed by `step-detector.ts` alongside existing `[STEP]` parsing.

### Cache Hit Behavior

When a QA cache hit occurs:
- The middleware intercepts before the prompt reaches the AI
- Returns the stored RESULT directly to the user via the messaging adapter
- Adds a footer: "From session #xxx (2h ago) — type /neuxon refresh to re-research"
- Graph dashboard shows a "CACHE" node linking back to the original RESULT
- Token cost: ~0 (no AI call made)

## Commands

Existing commands updated + new ones:

| Command | Description |
|---------|-------------|
| `/neuxon` | Show dashboard link |
| `/neuxon status` | Current session progress |
| `/neuxon sessions` | List all sessions |
| `/neuxon recall <topic>` | Search knowledge graph, show top matches |
| `/neuxon refresh` | Re-run last cached result with fresh AI call |
| `/neuxon forget <sessionId>` | Delete a session's knowledge from the graph |

## Dashboard Updates

The existing dashboard continues to work as-is. Additional enhancements:

- CACHE HIT nodes shown with distinct color (cyan) and label "CACHED"
- Historical sessions loadable from SQLite (not just in-memory)
- Session count badge in topbar showing total persisted sessions

## Settings

```typescript
const settingsSchema = z.object({
  port: z.number().int().min(1024).max(65535).default(3200),
  autoInjectPrompt: z.boolean().default(true),
  maxNodesPerSession: z.number().int().min(5).max(200).default(50),

  // Knowledge graph settings (new)
  persistence: z.boolean().default(true),
  cacheHitThreshold: z.number().min(0).max(1).default(0.85),
  injectThreshold: z.number().min(0).max(1).default(0.5),
  embeddingModel: z.string().default("Xenova/all-MiniLM-L6-v2"),
});
```

## Migration Path

1. Existing `SessionGraphStore` replaced by `graph-store.ts` — same in-memory interface, adds SQLite behind it
2. No breaking changes to existing graph-builder, server, or dashboard
3. Knowledge features (embedding, context engine) are additive — they enhance but don't modify existing flows
4. If SQLite or embedding fails to init, plugin falls back to current in-memory-only behavior

## Out of Scope

- Multi-user graph sharing (each instance has its own neuxon.db)
- Graph merging across different machines
- Custom embedding model training
- Full-text search within RESULT content (embedding search is sufficient)
