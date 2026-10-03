# Task 2: Storage Layer and Database Types — Requirements Brief

## Context
Phase 5 CodeRabbit integration. This task creates database operations (CRUD) for reviews with RLS enforcement. Task 2 depends on Task 1 (uses ReviewData type) and is upstream of Task 3 (migration), Task 4 (Phase 3 integration), Task 5 (API endpoint), Task 8 (hooks).

**Your job:** Implement Supabase storage functions that cache reviews in the database with organization-level row-level security.

## Files to Create
- `lib/coderabbit/storage.ts` — Storage functions for database operations

## Files to Test
- `__tests__/coderabbit.test.ts` — Add storage tests (keep client tests from Task 1)

## Exact Requirements

### Storage Functions

**1. storeReviews**
```typescript
export async function storeReviews(
  orgId: string,
  repoId: string,
  reviews: ReviewData[]
): Promise<void>
```
- Takes organization ID, repository ID, array of ReviewData
- Upserts into `coderabbit_reviews` table
- Upsert key: `(repository_id, file_path)` — same file path in same repo is updated, not duplicated
- For each review, insert/update:
  - id: new UUID (use `crypto.randomUUID()`)
  - organization_id: passed orgId
  - repository_id: passed repoId
  - file_path: review.filePath
  - review_status: review.reviewStatus
  - comment_count: review.commentCount
  - summary: review.summary
  - external_review_url: review.externalReviewUrl
  - fetched_at: review.fetchedAt (convert Date to ISO string)
  - created_at: new Date().toISOString()
- If reviews array is empty, return without error
- If error during upsert, log and throw (don't swallow database errors)

**2. getReviewForFile**
```typescript
export async function getReviewForFile(
  orgId: string,
  repoId: string,
  filePath: string
): Promise<ReviewData | null>
```
- Fetch single review by organization, repository, file path
- RLS will enforce that orgId is in user's organizations
- Query: SELECT * FROM coderabbit_reviews WHERE organization_id = orgId AND repository_id = repoId AND file_path = filePath
- Return mapped ReviewData if found, null if not found
- If error code is PGRST116 (not found), return null silently (not an error)
- If other error, log and throw

**3. getReviewsForRepo**
```typescript
export async function getReviewsForRepo(
  orgId: string,
  repoId: string
): Promise<Map<string, ReviewData>>
```
- Fetch all reviews for organization + repository
- RLS enforces orgId check
- Query: SELECT * FROM coderabbit_reviews WHERE organization_id = orgId AND repository_id = repoId
- Return Map<filePath, ReviewData> (key is file_path string, value is ReviewData)
- If no results, return empty Map
- If error, log and throw

**4. refreshReview** (used by Task 5 API endpoint)
```typescript
export async function refreshReview(
  orgId: string,
  repoId: string,
  filePath: string,
  newReviewData: ReviewData
): Promise<ReviewData>
```
- Update single review in database
- Upsert same way as storeReviews, but single record
- Return the updated ReviewData
- If error, log and throw

### Helper Function (internal)
```typescript
function mapRowToReviewData(row: any): ReviewData {
  return {
    filePath: row.file_path,
    reviewStatus: row.review_status as ReviewStatus,
    commentCount: row.comment_count || 0,
    summary: row.summary || null,
    externalReviewUrl: row.external_review_url || null,
    fetchedAt: new Date(row.fetched_at),
  };
}
```

### Supabase Client Setup
- Use `createClient()` from '@supabase/supabase-js'
- URL: `process.env.NEXT_PUBLIC_SUPABASE_URL!`
- Service role key (for server code): `process.env.SUPABASE_SERVICE_KEY!`
- Create client at module level (once), don't recreate per function

### Tests Required
These exact tests must pass:

1. **storeReviews inserts reviews:** Call storeReviews with 2 reviews, then getReviewForFile for each → both exist
2. **getReviewsForRepo returns Map:** Call storeReviews with 2 reviews, then getReviewsForRepo → Map with 2 entries, .get() works
3. **RLS prevents cross-org access:** Store review in org-1, query from org-2 → returns null (not found)
4. **getReviewForFile returns null on not found:** Query for nonexistent file → returns null
5. **storeReviews with empty array:** Call with empty reviews → no error, succeeds silently
6. **Upsert updates existing:** Insert review, insert again with different comment count → count is updated, not duplicated
7. **File path preserved exactly:** Insert with special path like '@components/[id]/page.tsx' → retrieved with same path
8. **Handle null summary:** Insert with summary=null, retrieve → summary is null (not empty string)

## Global Constraints
- TypeScript strict mode, no any
- Supabase client created once (module level), not per function
- RLS enforced at database level, not in application code (SELECT always includes org check)
- Use `crypto.randomUUID()` for ID generation (native in Node 18+)
- Dates stored as ISO strings in database, converted back to Date objects on retrieval
- Upsert key is `(repository_id, file_path)`, not id (multiple orgs can have same file path)

## Code Quality
- Comment decisions (why upsert is used, why RLS matters)
- Helper function mapRowToReviewData avoids duplication
- Error handling: PGRST116 is not-found (silent), other errors are real (throw)
- No magic strings — extract error codes to const if checking multiple times

## Report File
Write your report to: `.superpowers/sdd/phase-5-coderabbit/task-2-report.md`

Format:
```
## Status
DONE or DONE_WITH_CONCERNS or NEEDS_CONTEXT or BLOCKED

## Commits
[list of commit messages]

## Tests
[X/X tests passing in storage section]

## Concerns
[if any]
```

Done when:
- Storage layer implemented in `lib/coderabbit/storage.ts`
- All 8+ storage tests in `__tests__/coderabbit.test.ts` passing
- File committed to git
- Report written
- Task 1 tests still passing (no regressions)
