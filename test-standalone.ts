/**
 * Standalone test — starts Neuxon server with fake data to test the dashboard UI.
 * Run: npx tsx test-standalone.ts
 * Then open: http://localhost:3200/?sessionId=demo
 */

import { SessionGraphStore } from "./src/session-graph-store.js";
import { GraphBuilder } from "./src/graph-builder.js";
import { startNeuxonServer, SSEManager } from "./src/server.js";

const store = new SessionGraphStore();
const sseManager = new SSEManager();
const builder = new GraphBuilder(store, (event) => {
  sseManager.broadcast(event);
  console.log(`  SSE → ${event.type}`);
});

// Initialize a demo session
builder.initSession("demo", "claude-code");

// Simulate AI steps with delays
async function simulateAIWork() {
  console.log("\n🧠 Simulating AI work...\n");

  await delay(2000);
  console.log("→ Step: Analyze Code");
  builder.handleTextEvent(
    "demo",
    '[STEP name="Analyze Code" why="Need to understand your project before making changes" expect="A clear picture of how your app is built"]',
  );
  builder.handleToolCallEvent("demo", "Read", "completed", "src/index.ts");
  builder.handleToolCallEvent("demo", "Read", "completed", "src/config.ts");
  builder.handleToolCallEvent("demo", "Grep", "completed", "auth pattern found in 3 files");
  builder.handleToolCallEvent("demo", "Read", "completed", "src/middleware/auth.ts");

  await delay(3000);
  console.log("→ Turn end: Analyze done");
  builder.handleTurnEnd("demo");

  await delay(2000);
  console.log("→ Step: Design Solution");
  builder.handleTextEvent(
    "demo",
    '[STEP name="Design Solution" why="Planning the best approach before writing code" expect="A clear plan for building the login system"]',
  );
  builder.handleToolCallEvent("demo", "Read", "completed", "package.json");

  await delay(3000);
  console.log("→ Turn end: Design done");
  builder.handleTurnEnd("demo");

  await delay(2000);
  console.log("→ Step: Build Login API");
  builder.handleTextEvent(
    "demo",
    '[STEP name="Build Login API" why="Creating the login system so users can sign in securely" expect="Working login and signup endpoints"]',
  );
  builder.handleToolCallEvent("demo", "Write", "completed", "src/api/auth.ts — created login endpoint");
  builder.handleToolCallEvent("demo", "Edit", "completed", "src/api/routes.ts — added auth routes");

  await delay(2000);
  // Simulate a bug!
  console.log("→ Bug found!");
  builder.handleToolCallEvent("demo", "Bash", "error", "TypeError: Cannot read property 'token' of null at auth.ts:27");

  await delay(2000);
  console.log("→ Bug fixed, continuing...");
  builder.handleToolCallEvent("demo", "Edit", "completed", "src/api/auth.ts — fixed null check");
  builder.handleToolCallEvent("demo", "Write", "completed", "src/middleware/jwt.ts — added JWT validation");

  await delay(3000);
  console.log("→ Turn end: Build done");
  builder.handleTurnEnd("demo");

  await delay(2000);
  console.log("→ Step: Test");
  builder.handleTextEvent(
    "demo",
    '[STEP name="Run Tests" why="Making sure everything works correctly before finishing" expect="All tests pass — your login system is verified"]',
  );
  builder.handleToolCallEvent("demo", "Bash", "completed", "npm test — 12 tests passed");

  await delay(2000);
  console.log("→ Turn end: Test done");
  builder.handleTurnEnd("demo");

  console.log("\n✅ Simulation complete! Graph should show full journey.\n");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Start server
const result = startNeuxonServer(store, sseManager, 3200);
if (result) {
  console.log(`\n🚀 Neuxon test server running!`);
  console.log(`\n   Open in browser: http://localhost:${result.actualPort}/?sessionId=demo\n`);
  console.log(`   The AI simulation will start in 2 seconds...\n`);
  console.log(`   Watch the graph update in real-time! 🎯\n`);

  // Start simulation after a short delay
  setTimeout(simulateAIWork, 2000);
} else {
  console.error("❌ Failed to start server");
  process.exit(1);
}
