export interface ActivityEntry {
  time: string;       // ISO timestamp
  action: string;     // "read", "write", "exec", "bug", "patch"
  text: string;       // e.g. "auth.ts +47 lines"
}

export interface GraphNode {
  id: string;
  label: string;
  status: "done" | "active" | "pending" | "detour";
  layman: string;
  cause: string;
  expect: string;
  techDetails: string | null;
  activity: ActivityEntry[];
  startedAt: string;
  completedAt: string | null;
  order: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  type: "normal" | "detour" | "resolved" | "pending";
}

export interface SessionGraph {
  sessionId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  activeNodeId: string | null;
  progress: number;
  agentName: string;
  createdAt: string;
}

export interface StepBlock {
  name: string;
  why: string;
  expect: string;
}

export type SSEEvent =
  | { type: "node:added"; sessionId: string; node: GraphNode }
  | { type: "node:updated"; sessionId: string; nodeId: string; patch: Partial<GraphNode> }
  | { type: "edge:added"; sessionId: string; edge: GraphEdge }
  | { type: "activity"; sessionId: string; nodeId: string; entry: ActivityEntry }
  | { type: "progress"; sessionId: string; progress: number }
  | { type: "graph:full"; sessionId: string; graph: SessionGraph };
