# Phase 3 Task 1 Report: Analysis Runner

## What was done

### Step 1: simple-git installed
- `pnpm add simple-git` → version `4.0.2` added to `dependencies` in `package.json`
- Verified importable at runtime: `typeof simpleGit === 'function'`

### Step 2: lib/parser/runner.ts created

Exports:
- `Analysis` type — summary returned after a successful run
- `AnalysisError` class — typed error with `statusCode` (400/404/500/503)
- `analyzeRepository(repoUrl, userId, organizationId): Promise<Analysis>`

#### Flow

1. **Validate** — rejects any URL that doesn't start with `https://github.com/` and have at least `owner/repo` (400)
2. **Clone** — `simpleGit().clone(repoUrl, tmpDir, ['--depth', '1'])` into `/tmp/cartograph-analysis-<ts>-<rand>`
   - "not found / 404" → 404
   - timeout / DNS failure → 503
   - other git errors → 503
3. **Parse** — calls `parseRepository(tmpDir)` from `@/lib/parser`; wraps failure as 500
4. **Store** — service-role Supabase client (`SUPABASE_SERVICE_ROLE_KEY` preferred, falls back to anon key)
   - `repositories`: upserted on `(url, organization_id)` with `last_analyzed = now()`
   - `analysis_results`: inserted with `file_list`, `edge_list`, `coverage` (ratio 0–1)
5. **Cleanup** — `fs.promises.rm(tmpDir, { recursive: true, force: true })` in `finally` block; errors logged but not rethrown

#### Error handling matrix

| Condition | Status |
|---|---|
| Invalid / non-GitHub URL | 400 |
| Repo not found / private | 404 |
| Parse failure | 500 |
| Supabase misconfiguration | 500 |
| Network timeout / DNS failure | 503 |

## Verification

- `npx tsc --noEmit` exits 0 (no errors, no `any` types)
- `simple-git 4.0.2` present in `package.json` dependencies
- `analyzeRepository` is the named export from `lib/parser/runner.ts`
- Cleanup runs in `finally` regardless of success or failure
- `.git` directory is not assumed to exist post-clone (shallow clone depth 1 is used; parser skips `.git` via `SKIP_DIRS`)
