# Phase 5: CodeRabbit Integration — Code Review on the Dependency Graph

## Goal
Integrate CodeRabbit (AI code review platform) so users see code review feedback alongside the dependency graph. Display review status on file nodes, allow users to refresh reviews on-demand, and explain dependencies in context of code quality.

## Acceptance Criteria
1. CodeRabbit API integration (read-only, pull review data)
2. Review status stored in database with org-level RLS
3. Reviews fetched at analysis time (Phase 3 enhancement)
4. On-demand refresh via "Refresh Reviews" button
5. Review badges on graph nodes (color-coded by status)
6. Review details in FileDetail panel
7. Links to CodeRabbit review page
8. All tests passing, zero TypeScript errors

## Architecture

### Data Layer

**New table: `coderabbit_reviews`**
- `id` (UUID, pk)
- `organization_id` (UUID, fk, for RLS)
- `repository_id` (UUID, fk)
- `file_path` (TEXT)
- `review_status` (ENUM: 'approved', 'needs-review', 'issues', 'not-reviewed')
- `comment_count` (INTEGER)
- `summary` (TEXT, e.g., "3 issues found")
- `external_review_url` (TEXT, link to CodeRabbit)
- `fetched_at` (TIMESTAMP, know when data was last refreshed)

RLS: Users can only see reviews for repos in their organization.

**Organization table update:**
Add column: `coderabbit_api_key TEXT ENCRYPTED` (stores encrypted API key for org-level integration)

### API Integration

**CodeRabbit Client (`lib/coderabbit/client.ts`):**
```typescript
export async function fetchReviewsForRepo(
  repoUrl: string,
  apiKey: string
): Promise<ReviewData[]>
```
- Query CodeRabbit API for all files in repo
- Returns array of { filePath, status, commentCount, summary, externalUrl }
- Handles auth, rate limiting, timeouts, errors

**Storage Operations (`lib/coderabbit/storage.ts`):**
```typescript
export async function storeReviews(
  orgId: string,
  repoId: string,
  reviews: ReviewData[]
): Promise<void>

export async function getReviewsForFile(
  orgId: string,
  filePath: string
): Promise<ReviewData | null>

export async function refreshReview(
  orgId: string,
  analysisId: string,
  filePath: string
): Promise<ReviewData | null>
```

**API Route (`app/api/coderabbit/refresh/route.ts`):**
- `POST /api/coderabbit/refresh`
- Input: `{ analysisId, filePath }`
- Verifies user owns analysis (auth + RLS)
- Calls `refreshReview()`, returns fresh data
- Error handling: 400, 401, 404, 503

### Data Flow

**At analysis time (Phase 3 enhancement):**
1. `analyzeRepository()` completes, stores files/edges
2. Call `fetchCodeRabbitReviews(repoUrl, orgId)`
3. Query CodeRabbit API for all files
4. Store in `coderabbit_reviews` table
5. If CodeRabbit fails: log warning, don't block analysis (graceful degradation)

**On-demand refresh (Phase 4 UI):**
1. User clicks "Refresh Reviews" button in FileDetail
2. Calls `POST /api/coderabbit/refresh` with filePath
3. Re-fetches from CodeRabbit API, updates DB
4. Returns fresh data, UI updates with loading state

### UI Changes

**DependencyGraph nodes:**
- Add small badge showing review status (colored circle)
  - Green (#22c55e): "approved"
  - Yellow (#eab308): "needs-review"
  - Red (#ef4444): "issues"
  - Gray (#9ca3af): "not-reviewed"
- On hover: tooltip with status and comment count
- Clicking badge selects the file

**FileDetail panel:**
- New "Code Review" section (below metrics, above explanation)
- Shows:
  - Review status badge + label
  - Comment count
  - Short summary
  - "View on CodeRabbit" link (external_review_url)
  - "Refresh Reviews" button
- While loading: spinner + "Fetching review data..."
- If error: "CodeRabbit review data unavailable"

## Tech Decisions

**Why cache reviews at analysis time?**
- Performance: Instant display, no per-click API calls
- Consistency: Reviews match code snapshot
- Trade-off: Reviews age; users can refresh

**Why on-demand refresh button?**
- Users control freshness
- Avoids spamming CodeRabbit API
- Clear UX (button indicates possible staleness)

**Why read-only (Phase 5)?**
- Simpler MVP: pull and display
- Trigger reviews, two-way sync → Phase 6+

## Files to Create

- `lib/coderabbit/client.ts` — CodeRabbit API client
- `lib/coderabbit/storage.ts` — Database operations
- `app/api/coderabbit/refresh/route.ts` — API endpoint
- `supabase/migrations/002_add_coderabbit_reviews.sql` — Schema migration
- `__tests__/coderabbit.test.ts` — Tests

## Files to Modify

- `lib/parser/runner.ts` — Fetch reviews after analysis
- `components/DependencyGraph.tsx` — Add badges
- `components/FileDetail.tsx` — Add Code Review section
- `hooks/useFileDetail.ts` — Add review data and refresh
- `hooks/useAnalysis.ts` — Include reviews in Analysis type

## Steps (10 tasks)

### Task 1: Create CodeRabbit Client
- [ ] Create `lib/coderabbit/client.ts`
- [ ] Implement `fetchReviewsForRepo(repoUrl, apiKey)`
- [ ] Handle CodeRabbit API auth and response parsing
- [ ] Error handling for API failures

### Task 2: Create Storage Layer
- [ ] Create `lib/coderabbit/storage.ts`
- [ ] Implement CRUD functions for `coderabbit_reviews`
- [ ] Write queries with RLS enforcement

### Task 3: Create Database Migration
- [ ] Create `supabase/migrations/002_add_coderabbit_reviews.sql`
- [ ] Add `coderabbit_reviews` table with RLS policies
- [ ] Add `coderabbit_api_key` to `organizations`
- [ ] Run migration on Supabase

### Task 4: Update Phase 3 (analyzeRepository)
- [ ] Modify `lib/parser/runner.ts`
- [ ] After analysis stored, call `fetchCodeRabbitReviews()`
- [ ] Handle timeout and errors gracefully
- [ ] Log success/failure

### Task 5: Create API Endpoint
- [ ] Create `app/api/coderabbit/refresh/route.ts`
- [ ] Implement POST handler
- [ ] Auth + RLS verification
- [ ] Call `refreshReview()`, return data

### Task 6: Update DependencyGraph Component
- [ ] Modify `components/DependencyGraph.tsx`
- [ ] Accept `reviews` prop
- [ ] Add review status badges to nodes
- [ ] Implement badge colors
- [ ] Add hover tooltips

### Task 7: Update FileDetail Component
- [ ] Modify `components/FileDetail.tsx`
- [ ] Add "Code Review" section
- [ ] Display review status, comments, summary
- [ ] Implement "Refresh Reviews" button
- [ ] Handle loading and error states

### Task 8: Update Hooks
- [ ] Modify `hooks/useFileDetail.ts`
- [ ] Add `reviews` parameter and state
- [ ] Implement `refreshReview()` function
- [ ] Modify `hooks/useAnalysis.ts` to include reviews

### Task 9: Write Tests
- [ ] Create `__tests__/coderabbit.test.ts`
- [ ] Test CodeRabbit client (mock API)
- [ ] Test storage layer (DB operations)
- [ ] Test refresh endpoint (auth, RLS, errors)
- [ ] Test component integration

### Task 10: Build and Verify
- [ ] `pnpm build` — zero errors
- [ ] `pnpm test` — all tests passing
- [ ] `pnpm tsc --noEmit` — zero TypeScript errors
- [ ] Manual verification: analyze repo, see badges

## Success Criteria

- [ ] Analyze repo, see review badges on nodes (correct colors)
- [ ] Click badge → file selected, Code Review section shows
- [ ] "Refresh Reviews" button updates data
- [ ] "View on CodeRabbit" link opens review page
- [ ] RLS verified: different org user can't see reviews
- [ ] CodeRabbit unavailable → analysis completes anyway
- [ ] All tests pass, zero errors
