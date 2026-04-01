import type { StepBlock, TaskBlock } from "./types.js";

const STEP_REGEX =
  /\[STEP\s+name="([^"]+)"\s+why="([^"]+)"\s+expect="([^"]+)"\s*\]/g;

const TASK_REGEX = /\[TASK\s+type="(qa|creative)"\s*\]/;

const READ_TOOLS = new Set(["Read", "Grep", "Glob", "Search", "Agent"]);
const WRITE_TOOLS = new Set(["Edit", "Write", "NotebookEdit"]);
const EXEC_TOOLS = new Set(["Bash"]);

export class StepDetector {
  static parseTaskBlock(text: string): TaskBlock | null {
    const match = TASK_REGEX.exec(text);
    if (!match) return null;
    return { type: match[1] as "qa" | "creative" };
  }

  static parseStepBlock(text: string): StepBlock | null {
    const match = new RegExp(STEP_REGEX.source).exec(text);
    if (!match) return null;
    return { name: match[1], why: match[2], expect: match[3] };
  }

  static parseAllStepBlocks(text: string): StepBlock[] {
    const results: StepBlock[] = [];
    const regex = new RegExp(STEP_REGEX.source, "g");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      results.push({ name: match[1], why: match[2], expect: match[3] });
    }
    return results;
  }

  static autoDetectAction(
    toolName: string,
    status: string,
  ): "read" | "write" | "exec" | "bug" | "other" {
    if (status === "error") return "bug";
    if (READ_TOOLS.has(toolName)) return "read";
    if (WRITE_TOOLS.has(toolName)) return "write";
    if (EXEC_TOOLS.has(toolName)) return "exec";
    return "other";
  }
}
