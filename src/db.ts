import initSqlJs from "sql.js";
import type { Database, SqlJsStatic } from "sql.js";
import { readFileSync, writeFileSync } from "node:fs";

// ---------- row shapes ----------

export interface SessionRow {
  id: string;
  agent_name: string;
  created_at: string;
  updated_at: string;
}

export interface NodeRow {
  id: string;
  session_id: string;
  label: string;
  status: string;
  layman?: string | null;
  cause?: string | null;
  expect?: string | null;
  tech_details?: string | null;
  order: number;
  started_at?: string | null;
  completed_at?: string | null;
  task_type?: string | null;
  tags?: string | null;
  embedding?: Buffer | Uint8Array | null;
  full_answer?: string | null;
}

export interface EdgeRow {
  id: string;
  session_id: string;
  from_id: string;
  to_id: string;
  label?: string | null;
  type: string;
}

export interface ActivityRow {
  id?: number;
  node_id: string;
  time: string;
  action?: string | null;
  text?: string | null;
}

// ---------- schema ----------

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

// ---------- helpers ----------

let _SQL: SqlJsStatic | null = null;

async function getSql(): Promise<SqlJsStatic> {
  if (_SQL) return _SQL;
  _SQL = await initSqlJs();
  return _SQL;
}

/** Map a sql.js result row (array of values) to a plain object keyed by column names. */
function rowToObject<T>(columns: string[], values: unknown[]): T {
  const obj: Record<string, unknown> = {};
  for (let i = 0; i < columns.length; i++) {
    obj[columns[i]] = values[i];
  }
  return obj as T;
}

// ---------- NeuxonDB ----------

export class NeuxonDB {
  private _db: Database;
  private _filePath: string | undefined;

  private constructor(db: Database, filePath?: string) {
    this._db = db;
    this._filePath = filePath;
  }

  // ---- factory ----

  static async create(filePath?: string): Promise<NeuxonDB> {
    const SQL = await getSql();
    let db: Database;
    if (filePath) {
      try {
        const data = readFileSync(filePath);
        db = new SQL.Database(data);
      } catch {
        db = new SQL.Database();
      }
    } else {
      db = new SQL.Database();
    }
    db.run(SCHEMA);
    return new NeuxonDB(db, filePath);
  }

  // ---- raw exec ----

  /** Execute a SQL statement with optional bound parameters. Returns result rows. */
  exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }> {
    if (params && params.length > 0) {
      // For parameterised queries use a prepared statement and collect results manually
      const stmt = this._db.prepare(sql);
      stmt.bind(params as any[]);
      const columns = stmt.getColumnNames();
      const rows: unknown[][] = [];
      while (stmt.step()) {
        rows.push(stmt.get() as unknown[]);
      }
      stmt.free();
      if (columns.length === 0 && rows.length === 0) return [];
      return [{ columns, values: rows }];
    }
    return this._db.exec(sql) as Array<{ columns: string[]; values: unknown[][] }>;
  }

  // ---- schema helpers ----

  listTables(): string[] {
    const result = this.exec("SELECT name FROM sqlite_master WHERE type='table'");
    if (!result.length) return [];
    return result[0].values.map((row) => row[0] as string);
  }

  // ---- sessions ----

  upsertSession(id: string, agentName: string, createdAt: string): void {
    const now = new Date().toISOString();
    this._db.run(
      `INSERT INTO sessions (id, agent_name, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET agent_name=excluded.agent_name, updated_at=excluded.updated_at`,
      [id, agentName, createdAt, now],
    );
  }

  getSession(id: string): SessionRow | null {
    const stmt = this._db.prepare("SELECT * FROM sessions WHERE id = ?");
    stmt.bind([id]);
    if (stmt.step()) {
      const obj = stmt.getAsObject() as unknown as SessionRow;
      stmt.free();
      return obj;
    }
    stmt.free();
    return null;
  }

  listSessions(): SessionRow[] {
    const result = this.exec("SELECT * FROM sessions ORDER BY created_at DESC");
    if (!result.length) return [];
    return result[0].values.map((row) => rowToObject<SessionRow>(result[0].columns, row));
  }

  deleteSession(id: string): void {
    this._db.run("DELETE FROM nodes WHERE session_id = ?", [id]);
    this._db.run("DELETE FROM edges WHERE session_id = ?", [id]);
    this._db.run("DELETE FROM sessions WHERE id = ?", [id]);
  }

  // ---- nodes ----

  upsertNode(node: NodeRow): void {
    this._db.run(
      `INSERT INTO nodes
         (id, session_id, label, status, layman, cause, expect, tech_details, "order",
          started_at, completed_at, task_type, tags, embedding, full_answer)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         label=excluded.label, status=excluded.status, layman=excluded.layman,
         cause=excluded.cause, expect=excluded.expect, tech_details=excluded.tech_details,
         "order"=excluded."order", started_at=excluded.started_at,
         completed_at=excluded.completed_at, task_type=excluded.task_type,
         tags=excluded.tags, embedding=excluded.embedding, full_answer=excluded.full_answer`,
      [
        node.id,
        node.session_id,
        node.label,
        node.status,
        node.layman ?? null,
        node.cause ?? null,
        node.expect ?? null,
        node.tech_details ?? null,
        node.order,
        node.started_at ?? null,
        node.completed_at ?? null,
        node.task_type ?? null,
        node.tags ?? null,
        node.embedding ? (node.embedding instanceof Uint8Array ? node.embedding : new Uint8Array(node.embedding)) : null,
        node.full_answer ?? null,
      ],
    );
  }

  getNodesBySession(sessionId: string): NodeRow[] {
    const result = this.exec(`SELECT * FROM nodes WHERE session_id = ? ORDER BY "order" ASC`, [sessionId]);
    if (!result.length) return [];
    return result[0].values.map((row) => rowToObject<NodeRow>(result[0].columns, row));
  }

  /** Returns nodes that have a non-null embedding (RESULT nodes for knowledge index). */
  getResultNodesWithEmbeddings(): NodeRow[] {
    const result = this.exec(
      `SELECT n.*, s.created_at AS session_created_at
       FROM nodes n
       JOIN sessions s ON n.session_id = s.id
       WHERE n.embedding IS NOT NULL`,
    );
    if (!result.length) return [];
    return result[0].values.map((row) => rowToObject<NodeRow>(result[0].columns, row));
  }

  // ---- edges ----

  upsertEdge(edge: EdgeRow): void {
    this._db.run(
      `INSERT INTO edges (id, session_id, from_id, to_id, label, type)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         label=excluded.label, type=excluded.type`,
      [edge.id, edge.session_id, edge.from_id, edge.to_id, edge.label ?? null, edge.type],
    );
  }

  getEdgesBySession(sessionId: string): EdgeRow[] {
    const result = this.exec("SELECT * FROM edges WHERE session_id = ?", [sessionId]);
    if (!result.length) return [];
    return result[0].values.map((row) => rowToObject<EdgeRow>(result[0].columns, row));
  }

  // ---- activity ----

  addActivity(entry: ActivityRow): void {
    this._db.run(
      `INSERT INTO activity (node_id, time, action, text) VALUES (?, ?, ?, ?)`,
      [entry.node_id, entry.time, entry.action ?? null, entry.text ?? null],
    );
  }

  getActivitiesByNode(nodeId: string): ActivityRow[] {
    const result = this.exec("SELECT * FROM activity WHERE node_id = ? ORDER BY id ASC", [nodeId]);
    if (!result.length) return [];
    return result[0].values.map((row) => rowToObject<ActivityRow>(result[0].columns, row));
  }

  // ---- persistence ----

  saveToFile(filePath?: string): void {
    const target = filePath ?? this._filePath;
    if (!target) throw new Error("No file path provided for saveToFile");
    const data = this._db.export();
    writeFileSync(target, Buffer.from(data));
  }

  close(): void {
    this._db.close();
  }
}
