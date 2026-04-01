import { describe, it, expect, afterEach } from "vitest";
import { NeuxonDB } from "../db.js";

describe("NeuxonDB", () => {
  let db: NeuxonDB;

  afterEach(() => {
    db?.close();
  });

  it("initializes in-memory and creates tables", async () => {
    db = await NeuxonDB.create();
    const tables = db.listTables();
    expect(tables).toContain("sessions");
    expect(tables).toContain("nodes");
    expect(tables).toContain("edges");
    expect(tables).toContain("activity");
  });

  it("inserts and retrieves a session", async () => {
    db = await NeuxonDB.create();
    db.upsertSession("s1", "agent-1", "2026-04-01T00:00:00Z");
    const session = db.getSession("s1");
    expect(session).not.toBeNull();
    expect(session!.agent_name).toBe("agent-1");
  });

  it("inserts and retrieves nodes", async () => {
    db = await NeuxonDB.create();
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

  it("inserts and retrieves edges", async () => {
    db = await NeuxonDB.create();
    db.upsertSession("s1", "agent-1", "2026-04-01T00:00:00Z");
    db.upsertNode({ id: "n1", session_id: "s1", label: "A", status: "done", order: 0 });
    db.upsertNode({ id: "n2", session_id: "s1", label: "B", status: "done", order: 1 });
    db.upsertEdge({ id: "e1", session_id: "s1", from_id: "n1", to_id: "n2", label: "leads to", type: "normal" });
    const edges = db.getEdgesBySession("s1");
    expect(edges).toHaveLength(1);
    expect(edges[0].from_id).toBe("n1");
  });

  it("stores and retrieves embedding as Float32Array", async () => {
    db = await NeuxonDB.create();
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
    const tagsStr = results[0].tags;
    expect(tagsStr).toBe('["web3","news"]');
    const retrieved = new Float32Array(
      (results[0].embedding as Uint8Array).buffer,
      (results[0].embedding as Uint8Array).byteOffset,
      (results[0].embedding as Uint8Array).byteLength / 4,
    );
    expect(retrieved[0]).toBeCloseTo(0.1);
  });

  it("deletes a session and its data", async () => {
    db = await NeuxonDB.create();
    db.upsertSession("s1", "agent-1", "2026-04-01T00:00:00Z");
    db.upsertNode({ id: "n1", session_id: "s1", label: "A", status: "done", order: 0 });
    db.deleteSession("s1");
    expect(db.getSession("s1")).toBeNull();
    expect(db.getNodesBySession("s1")).toHaveLength(0);
  });
});
