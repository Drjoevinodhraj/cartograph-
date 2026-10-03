# Task 5 Report — API Tests

## Status: Complete

## What was built

`__tests__/api.test.ts` — 36 tests covering all four Phase 3 routes.

## Test results

```
Tests:  36 passed, 36 total
Suites: 1 passed, 1 total
Time:   ~0.35 s
```

## Coverage by route

### POST /api/analyses (8 tests)
- Valid GitHub URL → 201 with analysis ID and summary
- Missing `repositoryUrl` → 400
- Non-string `repositoryUrl` → 400
- Empty/whitespace URL → 400
- Non-GitHub URL (AnalysisError 400 from runner) → 400
- Non-existent repo (AnalysisError 404 from runner) → 404
- No auth → 401
- No active org → 400
- Malformed JSON body → 400

### GET /api/analyses (6 tests)
- Returns `{ analyses: [...] }` for user's org
- Returns empty array when no analyses exist
- Preserves DB ordering (newest first)
- No auth → 401
- No active org → 400
- Supabase error → 500

### GET /api/analyses/[id] (5 tests)
- Returns full row with `file_list`, `edge_list`, derived counts, coverage
- Unknown ID (PGRST116) → 404
- Different org → 403
- No auth → 401
- General DB error → 500

### POST /api/analyses/[id]/explain (9 tests)
- Valid file path → 200 with `{ file, explanation }`
- File not in analysis → 400
- Missing `filePath` → 400
- Empty `filePath` → 400
- Cache hit → 200, OpenAI not called
- Cache miss → OpenAI called, cache write made
- Unknown analysis ID → 404
- Different org → 403
- No auth → 401
- OpenAI empty response → 500
- OpenAI throws → 500

### Auth and RLS (5 tests)
- All four routes return 401 with no session
- POST and GET analyses return 400 (not 500) when no org context
- GET detail: org_A user cannot see org_B analysis → 403
- Explain: org_A user cannot explain org_B analysis → 403
- 403 response does not reveal whether the resource exists (message is "Forbidden", no mention of "analysis")

## Mock strategy

- `@clerk/nextjs/server` — `auth()` mocked with `jest.fn()`; tests reassign via `mockAuth.mockResolvedValue()`.
- `@supabase/supabase-js` — `createClient` returns a shared chainable object with every builder method returning itself. The object is thenable (implements `.then()`) so `await chain` resolves for list queries. `.single()` drives per-call results via a `singleResults` array.
- `@/lib/parser/runner` — `analyzeRepository` mocked; tests throw `AnalysisError` to test error paths.
- `openai` — constructor mock returning `{ chat.completions.create: jest.fn() }`.
- Env vars (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`) set at module load time so `makeSupabaseClient()` doesn't throw before `createClient` is called.

## No real network calls

All external I/O (Supabase, OpenAI, git clone) is mocked. Tests complete in under 400 ms.
