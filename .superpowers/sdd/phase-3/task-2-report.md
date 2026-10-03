# Phase 3 Task 2 Report: API Routes — List and Retrieve Analyses

## What was done

### Files created

- `app/api/analyses/route.ts` — POST and GET handlers
- `app/api/analyses/[id]/route.ts` — GET handler for a specific analysis

---

### POST /api/analyses

1. Calls `requireAuth()` to get the Clerk `userId`.
2. Calls `auth()` directly to get `orgId` from Clerk's active organization context (`.orgId` field on the session object). Returns 400 if no org is selected.
3. Parses and validates the JSON body for `repositoryUrl` (string, non-empty). Returns 400 on bad input.
4. Delegates to `analyzeRepository(repositoryUrl, userId, orgId)` from `lib/parser/runner.ts`.
5. Returns 201 with the `Analysis` summary on success.
6. Maps `AnalysisError.statusCode` (400/404/500/503) directly to the HTTP response.

### GET /api/analyses

1. Calls `requireAuth()` and `auth().orgId` — same auth pattern as POST.
2. Uses a service-role Supabase client (consistent with `lib/auth.ts` and `lib/parser/runner.ts`).
3. Queries `analysis_results` joined with `repositories!inner` to filter by `organization_id`. This matches the RLS access path (user → org_members → repositories → analysis_results) without needing a user-context JWT.
4. Returns 200 with `{ analyses: AnalysisListItem[] }`. `file_count` and `edge_count` are omitted from the list summary (set to 0) to avoid pulling large JSONB columns for every row; full counts are available from the `[id]` endpoint.

### GET /api/analyses/[id]

1. Calls `requireAuth()`.
2. Awaits `params` (Next.js 15+ async params pattern).
3. Fetches the analysis row joined with `repositories!inner` to get `organization_id`.
4. Compares `repository.organization_id` against the user's `auth().orgId`. Returns 403 if they don't match (without leaking whether the resource exists).
5. Derives `file_count` and `edge_count` from the lengths of the JSONB arrays.
6. Returns 200 with the full row including `file_list`, `edge_list`, computed counts, and `repository_url`.
7. Maps PostgREST error code `PGRST116` (zero rows) to 404.

---

## Schema note

`analysis_results` has no `organization_id` column. Access is transitive:
`analysis_results.repository_id → repositories.id → repositories.organization_id → organization_members`.
Both routes join through `repositories` to apply the org filter, mirroring the RLS policy exactly.

## Organization ID source

`orgId` comes from Clerk's session (`auth().orgId`). The user must have an active organization selected in their Clerk session. If `orgId` is null, the route returns 400 with a clear message. This is Option 1 (Clerk session context) — no query params or custom headers required.

---

## Verification

- `npx tsc --noEmit` exits 0 — zero TypeScript errors, no `any` types used.
- Both files import `requireAuth()` from `@/lib/auth`.
- POST handler present in `app/api/analyses/route.ts`.
- GET handler present in `app/api/analyses/route.ts`.
- GET handler present in `app/api/analyses/[id]/route.ts`.
- Error handling covers: 400 (bad input / no org), 401 (unauthenticated), 403 (wrong org), 404 (not found), 500 (server error), 503 (clone failure via AnalysisError).
