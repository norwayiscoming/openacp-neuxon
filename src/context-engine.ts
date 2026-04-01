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
    if (results.length === 0) return { action: "skip" };

    const best = results[0];

    if (best.score >= this.cacheThreshold && best.taskType === "qa") {
      return { action: "cache-hit", result: best };
    }

    if (best.score >= this.injectThreshold) {
      return { action: "inject", result: best, injectText: this.formatInjectText(best) };
    }

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
