import { describe, it, expect } from "vitest";
import { StepDetector } from "../step-detector.js";

describe("StepDetector", () => {
  describe("parseTaskBlock", () => {
    it('parses [TASK type="qa"]', () => {
      const result = StepDetector.parseTaskBlock('[TASK type="qa"]');
      expect(result).toEqual({ type: "qa" });
    });

    it('parses [TASK type="creative"]', () => {
      const result = StepDetector.parseTaskBlock('[TASK type="creative"]');
      expect(result).toEqual({ type: "creative" });
    });

    it("returns null for no match", () => {
      const result = StepDetector.parseTaskBlock("no task block here");
      expect(result).toBeNull();
    });

    it("finds task block in larger text", () => {
      const text = 'Some text\n[TASK type="qa"]\nMore text';
      const result = StepDetector.parseTaskBlock(text);
      expect(result).toEqual({ type: "qa" });
    });
  });

  describe("parseStepBlock", () => {
    it("parses a valid [STEP] block", () => {
      const text = `Some text before
[STEP name="Build API" why="Login needed first" expect="Working auth endpoints"]
Some text after`;

      const result = StepDetector.parseStepBlock(text);
      expect(result).toEqual({
        name: "Build API",
        why: "Login needed first",
        expect: "Working auth endpoints",
      });
    });

    it("returns null when no [STEP] block", () => {
      const result = StepDetector.parseStepBlock("just normal text");
      expect(result).toBeNull();
    });

    it("parses [STEP] with multiline text around it", () => {
      const text = `I'll start by analyzing the code.
[STEP name="Analyze Code" why="Need to understand the project" expect="A clear picture of the codebase"]
Let me read the files...`;

      const result = StepDetector.parseStepBlock(text);
      expect(result).not.toBeNull();
      expect(result!.name).toBe("Analyze Code");
    });

    it("parses the first [STEP] if multiple exist", () => {
      const text = `[STEP name="First" why="a" expect="b"]
[STEP name="Second" why="c" expect="d"]`;

      const result = StepDetector.parseStepBlock(text);
      expect(result!.name).toBe("First");
    });
  });

  describe("parseAllStepBlocks", () => {
    it("parses multiple [STEP] blocks", () => {
      const text = `[STEP name="First" why="a" expect="b"]
text
[STEP name="Second" why="c" expect="d"]`;

      const results = StepDetector.parseAllStepBlocks(text);
      expect(results).toHaveLength(2);
      expect(results[0].name).toBe("First");
      expect(results[1].name).toBe("Second");
    });
  });

  describe("autoDetectAction", () => {
    it("detects file read as 'read'", () => {
      expect(StepDetector.autoDetectAction("Read", "completed")).toBe("read");
      expect(StepDetector.autoDetectAction("Grep", "completed")).toBe("read");
      expect(StepDetector.autoDetectAction("Glob", "completed")).toBe("read");
    });

    it("detects file write as 'write'", () => {
      expect(StepDetector.autoDetectAction("Edit", "completed")).toBe("write");
      expect(StepDetector.autoDetectAction("Write", "completed")).toBe("write");
    });

    it("detects command execution as 'exec'", () => {
      expect(StepDetector.autoDetectAction("Bash", "completed")).toBe("exec");
    });

    it("detects errors as 'bug'", () => {
      expect(StepDetector.autoDetectAction("Bash", "error")).toBe("bug");
    });

    it("returns 'other' for unknown tools", () => {
      expect(StepDetector.autoDetectAction("UnknownTool", "completed")).toBe("other");
    });
  });
});
