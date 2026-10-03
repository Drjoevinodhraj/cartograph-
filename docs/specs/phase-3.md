# Phase 3: API Routes for Code Analysis

## Goal
Build API routes that use the Phase 2 parser to analyze repositories. Users can upload/analyze a repo, retrieve the dependency map, and request explanations from the AI. Results are stored in Supabase and protected by RLS policies.

## Acceptance Criteria
1. API route to analyze a repository (POST /api/analyze)
2. API route to retrieve analysis results (GET /api/analyses/[id])
3. Analysis stores files, edges, and coverage in Supabase
4. All results protected by RLS (organization-scoped)
5. Error handling for invalid repos, parse failures
6. API routes use Clerk auth middleware
7. All routes tested with real repository data
8. Build succeeds with zero TypeScript errors

## Architecture

### API Routes (Server-Side)

Users authenticate with Clerk and have a Supabase organization from Phase 1. When they analyze a repo:

1. POST `/api/analyses` — Start a new analysis
   - Input: GitHub repo URL
   - Verify user is authenticated and belongs to an organization
   - Clone/download the repo
   - Run the Phase 2 parser
   - Store results in Supabase (analysis_results table from Phase 1)
   - Return analysis ID + file/edge counts

2. GET `/api/analyses/[id]` — Retrieve analysis results
   - Input: analysis ID
   - Verify user has access (RLS will handle this)
   - Return: files, edges, coverage
   - Client-side filtering/visualization happens next phase

3. POST `/api/analyses/[id]/explain` — Request explanation for a file (Phase 3 extension)
   - Input: file path, analysis ID
   - Query the analysis to find neighbors of that file
   - Call OpenAI API to explain the file and its dependencies
   - Store explanation in database (cache)
   - Return explanation text

### Database Integration

Phase 1 created the schema. Phase 3 uses it:
- `analysis_results` table stores: file_list (JSONB), edge_list (JSONB), coverage (NUMERIC)
- `organizations` and `organization_members` control access via RLS
- `audit_logs` records every analysis + explanation

Each analysis belongs to a repository, which belongs to an organization. RLS ensures users see only their organization's analyses.

### Parser Integration

Use `parseRepository()` from Phase 2. Phase 3 doesn't modify the parser — just calls it and stores results.

## Tech Decisions

**Why store results in Supabase, not as a file?**
- Persistent storage available to the frontend
- RLS policies control access (not handled in code)
- Queryable: later phases can filter files by kind, find high fan-in, etc.
- Multi-user: each org sees only their analyses

**Why download/clone the repo instead of streaming from GitHub API?**
- Full access to the codebase for parsing
- Can handle path aliases, custom configs
- Offline-capable (if needed)
- Trade-off: requires temporary disk space

**Why not analyze in the background?**
- Phase 3 is synchronous for simplicity
- User waits for analysis (~5-30 seconds for typical repos)
- Later phases could add job queue if needed
- Trade-off: larger repos may timeout

## Files to Create

- `lib/parser/runner.ts` — wrapper that runs parser, stores results in Supabase
- `app/api/analyses/route.ts` — POST (create analysis), GET (list analyses)
- `app/api/analyses/[id]/route.ts` — GET specific analysis
- `app/api/analyses/[id]/explain/route.ts` — POST (request explanation)
- `__tests__/api.test.ts` — test API routes with real repo

## Steps

### Step 1: Create Analysis Runner
- [ ] Create `lib/parser/runner.ts`
- [ ] Function: `analyzeRepository(repoUrl, userId, orgId): Promise<Analysis>`
- [ ] Download/clone repo from GitHub URL
- [ ] Run Phase 2 parser on it
- [ ] Store results in Supabase analysis_results table
- [ ] Return analysis metadata (id, file count, edge count, coverage)
- [ ] Error handling for network errors, parse failures, invalid repos

### Step 2: Create Analysis Routes
- [ ] Create `app/api/analyses/route.ts`
  - POST: call analyzeRepository, return result
  - GET: list user's organization's analyses (RLS handles filtering)
- [ ] Create `app/api/analyses/[id]/route.ts`
  - GET: return specific analysis (file_list, edge_list, coverage)
  - RLS verifies access
- [ ] Proper error codes: 400 (bad request), 401 (unauthorized), 404 (not found), 500 (server error)

### Step 3: Create Explanation Route
- [ ] Create `app/api/analyses/[id]/explain/route.ts`
- [ ] POST: request explanation for a file
- [ ] Find neighbors of file in analysis
- [ ] Call OpenAI API with context
- [ ] Store explanation in cache_hits table
- [ ] Return explanation text

### Step 4: Add Dependencies
- [ ] Install packages needed for cloning repos (simple-git or similar)
- [ ] Verify OpenAI SDK is available (from Phase 1 setup, or install)

### Step 5: Write API Tests
- [ ] Create `__tests__/api.test.ts`
- [ ] Test POST /api/analyses with real repo URL
- [ ] Test GET /api/analyses/[id]
- [ ] Test unauthorized access (RLS)
- [ ] Test invalid repo URL
- [ ] Test explanation endpoint

### Step 6: Build and Commit
- [ ] `pnpm build` — zero TypeScript errors
- [ ] Tests passing
- [ ] `git commit -m "feat: API routes for code analysis"`

## Notes

- The parser runner should handle network timeouts gracefully (large repos may take time)
- Store temporary clone in `/tmp` or system temp, clean up after parsing
- Explanations are cached in the database to avoid re-querying the same file
- For Phase 3, assume analyses are synchronous (user waits)
- Next phase will add frontend to visualize results and call explanation endpoint

## Success Criteria Verification

Before marking Phase 3 done:
- [ ] Analyze a real public GitHub repo (e.g., a small Next.js project)
- [ ] Files and edges stored correctly in Supabase
- [ ] GET /api/analyses/[id] returns the analysis
- [ ] RLS verified: user from different org can't access
- [ ] POST explanation endpoint works
- [ ] Error handling: invalid URL, parse failure, unauthorized access
- [ ] All tests pass
- [ ] Build succeeds with zero errors
