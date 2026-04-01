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
});
