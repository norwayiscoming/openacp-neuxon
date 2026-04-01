import type { GraphStore } from "./graph-store.js";
import type { KnowledgeIndex } from "./knowledge-index.js";

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
  store: GraphStore,
  getUrl: () => string,
  knowledgeIndex?: KnowledgeIndex,
): NeuxonCommandDef {
  return {
    name: "neuxon",
    description: "View AI progress graph",
    usage: "[status | sessions | recall <topic> | refresh | forget <sessionId>]",
    category: "plugin",

    async handler(args) {
      const subcommand = (args.text ?? "").trim().toLowerCase();
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
            text: "No active session. Use \`/neuxon sessions\` to list all.",
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
