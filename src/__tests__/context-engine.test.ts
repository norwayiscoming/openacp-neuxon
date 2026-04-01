import { describe, it, expect } from "vitest";
import { ContextEngine } from "../context-engine.js";
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
      nodeId: "r1", sessionId: "s1abcdef", label: "RESULT",
      score: 0.7, taskType: "qa",
      tags: ["web3", "news"], fullAnswer: "Web3 is evolving",
      createdAt: "2026-04-01T10:00:00Z",
    };
    const text = engine.formatInjectText(result);
    expect(text).toContain("[Neuxon Context]");
    expect(text).toContain("s1abcdef");
    expect(text).toContain("#web3");
  });

  it("formats cache hit response correctly", () => {
    const engine = new ContextEngine(0.85, 0.5);
    const result: SearchResult = {
      nodeId: "r1", sessionId: "s1abcdef", label: "RESULT",
      score: 0.92, taskType: "qa",
      tags: ["web3"], fullAnswer: "Full answer text here",
      createdAt: "2026-04-01T10:00:00Z",
    };
    const text = engine.formatCacheHitResponse(result);
    expect(text).toContain("Full answer text here");
    expect(text).toContain("/neuxon refresh");
    expect(text).toContain("s1abcdef");
  });
});
