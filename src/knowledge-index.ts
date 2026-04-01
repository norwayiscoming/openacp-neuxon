import type { NeuxonDB } from "./db.js";
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
    const stopWords = new Set([
      "the", "and", "for", "that", "this", "with", "from", "are", "was",
      "were", "been", "have", "has", "had", "will", "would", "could",
      "should", "may", "might", "can", "does", "did", "not", "but",
      "its", "all", "any", "each", "just", "more", "than", "into",
      "also", "very", "here", "there", "when", "what", "how", "who",
    ]);
    const words = combined.match(/[a-z0-9]{3,}/g) || [];
    const unique = [...new Set(words)].filter((w) => !stopWords.has(w));
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

    // Fallback: tag-based search on ALL RESULT nodes (not just those with embeddings)
    const queryTags = KnowledgeIndex.extractTags(queryText, []);
    return this.searchByTags(queryTags, topK);
  }

  private searchByEmbedding(
    queryEmbedding: Float32Array,
    nodes: any[],
    queryText: string,
    topK: number,
  ): SearchResult[] {
    const queryTags = KnowledgeIndex.extractTags(queryText, []);

    const scored = nodes.map((node) => {
      const emb = node.embedding as Uint8Array;
      const nodeEmbedding = new Float32Array(emb.buffer, emb.byteOffset, emb.byteLength / 4);
      let score = KnowledgeIndex.cosineSimilarity(queryEmbedding, nodeEmbedding);

      const nodeTags: string[] = node.tags ? JSON.parse(node.tags) : [];
      const tagOverlap = queryTags.filter((t: string) => nodeTags.includes(t)).length;
      if (nodeTags.length > 0 && tagOverlap > 0) {
        score += (tagOverlap / nodeTags.length) * 0.1;
      }

      return {
        nodeId: node.id,
        sessionId: node.session_id,
        label: node.label,
        score: Math.min(1, score),
        taskType: (node.task_type as "qa" | "creative" | null) ?? null,
        tags: nodeTags,
        fullAnswer: node.full_answer ?? null,
        createdAt: node.started_at ?? "",
      } satisfies SearchResult;
    });

    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  private searchByTags(queryTags: string[], topK: number = 5): SearchResult[] {
    // Get ALL RESULT nodes (including those without embeddings)
    const result = this.db.exec("SELECT * FROM nodes WHERE label = 'RESULT'");
    if (!result.length) return [];

    const cols = result[0].columns;
    const nodes = result[0].values.map((row) => {
      const obj: any = {};
      cols.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });

    const scored = nodes.map((node: any) => {
      const nodeTags: string[] = node.tags ? JSON.parse(node.tags) : [];
      const overlap = queryTags.filter((t) => nodeTags.includes(t)).length;
      const score = nodeTags.length > 0
        ? overlap / Math.max(queryTags.length, nodeTags.length)
        : 0;

      return {
        nodeId: node.id as string,
        sessionId: node.session_id as string,
        label: node.label as string,
        score,
        taskType: (node.task_type as "qa" | "creative" | null) ?? null,
        tags: nodeTags,
        fullAnswer: (node.full_answer as string | null) ?? null,
        createdAt: (node.started_at as string) ?? "",
      } satisfies SearchResult;
    });

    return scored
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}
