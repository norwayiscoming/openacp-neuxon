# Neuxon Dashboard Comprehensive Fix — Design Spec

**Date:** 2026-04-02
**Status:** Approved

## Problem

Dashboard has been patched incrementally and still has layout, SSE, and multi-session issues. This spec defines a single comprehensive fix.

## Fixes

### 1. Layout: Angle-based radial with spine/branch

Replace Z-lane layout with angle-based radial layout. INIT at center. Each session gets an angle (360/n degrees). Within each session, spine nodes flow outward along that angle, tool branches hang perpendicular.

**Session angle assignment:**
- 1 session: angle 0° (straight right)
- 2 sessions: 0° and 180°
- 3 sessions: 0°, 120°, 240°
- N sessions (max 5): 360°/N spacing

**Within a session (along its angle):**
- Spine nodes: placed along the session's angle, each 120 units further from INIT
- Branch nodes (tools): perpendicular to spine direction, alternating sides, offset 80 units
- RESULT: at the end of the spine, 120 units past the last step

**Edge label classification (unchanged):**
- Spine: "leads to", "task", "done", "feeds into"
- Branch: "reads", "writes", "edits", "runs", "searches", "scans", "finds", "delegates", "fetches", "looks up", "uses", "search"

**Both server-side (`computeRadialLayout` in server.ts) and client-side (`computeClientLayout` in dashboard.ts) use the same algorithm.**

### 2. Default all-sessions view

- `/neuxon` command generates URL without `?sessionId` → dashboard fetches `/api/graph` (merged graph)
- SSE subscribes to `__all__` channel
- Session dropdown in topbar allows filtering to 1 session
- `/neuxon status` still includes `?sessionId` for current session

### 3. Missing SSE "activity" listener

Add listener in dashboard:
```
sseSource.addEventListener('activity', e => {
  const data = JSON.parse(e.data);
  const node = graphData.nodes.find(n => n.id === data.nodeId);
  if (node) {
    if (!node.activity) node.activity = [];
    node.activity.push(data.entry);
    if (selectedNodeId === data.nodeId) selectNode(data.nodeId);
  }
});
```

### 4. Fix activity field name

In detail panel display, change `a.type` to `a.action`.

### 5. Opacity

All nodes and edges: opacity 1.0, no transparency. Already done in current code, verify it stays.

## Files Changed

| File | Change |
|------|--------|
| `src/server.ts` | Rewrite `computeRadialLayout()` — angle-based radial with spine/branch |
| `src/templates/dashboard.ts` | Rewrite `computeClientLayout()` to match, add activity SSE listener, fix activity field |
| `src/neuxon-command.ts` | Default URL without sessionId |

## Files NOT Changed

`index.ts`, `graph-builder.ts`, `graph-store.ts`, `knowledge-index.ts`, `context-engine.ts`, `step-detector.ts`, `db.ts`, `types.ts`
