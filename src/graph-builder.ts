import { nanoid } from "nanoid";
import type {
  GraphNode,
  GraphEdge,
  ActivityEntry,
  SSEEvent,
} from "./types.js";
import { GraphStore } from "./graph-store.js";
import { StepDetector } from "./step-detector.js";

export class GraphBuilder {
  private store: GraphStore;
  private onEvent: (event: SSEEvent) => void;
  // Track the current "phase" node (from [STEP]) — tool calls branch from this
  private phaseNodes = new Map<string, string>(); // sessionId → phaseNodeId

  constructor(
    store: GraphStore,
    onEvent: (event: SSEEvent) => void,
  ) {
    this.store = store;
    this.onEvent = onEvent;
  }

  initSession(sessionId: string, agentName: string): void {
    const graph = this.store.getOrCreate(sessionId, agentName);

    const initNode: GraphNode = {
      id: nanoid(8),
      label: "INIT",
      status: "done",
      layman: "The AI opened your project and is getting ready to work.",
      cause: "Every journey starts with a first step — the AI needs to set up before it can begin.",
      expect: "The AI is ready to start working on your request.",
      techDetails: null,
      activity: [],
      startedAt: graph.createdAt,
      completedAt: graph.createdAt,
      order: 0,
    };

    this.store.addNode(sessionId, initNode);
    this.phaseNodes.set(sessionId, initNode.id);
    this.store.recalcProgress(sessionId);

    this.onEvent({
      type: "graph:full",
      sessionId,
      graph: this.store.get(sessionId)!,
    });
  }

  startNewTurn(sessionId: string, userMessage: string): void {
    const graph = this.store.get(sessionId);
    if (!graph) return;

    // Strip the injected prompt to get just the user message
    const parts = userMessage.split("---\n\n");
    const cleanMsg = parts.length > 1 ? parts[parts.length - 1].trim() : userMessage.trim();
    const label = cleanMsg.length > 25 ? cleanMsg.slice(0, 22) + "..." : cleanMsg;

    // Reset phase to INIT — new turn branches from root
    const initNode = graph.nodes.find((n) => n.label === "INIT");
    if (initNode) {
      this.phaseNodes.set(sessionId, initNode.id);
    }

    // Create a topic node for this turn, branching from INIT
    const maxOrder = Math.max(0, ...graph.nodes.map((n) => n.order));
    const topicNode: GraphNode = {
      id: nanoid(8),
      label: label || "New Task",
      status: "active",
      layman: cleanMsg || "Starting a new task.",
      cause: "You asked the AI to do something new.",
      expect: "The AI will work on this and show progress.",
      techDetails: null,
      activity: [],
      startedAt: new Date().toISOString(),
      completedAt: null,
      order: maxOrder + 1,
    };

    this.store.addNode(sessionId, topicNode);
    this.onEvent({ type: "node:added", sessionId, node: topicNode });

    // Edge from INIT
    if (initNode) {
      const edge: GraphEdge = {
        id: nanoid(8),
        from: initNode.id,
        to: topicNode.id,
        label: "task",
        type: "normal",
      };
      this.store.addEdge(sessionId, edge);
      this.onEvent({ type: "edge:added", sessionId, edge });
    }

    this.phaseNodes.set(sessionId, topicNode.id);
    this.store.setActiveNode(sessionId, topicNode.id);
    this.store.recalcProgress(sessionId);
    this.onEvent({ type: "progress", sessionId, progress: graph.progress });
  }

  handleTextEvent(sessionId: string, text: string): void {
    const graph = this.store.get(sessionId);
    if (!graph) return;

    const steps = StepDetector.parseAllStepBlocks(text);
    for (const step of steps) {
      this.addStepNode(sessionId, step.name, step.why, step.expect);
    }
  }

  handleToolCallEvent(
    sessionId: string,
    toolName: string,
    status: string,
    content: string,
  ): void {
    const graph = this.store.get(sessionId);
    if (!graph) return;

    const action = StepDetector.autoDetectAction(toolName, status);

    // Create a branch node for each tool call (pending = start of call)
    if (status === "pending") {
      const info = this.describeToolCall(toolName, content);
      if (info) {
        this.addToolBranchNode(sessionId, info.label, info.description, toolName);
      }
    }

    // Update existing tool node on completion
    if (status === "completed" || status === "error") {
      this.completeToolNode(sessionId, toolName, status, content);
    }

    const entry: ActivityEntry = {
      time: new Date().toISOString(),
      action,
      text: this.summarizeToolCall(toolName, content),
    };

    // Add activity to the phase node (parent), not the tool node
    const phaseId = this.phaseNodes.get(sessionId);
    const targetId = phaseId || graph.nodes[graph.nodes.length - 1]?.id;
    const targetNode = targetId ? graph.nodes.find((n) => n.id === targetId) : null;
    if (targetNode) {
      targetNode.activity.push(entry);
      this.onEvent({
        type: "activity",
        sessionId,
        nodeId: targetNode.id,
        entry,
      });
    }

    if (action === "bug") {
      this.addDetourNode(sessionId, content);
    }
  }

  private describeToolCall(toolName: string, content: string): { label: string; description: string } | null {
    // Search queries (long names with spaces)
    if (toolName.length > 20 || toolName.includes(" ")) {
      return {
        label: toolName.length > 30 ? toolName.slice(0, 27) + "..." : toolName,
        description: `Searching the web for: "${toolName}"`,
      };
    }
    const descriptions: Record<string, { label: string; desc: string }> = {
      "Read": { label: "Read File", desc: "Reading a file to understand its contents" },
      "Grep": { label: "Search Code", desc: "Searching through code for specific patterns" },
      "Glob": { label: "Find Files", desc: "Looking for files matching a pattern" },
      "Edit": { label: "Edit Code", desc: "Modifying code in a file" },
      "Write": { label: "Write File", desc: "Creating or overwriting a file" },
      "Bash": { label: "Run Command", desc: "Executing a shell command" },
      "Agent": { label: "Sub-Agent", desc: "Delegating a sub-task to another agent" },
      "WebSearch": { label: "Web Search", desc: "Searching the internet for information" },
      "WebFetch": { label: "Fetch Page", desc: "Downloading a web page to read its content" },
      "Fetch": { label: "Fetch Data", desc: "Retrieving data from an external source" },
      "ToolSearch": { label: "Find Tools", desc: "Looking for available tools to use" },
      "NotebookEdit": { label: "Edit Notebook", desc: "Modifying a Jupyter notebook" },
    };
    const info = descriptions[toolName];
    if (!info) return null;
    const detail = content ? `: ${content.slice(0, 80)}` : "";
    return { label: info.label + detail.slice(0, 30), description: info.desc + detail };
  }

  private addToolBranchNode(
    sessionId: string,
    label: string,
    description: string,
    toolName: string,
  ): void {
    const graph = this.store.get(sessionId);
    if (!graph) return;

    // Branch from the current phase node (not linear — multiple tools branch from same parent)
    const parentId = this.phaseNodes.get(sessionId) || graph.nodes[graph.nodes.length - 1]?.id;

    const maxOrder = Math.max(0, ...graph.nodes.map((n) => n.order));
    const newNode: GraphNode = {
      id: nanoid(8),
      label: label.length > 25 ? label.slice(0, 22) + "..." : label,
      status: "active",
      layman: description,
      cause: description,
      expect: "This action provides data for the AI's response.",
      techDetails: toolName.length > 20 ? `Query: "${toolName}"` : `Tool: ${toolName}`,
      activity: [],
      startedAt: new Date().toISOString(),
      completedAt: null,
      order: maxOrder + 1,
    };

    this.store.addNode(sessionId, newNode);
    this.onEvent({ type: "node:added", sessionId, node: newNode });

    // Edge from parent (phase node) — this creates branching
    if (parentId) {
      const edge: GraphEdge = {
        id: nanoid(8),
        from: parentId,
        to: newNode.id,
        label: this.edgeLabelForTool(toolName),
        type: "normal",
      };
      this.store.addEdge(sessionId, edge);
      this.onEvent({ type: "edge:added", sessionId, edge });
    }

    // Track this as the latest tool node (but don't change phase)
    this.store.setActiveNode(sessionId, newNode.id);
    this.store.recalcProgress(sessionId);
    this.onEvent({ type: "progress", sessionId, progress: graph.progress });
  }

  private edgeLabelForTool(toolName: string): string {
    if (toolName.length > 20 || toolName.includes(" ")) return "search";
    const labels: Record<string, string> = {
      "Read": "reads", "Grep": "scans", "Glob": "finds",
      "Edit": "edits", "Write": "writes", "Bash": "runs",
      "Agent": "delegates", "WebSearch": "searches", "WebFetch": "fetches",
      "Fetch": "fetches", "ToolSearch": "looks up",
    };
    return labels[toolName] || "uses";
  }

  private completeToolNode(
    sessionId: string,
    toolName: string,
    status: string,
    content: string,
  ): void {
    const graph = this.store.get(sessionId);
    if (!graph) return;

    // Find the most recent active tool node
    const toolNode = [...graph.nodes].reverse().find(
      (n) => n.status === "active" && n.label !== "INIT",
    );
    if (!toolNode) return;

    toolNode.status = status === "error" ? "detour" : "done";
    toolNode.completedAt = new Date().toISOString();

    // Enrich description with result summary
    if (content && content.length > 1) {
      const summary = content.length > 200 ? content.slice(0, 197) + "..." : content;
      toolNode.techDetails = (toolNode.techDetails || "") + "\n\nResult: " + summary;
    }

    this.onEvent({
      type: "node:updated",
      sessionId,
      nodeId: toolNode.id,
      patch: { status: toolNode.status, completedAt: toolNode.completedAt },
    });

    this.store.recalcProgress(sessionId);
    this.onEvent({ type: "progress", sessionId, progress: graph.progress });
  }

  handleTurnEnd(sessionId: string, fullResponse?: string): void {
    const graph = this.store.get(sessionId);
    if (!graph) return;

    // Collect current turn's active nodes before marking done
    const turnActiveIds = new Set(
      graph.nodes.filter((n) => n.status === "active").map((n) => n.id),
    );

    // Mark all active nodes as done
    for (const node of graph.nodes) {
      if (node.status === "active") {
        node.status = "done";
        node.completedAt = new Date().toISOString();
        this.onEvent({
          type: "node:updated",
          sessionId,
          nodeId: node.id,
          patch: { status: "done", completedAt: node.completedAt },
        });
      }
    }

    // Add RESULT node — only connect to THIS turn's leaf nodes
    const maxOrder = Math.max(0, ...graph.nodes.map((n) => n.order));
    const cleanResponse = (fullResponse ?? "")
      .replace(/\[STEP\s+name="[^"]*"\s+why="[^"]*"\s+expect="[^"]*"\s*\]/g, "")
      .trim();
    const resultNode: GraphNode = {
      id: nanoid(8),
      label: "RESULT",
      status: "done",
      layman: cleanResponse || "The AI has finished and delivered the result.",
      cause: "All steps are complete — here's what was produced.",
      expect: "Done!",
      techDetails: null,
      activity: [],
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      order: maxOrder + 1,
      fullAnswer: cleanResponse || null,
    };

    this.store.addNode(sessionId, resultNode);
    this.onEvent({ type: "node:added", sessionId, node: resultNode });

    // Find leaf nodes from current turn only (no outgoing edges, were active this turn or are descendants of current phase)
    const nodesWithOutgoing = new Set(graph.edges.map((e) => e.from));
    const currentPhaseId = this.phaseNodes.get(sessionId);

    // Get all descendants of current phase
    const phaseDescendants = new Set<string>();
    if (currentPhaseId) {
      const queue = [currentPhaseId];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        phaseDescendants.add(cur);
        for (const edge of graph.edges) {
          if (edge.from === cur && !phaseDescendants.has(edge.to)) {
            phaseDescendants.add(edge.to);
            queue.push(edge.to);
          }
        }
      }
    }

    const leafNodes = graph.nodes.filter(
      (n) =>
        n.id !== resultNode.id &&
        n.label !== "INIT" &&
        !nodesWithOutgoing.has(n.id) &&
        (turnActiveIds.has(n.id) || phaseDescendants.has(n.id)),
    );

    // Connect leaves to RESULT
    for (const leaf of leafNodes) {
      const edge: GraphEdge = {
        id: nanoid(8),
        from: leaf.id,
        to: resultNode.id,
        label: "feeds into",
        type: "normal",
      };
      this.store.addEdge(sessionId, edge);
      this.onEvent({ type: "edge:added", sessionId, edge });
    }

    // Fallback: connect from phase node if no leaves
    if (leafNodes.length === 0 && currentPhaseId) {
      const edge: GraphEdge = {
        id: nanoid(8),
        from: currentPhaseId,
        to: resultNode.id,
        label: "done",
        type: "normal",
      };
      this.store.addEdge(sessionId, edge);
      this.onEvent({ type: "edge:added", sessionId, edge });
    }

    this.store.setActiveNode(sessionId, null as any);
    // Keep phase at RESULT — next turn continues from here, not INIT
    this.phaseNodes.set(sessionId, resultNode.id);
    this.store.recalcProgress(sessionId);

    this.onEvent({
      type: "progress",
      sessionId,
      progress: graph.progress,
    });
  }

  private addStepNode(
    sessionId: string,
    name: string,
    why: string,
    expectText: string,
  ): void {
    const graph = this.store.get(sessionId);
    if (!graph) return;

    // Mark previous phase's tool nodes as done
    const currentPhaseId = this.phaseNodes.get(sessionId);
    for (const node of graph.nodes) {
      if (node.status === "active") {
        node.status = "done";
        node.completedAt = new Date().toISOString();
        this.onEvent({
          type: "node:updated",
          sessionId,
          nodeId: node.id,
          patch: { status: "done", completedAt: node.completedAt },
        });
      }
    }

    const maxOrder = Math.max(0, ...graph.nodes.map((n) => n.order));
    const newNode: GraphNode = {
      id: nanoid(8),
      label: name,
      status: "active",
      layman: why,
      cause: why,
      expect: expectText,
      techDetails: null,
      activity: [],
      startedAt: new Date().toISOString(),
      completedAt: null,
      order: maxOrder + 1,
    };

    this.store.addNode(sessionId, newNode);
    this.onEvent({ type: "node:added", sessionId, node: newNode });

    // Connect from previous phase node (or INIT) — phase-to-phase is linear
    const prevPhaseId = currentPhaseId || graph.nodes[0]?.id;
    if (prevPhaseId) {
      const edge: GraphEdge = {
        id: nanoid(8),
        from: prevPhaseId,
        to: newNode.id,
        label: "leads to",
        type: "normal",
      };
      this.store.addEdge(sessionId, edge);
      this.onEvent({ type: "edge:added", sessionId, edge });
    }

    // This is now the current phase — tool calls will branch from here
    this.phaseNodes.set(sessionId, newNode.id);
    this.store.setActiveNode(sessionId, newNode.id);
    this.store.recalcProgress(sessionId);

    this.onEvent({
      type: "progress",
      sessionId,
      progress: graph.progress,
    });
  }

  private addDetourNode(sessionId: string, content: string): void {
    const graph = this.store.get(sessionId);
    if (!graph) return;

    const parentId = this.phaseNodes.get(sessionId) || graph.activeNodeId || graph.nodes[graph.nodes.length - 1]?.id;

    const summary = content.length > 60
      ? content.substring(0, 57) + "..."
      : content;

    const detourNode: GraphNode = {
      id: nanoid(8),
      label: "Issue Found",
      status: "detour",
      layman: `The AI ran into a problem: ${summary}. It will try to fix it.`,
      cause: "This wasn't planned — the AI discovered an issue while working.",
      expect: "The AI will fix this and continue with the previous task.",
      techDetails: content,
      activity: [],
      startedAt: new Date().toISOString(),
      completedAt: null,
      order: -1,
    };

    this.store.addNode(sessionId, detourNode);
    this.onEvent({ type: "node:added", sessionId, node: detourNode });

    if (parentId) {
      const edge: GraphEdge = {
        id: nanoid(8),
        from: parentId,
        to: detourNode.id,
        label: "found issue!",
        type: "detour",
      };
      this.store.addEdge(sessionId, edge);
      this.onEvent({ type: "edge:added", sessionId, edge });
    }
  }

  private summarizeToolCall(toolName: string, content: string): string {
    const short = content.length > 120
      ? content.substring(0, 117) + "..."
      : content;
    if (toolName.length > 20 || toolName.includes(" ")) {
      return `searched: "${toolName}"`;
    }
    return `${toolName.toLowerCase()}${short ? ": " + short : ""}`;
  }
}
