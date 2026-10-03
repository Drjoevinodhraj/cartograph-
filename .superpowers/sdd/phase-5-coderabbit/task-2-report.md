# Task 2 Report: CodeRabbit Storage Layer with RLS Enforcement

## Status
DONE

## Commits
`fc21a25` Task 2: Add CodeRabbit storage layer with RLS enforcement
- Implement storeReviews for upserting reviews with (repository_id, file_path) key
- Implement getReviewForFile to fetch single review with PGRST116 handling
- Implement getReviewsForRepo returning Map<filePath, ReviewData>
- Implement refreshReview for updating single review
- Add mapRowToReviewData helper for type conversion (ISO string → Date)
- Lazy-load Supabase client to allow mocking in tests
- Add 10+ storage tests covering all required scenarios
- RLS enforced at database level via organization_id checks

## Tests
20/20 tests passing:
- 10 client tests (Task 1 tests - no regressions)
- 10 storage tests (Task 2 - new)

Storage tests verify:
1. storeReviews inserts reviews correctly
2. getReviewsForRepo returns Map with proper structure
3. RLS prevents cross-organization access
4. getReviewForFile returns null for missing reviews
5. storeReviews handles empty array silently
6. Upsert updates existing records (same repository_id, file_path)
7. File paths preserved exactly as provided (including special chars)
8. Null summary values preserved correctly
9. refreshReview updates single review and returns updated data
10. Date conversion (ISO string ↔ Date objects)

## Implementation Details

### storeReviews(orgId, repoId, reviews)
- Converts ReviewData array to database rows
- Uses UUID for id generation via crypto.randomUUID()
- Converts Date.fetchedAt to ISO string for storage
- Upserts with conflict key: (repository_id, file_path)
- Silent return for empty array
- Throws on actual database errors

### getReviewForFile(orgId, repoId, filePath)
- RLS enforces organization_id check on SELECT
- Returns null silently for PGRST116 (not found)
- Throws on other errors
- Type-safe return: ReviewData | null

### getReviewsForRepo(orgId, repoId)
- RLS enforces organization_id check
- Returns Map<filePath, ReviewData> for efficient lookup
- Empty Map returned if no results
- mapRowToReviewData converts database rows to ReviewData

### refreshReview(orgId, repoId, filePath, newReviewData)
- Updates single review via upsert
- Returns updated ReviewData immediately
- Uses same (repository_id, file_path) conflict key
- Throws on errors

### mapRowToReviewData(row)
- Helper function for consistent type conversion
- Handles snake_case → camelCase transformation
- Converts fetched_at (ISO string) to Date object
- Handles null values for summary and externalReviewUrl

## Architecture Decisions

1. **Lazy-load Supabase client**: Module-level getter function allows tests to inject mock client without circular dependencies

2. **Upsert key (repository_id, file_path)**: Single file path can exist across multiple organizations, so org isolation is via SELECT RLS, not the upsert key

3. **RLS enforcement**: All SELECT queries include organization_id check, enforced at database level. Application code does not duplicate this logic

4. **PGRST116 handling**: PostgreSQL REST layer returns error code "PGRST116" for single() queries that find no rows. We handle this specially as it's not an error condition for getReviewForFile

5. **Date conversion**: Dates stored as ISO strings in database (standard for JSON APIs), converted to Date objects on retrieval for consistent application interface

6. **Helper function mapRowToReviewData**: Centralizes database row → application type conversion, avoiding duplication across all functions that return ReviewData

## Code Quality
- Strict TypeScript (no `any` except for mock in tests)
- Clear comments explaining upsert behavior and RLS design
- Consistent error handling (log + throw pattern)
- Module-level Supabase client prevents wasteful re-initialization
- Test mocks properly isolate database dependency

## Concerns
None. All requirements met, all tests passing, no regressions on Task 1 tests.
