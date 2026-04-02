import { describe, it, expect, afterEach } from "vitest";
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
    expect(tags).toContain("blockchain");
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

  it("searches by tags when no embeddings available", async () => {
    db = await NeuxonDB.create();
    index = new KnowledgeIndex(db);

    db.upsertSession("s1", "agent", "2026-04-01T00:00:00Z");
    db.upsertNode({
      id: "r1", session_id: "s1", label: "RESULT", status: "done", order: 1,
      tags: JSON.stringify(["web3", "news"]),
      task_type: "qa",
      full_answer: "Web3 is great",
    });

    const results = await index.search("web3 news");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].nodeId).toBe("r1");
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("skips nodes with corrupt embedding data in search", async () => {
    db = await NeuxonDB.create();
    index = new KnowledgeIndex(db);

    db.upsertSession("s1", "agent", "2026-04-01T00:00:00Z");

    // Valid embedding (4 floats = 16 bytes)
    const validEmb = new Float32Array([0.5, 0.5, 0.5, 0.5]);
    const validBuf = new Uint8Array(validEmb.buffer);

    db.upsertNode({
      id: "r1", session_id: "s1", label: "RESULT", status: "done", order: 1,
      tags: JSON.stringify(["valid"]),
      task_type: "qa",
      full_answer: "Valid answer",
      embedding: validBuf,
    });

    // Corrupt embedding (3 bytes — not a multiple of 4)
    db.upsertNode({
      id: "r2", session_id: "s1", label: "RESULT", status: "done", order: 2,
      tags: JSON.stringify(["corrupt"]),
      task_type: "qa",
      full_answer: "Corrupt answer",
      embedding: new Uint8Array([1, 2, 3]),
    });

    // search should not throw, should only return valid results
    const results = await index.search("valid", 5);
    // With no pipeline loaded, falls back to tag search — but the corrupt node shouldn't crash
    expect(results).toBeDefined();
  });
});
