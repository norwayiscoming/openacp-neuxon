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
  _knowledgeIndex?: KnowledgeIndex,
): NeuxonCommandDef {
  return {
    name: "neuxon",
    description: "View AI progress graph",
    usage: "[status | sessions]",
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
