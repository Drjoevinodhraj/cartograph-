# Task 2 Report: Parser Skeleton, File Walk, and Import Extraction

**Status:** Complete
**Date:** 2026-10-02

## Files Created

- `lib/parser/index.ts` — Types (`File`, `Edge`, `Coverage`, `ParserResult`) and main `parseRepository` export
- `lib/parser/parser.ts` — Directory walk, ts-morph AST parsing, import extraction, coverage reporting
- `lib/parser/resolve.ts` — tsconfig path alias loading, import resolution, barrel detection

## Architecture

### `lib/parser/index.ts`
Exports all types and re-exports `parseRepository` from `parser.ts`. Standalone — zero framework imports.

### `lib/parser/parser.ts`
- `walkDirectory()`: Recursive async walk, skips `node_modules`, `.next`, `dist`, `build`, `.git`, `coverage`, `.turbo`, `.cache`. Entries sorted for determinism.
- `extractImports()`: ts-morph AST visitor that handles:
  - ES static imports (`import X from '...'`)
  - Re-exports (`export { X } from '...'`, `export * from '...'`)
  - CommonJS `require('...')`
  - Dynamic `import('...')`
  - Also detects barrel files by checking for non-re-export top-level statements
- `parseRepository()`: Orchestrates walk → alias loading → ts-morph project → extraction → resolution → coverage

### `lib/parser/resolve.ts`
- `loadPathAliases()`: Reads and leniently parses `tsconfig.json` (strips single-line comments before JSON.parse), extracts `compilerOptions.paths`
- `resolveImport()`: Classifies each specifier as relative, external, or path-alias; attempts extension probing and index file fallback
- `detectBarrel()`: True when filename is `index.*` AND file has only re-export statements

## Verification Results

### TypeScript Compilation
```
npx tsc --noEmit
```
Exit code: 0 — zero errors.

### Smoke Tests

**Test 1 — lib/ directory:**
- Files parsed: 5
- Resolved edges: 3 (relative imports between parser files)
- Unresolved: 7 (all `external` — node_modules imports)

**Test 2 — Full repo root:**
- Files parsed: 10
- Files skipped: 34 (`unsupported-lang: 31`, `build-dir: 2`, `node_modules: 1`)
- Resolved edges include `lib/parser/index.ts -> lib/parser/parser.ts` etc.

**Test 3 — Edge cases (temp directory):**
- Barrel detection: PASS (`components/index.ts` → `isBarrel: true`)
- Dynamic import detection: PASS (`import('../components')` → `type: 'dynamic'`)
- Path alias resolution: PASS (`@/components` → `components/index.ts` via tsconfig paths)
- Missing directory: PASS (returns 0 files, no crash)
- Circular barrel imports: handled gracefully (no infinite loop)

## Checklist

### File Walk
- [x] Recursively walk directory from dirPath
- [x] Collect .ts, .tsx, .js, .jsx files
- [x] Skip: node_modules, .next, dist, build, .git, coverage
- [x] Deterministic (sorted entries)

### Import Extraction
- [x] ts-morph Project for AST parsing
- [x] ES imports: `import X from 'path'`
- [x] CommonJS: `require('path')`
- [x] Dynamic imports: `import('path')`
- [x] Re-exports: `export { X } from 'path'`
- [x] Parse errors recorded in coverage

### Import Resolution
- [x] tsconfig.json path aliases loaded
- [x] Relative imports resolved with extension probing
- [x] Node modules marked `unresolved` / `external`
- [x] Path aliases (`@/...`) resolved via tsconfig paths
- [x] Index file fallback (`./foo` → `./foo/index.ts`)
- [x] Barrel file tracking

### File Kinds
- [x] `kind: 'other'` (Phase 2 Task 3 adapter will override)
- [x] Barrel detection: index files with only re-exports

### Coverage
- [x] Parsed vs skipped counts
- [x] Reasons: `node_modules`, `build-dir`, `unsupported-lang`, `parse-error`

## Constraints Satisfied
- No Next.js imports
- No database imports
- No external API calls
- All functions async
- Strict TypeScript, no `any`
- Deterministic output for same input
