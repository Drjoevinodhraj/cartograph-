# Phase 3 Task 3 Report: Explain Route — AI File Explanations

## What was done

### Files created / changed

- `app/api/analyses/[id]/explain/route.ts` — POST handler
- `package.json` / `pnpm-lock.yaml` — added `openai@7.27.0`

---

## POST /api/analyses/[id]/explain

### Flow

1. **Auth** — `requireAuth()` from `lib/auth.ts`; throws 401 if no session.
2. **Body parse** — expects `{ filePath: string }`; returns 400 if absent or empty.
3. **Fetch analysis** — queries `analysis_results` joined with `repositories!inner` to get `organization_id` in one round-trip (same pattern as GET `/api/analyses/[id]`).
4. **Org check** — compares `repositories.organization_id` to the user's `auth().orgId` from Clerk; returns 403 without leaking existence.
5. **File existence check** — scans `file_list`; returns 400 with a clear message if the path is not in this analysis.
6. **Cache read** — queries `cache_hits` by `(organization_id, query_hash)` before any OpenAI call; returns cached explanation immediately if found.
7. **Neighbor extraction** — `extractNeighbors(edges, filePath)` scans `edge_list`, capped at 10 per direction, deduplicated via `Set`.
8. **Kind resolution** — finds the `File` entry in `file_list` for the `kind` field (`component | route | util | config | other`).
9. **OpenAI call** — constructs a fact-only prompt listing the file path, kind, imports, and importers. Uses `gpt-4`, temperature 0.7. Returns 500 on API failure without revealing the raw error.
10. **Cache write** — inserts into `cache_hits` (`organization_id`, `query_hash`, `response`). Failure is non-fatal (logged, execution continues).
11. **Response** — `{ file: string, explanation: string }`, status 200.

---

## Helper functions

### `extractNeighbors(edges, filePath)`

Pure function. Exported for unit testing. Scans edges once, fills `imports` (fan-out) and `importedBy` (fan-in) up to 10 each, deduplicates with `Set`.

### `hashFilePath(path)`

SHA-256 hex digest of the path string. Exported for testing. Used as `query_hash` in `cache_hits`.

### `buildPrompt(filePath, neighbors, kind)` (internal)

Constructs the user message sent to OpenAI. Lists only facts the parser found — no invented detail.

---

## OpenAI SDK

`openai@7.27.0` was not in `package.json`. Installed with `pnpm add openai`. The client is constructed inside the handler (not exported) so there is one place that builds the AI client, consistent with the CLAUDE.md rule.

---

## Error handling

| Status | Condition |
|--------|-----------|
| 400 | Missing/empty `filePath`, or file not found in analysis |
| 401 | Unauthenticated (thrown by `requireAuth()`) |
| 403 | User's org ≠ analysis org |
| 404 | Analysis ID not found in database |
| 500 | OpenAI API error, Supabase fetch error, missing env vars |

---

## Caching

Cache hits are keyed by `(organization_id, query_hash)`. The same file path in two different orgs gets separate cache entries (org isolation). A hit short-circuits the OpenAI call entirely; the response shape `{ file, explanation }` is identical whether it comes from the cache or a fresh call.

---

## Verification

- `npx tsc --noEmit` exits 0 — zero TypeScript errors, no `any` casts used.
- No new `any` types; all raw `unknown` values from Supabase are narrowed with `Array.isArray` and type assertions documented with inline comments.
- All error paths covered: 400, 401, 403, 404, 500.
- Cache logic: read before OpenAI call, write after; write failure is non-fatal.
