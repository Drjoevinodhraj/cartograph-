# Phase 2: Parser, Framework Adapter, and Graph Calculations

## Goal
Build the standalone code parser and framework knowledge layer. The parser reads a directory and extracts every file and import statement. The framework adapter knows what a Next.js route or React component looks like. Graph calculations are pure functions over the file list and edge list that compute fan-in, fan-out, and blast radius.

## Acceptance Criteria
1. Parser runs standalone (no Next.js, no React, no database imports)
2. Parser extracts all files and real imports (require, ES import, re-exports)
3. Parser handles dynamic imports with reason tracking
4. Parser handles path aliases (tsconfig paths)
5. Parser handles barrel files (index.ts re-exports)
6. Framework adapter correctly identifies Next.js routes, React components, API handlers
7. Graph calculations are pure functions (no side effects, fully testable)
8. Fan-in and fan-out calculations correct for each file
9. Blast radius calculation accurate (what breaks if this file changes)
10. All tests pass (parser, adapter, graph calculations)
11. TypeScript strict mode, zero errors

## Architecture

### Parser (`lib/parser/`)

The parser is the foundation. It takes a directory path and returns a structured file and edge list.

**Parser exports:**
```typescript
export async function parseRepository(dirPath: string): Promise<ParserResult>
// Returns:
// {
//   files: File[] (each file: path, kind, language)
//   edges: Edge[] (each edge: from, to, type - 'import'|'dynamic'|'unresolved')
//   coverage: Coverage (parsed count, skipped count with reasons)
// }

export type File = {
  path: string           // relative path from root
  kind: 'component'|'route'|'util'|'config'|'other'
  language: 'ts'|'tsx'|'js'|'jsx'
  isBarrel: boolean      // true if it's an index file with re-exports
}

export type Edge = {
  from: string           // file that does the importing
  to: string             // file being imported (resolved or null)
  type: 'import'|'dynamic'|'unresolved'
  reason?: string        // why it's unresolved
}

export type Coverage = {
  parsed: number         // files successfully parsed
  skipped: number        // files skipped and why
  reasons: Map<string, number>  // 'node_modules', 'unsupported-lang', etc.
}
```

**Parser implementation:**
- Use `ts-morph` to parse TypeScript/JavaScript files
- Extract import statements: `import X from 'path'`, `require('path')`, dynamic imports
- Resolve imports using tsconfig.json paths (if present)
- Handle barrel files: if a file is just re-exports, track all transitive imports
- For unresolved imports: record reason (relative to repo, points outside, etc.)
- Skip: node_modules, .next, dist, build directories
- Return structured result for downstream use

### Framework Adapter (`lib/parser/adapters/`)

The adapter tells the parser what kind of file it is (route, component, util, config). This knowledge is framework-specific.

**Adapter interface:**
```typescript
export interface FrameworkAdapter {
  identifyKind(filePath: string): 'component'|'route'|'util'|'config'|'other'
  // Looks at path and filename, returns the kind
}

export function createNextJsAdapter(): FrameworkAdapter
// Returns adapter that knows:
// - app/*/page.tsx → 'route'
// - app/*/layout.tsx → 'route'
// - app/api/*/route.ts → 'route'
// - components/... → 'component'
// - lib/... → 'util'
// - next.config.ts, tsconfig.json → 'config'
// - everything else → 'other'
```

**Rationale:** Knowledge about what a Next.js route looks like doesn't belong in the parser. The parser doesn't know Next.js. The adapter is a simple lookup that the parser uses after parsing the file system. This keeps the parser standalone and reusable.

### Graph Calculations (`lib/graph/`)

Pure functions over the file list and edge list. No database, no side effects, fully testable in isolation.

**Exports:**
```typescript
export function calculateFanIn(filePath: string, edges: Edge[]): string[]
// Returns list of files that import this file

export function calculateFanOut(filePath: string, edges: Edge[]): string[]
// Returns list of files this file imports

export function calculateBlastRadius(filePath: string, edges: Edge[], depth?: number): Set<string>
// Returns all files that would break if this file changes
// Walks the dependency graph forward (what imports this, and what imports those)

export function findCycles(edges: Edge[]): string[][]
// Returns all dependency cycles (optional, for coverage reporting)
```

These are pure functions: given edges, return results. No state, no I/O, no database. They're testable with hardcoded edge lists.

## Tech Decisions

**ts-morph for parsing, not @babel/parser:**
- Why: ts-morph understands TypeScript and tsconfig.json paths out of the box
- Trade-off: Slightly heavier than Babel, but avoids custom path resolution logic

**Standalone parser (no Next.js, no database):**
- Why: Reusable anywhere. Could run in a CLI, on CI, or in the app. Not tied to Next.js request/response
- Trade-off: Requires a small adapter layer to add framework knowledge

**Pure graph functions:**
- Why: Testable without mocking. Fast. Composable.
- Trade-off: Can't cache results in the database; must recompute each time

**Framework adapter pattern:**
- Why: New framework? Add an adapter. Parser never changes.
- Trade-off: Each new framework needs a small adapter written

## Files to Create

- `lib/parser/index.ts` - main parser export
- `lib/parser/parser.ts` - file and import extraction
- `lib/parser/resolve.ts` - import resolution (paths, barrel files)
- `lib/parser/adapters/next.ts` - Next.js framework knowledge
- `lib/graph/index.ts` - graph calculation exports
- `lib/graph/walk.ts` - fan-in/fan-out/blast-radius calculations
- `__tests__/parser.test.ts` - parser unit tests
- `__tests__/graph.test.ts` - graph calculation tests

## Steps

### Step 1: Install ts-morph
- [ ] Install `ts-morph`
- [ ] Verify it resolves in node_modules

### Step 2: Create parser skeleton
- [ ] Create `lib/parser/index.ts` with main `parseRepository()` export
- [ ] Create `lib/parser/parser.ts` with file system walk and AST parsing
- [ ] Create `lib/parser/resolve.ts` with import resolution logic
- [ ] Verify types compile

### Step 3: Create framework adapter
- [ ] Create `lib/parser/adapters/next.ts` with `createNextJsAdapter()`
- [ ] Implement path-based kind identification
- [ ] Test with sample paths

### Step 4: Create graph calculations
- [ ] Create `lib/graph/walk.ts` with fan-in, fan-out, blast-radius functions
- [ ] All functions pure (no side effects)
- [ ] Comprehensive edge case handling

### Step 5: Write parser tests
- [ ] Create `__tests__/parser.test.ts`
- [ ] Test file discovery
- [ ] Test import extraction (ES, require, dynamic, unresolved)
- [ ] Test path alias resolution
- [ ] Test barrel file handling
- [ ] Test coverage reporting

### Step 6: Write graph tests
- [ ] Create `__tests__/graph.test.ts`
- [ ] Test fan-in/fan-out calculations
- [ ] Test blast radius with cycles and transitive dependencies
- [ ] Test edge cases (self-import, orphaned files, etc.)

### Step 7: Integration test
- [ ] Create a sample test repo (small Next.js project in `__tests__/fixtures/`)
- [ ] Parse it end-to-end
- [ ] Verify files and edges are correct
- [ ] Verify adapter identifies kinds correctly
- [ ] Verify graph calculations make sense

### Step 8: Build and Commit
- [ ] `pnpm build` — zero TypeScript errors
- [ ] All tests pass
- [ ] `git add . && git commit -m "feat: parser, adapter, and graph calculations"`

## Notes

- The parser should be runnable as `node lib/parser/index.js /path/to/repo` for testing (export a main function)
- Don't add caching or database integration yet — Phase 3 will create API routes that use the parser
- The parser should be deterministic: same input always produces same output
- Test with real TypeScript files, not just mock ASTs — ts-morph is powerful, use it
- Graph calculations should handle cycles gracefully (don't infinite-loop)
- Framework adapter is pluggable: design so new adapters can be added easily

## Success Criteria Verification

Before marking Phase 2 done:
- [ ] Parser runs standalone (no Next.js imports)
- [ ] Parse a real Next.js project, get correct file list
- [ ] Import extraction includes ES, require, dynamic, and unresolved
- [ ] Path aliases work (tsconfig.json paths)
- [ ] Barrel files are detected
- [ ] Framework adapter correctly identifies route vs. component vs. util
- [ ] Fan-in/fan-out calculations are correct (manually verify on sample repo)
- [ ] Blast radius is accurate (manually verify)
- [ ] All tests pass
- [ ] Build succeeds with zero errors
