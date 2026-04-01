# CLAUDE.md

This file provides context for AI coding agents working on this plugin.

## Project Overview

- **Package**: openacp-neuxon
- **Type**: OpenACP plugin
- **Purpose**: Visualize AI agent progress as a real-time knowledge graph
- **Entry point**: `src/index.ts` (default export of OpenACPPlugin object)

## Build & Run

```bash
npm install           # Install dependencies
npm run build         # Bundle with tsup
npm run dev           # Watch mode
npm run typecheck     # Type-check only (tsc --noEmit)
npm test              # Run tests (vitest)
```

## Conventions

- ESM-only (`"type": "module"`), all imports use `.js` extension
- TypeScript strict mode, target ES2022, NodeNext module resolution
- tsup bundles everything into single `dist/index.js` — tsc is typecheck only
- Only `@openacp/cli` is external (peer dep)
- Tests use Vitest in `src/__tests__/`
