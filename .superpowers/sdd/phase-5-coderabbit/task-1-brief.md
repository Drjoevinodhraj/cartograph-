# Task 1: CodeRabbit Client and Types — Requirements Brief

## Context
Phase 5 CodeRabbit integration. This task creates the API client and shared TypeScript types for review data. Task 1 is upstream of Task 2 (storage), Task 4 (Phase 3 integration), Task 5 (API endpoint), Task 8 (hooks).

**Your job:** Write the types and the CodeRabbit API client with timeout handling and error resilience. All code is production-ready.

## Files to Create
- `lib/coderabbit/types.ts` — ReviewData, ReviewStatus, CodeRabbitReview interfaces
- `lib/coderabbit/client.ts` — fetchReviewsForRepo function with 30-second timeout

## Files to Test
- `__tests__/coderabbit.test.ts` — Client tests only (storage tests in Task 2)

## Exact Requirements

### ReviewStatus Type
An enum of exactly these four values (strings, not enum keyword):
- `'approved'`
- `'needs-review'`
- `'issues'`
- `'not-reviewed'`

### ReviewData Interface
```typescript
export interface ReviewData {
  filePath: string;           // Normalized file path (e.g., "src/Button.tsx")
  reviewStatus: ReviewStatus; // One of the four values above
  commentCount: number;       // >= 0
  summary: string | null;     // Short summary text or null
  externalReviewUrl: string | null; // Link to CodeRabbit review or null
  fetchedAt: Date;            // When review was fetched
}
```

### CodeRabbitReview Interface (Internal API Response)
```typescript
export interface CodeRabbitReview {
  file_path: string;
  review_status: ReviewStatus;
  comment_count: number;
  summary?: string;           // Optional in API response
  external_url?: string;      // Optional in API response
}
```

### fetchReviewsForRepo Function
**Signature:**
```typescript
export async function fetchReviewsForRepo(
  repoUrl: string,
  apiKey: string
): Promise<ReviewData[]>
```

**Behavior:**
- Takes GitHub repo URL and CodeRabbit API key
- Makes HTTP POST request to `https://api.coderabbit.ai/v1/reviews` with `{ repository_url: repoUrl }`
- Uses Bearer token auth: `Authorization: Bearer {apiKey}`
- Enforces 30-second timeout using AbortController
- Parses response as JSON, expects `{ reviews: CodeRabbitReview[] }`
- Validates each review: check `review_status` is valid (one of the four), skip invalid
- Normalizes file paths: convert backslashes to forward slashes, strip leading slashes
- Returns array of ReviewData with fetchedAt = now
- **Error handling (graceful degradation):**
  - If apiKey is empty/null: log warning, return `[]`
  - If request times out (AbortError): log warning "CodeRabbit API request timed out (30s)", return `[]`
  - If response not ok (e.g., 401, 403, 500): log warning with status, return `[]`
  - If JSON parse fails: log warning, return `[]`
  - Never throw; always return array (possibly empty)

**Timeout Behavior:**
- Use native `AbortController` with 30-second timeout
- On abort, the fetch will reject with AbortError
- Catch AbortError separately and log specifically

**File Path Normalization:**
```typescript
function normalizeFilePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '');
}
```

### Tests Required
These exact tests must pass:

1. **Basic fetch:** `fetchReviewsForRepo('https://github.com/example/repo', 'test-key')` returns array (may be empty if API mocked)
2. **Type validation:** If result has reviews, each must have filePath (string), reviewStatus (one of four), commentCount (number), etc.
3. **Error handling - missing API key:** Call with empty string returns `[]` with warning logged
4. **Error handling - timeout:** Call with slow endpoint times out within 35 seconds, returns `[]`
5. **Invalid review status filtering:** If API returns a review with status='unknown', it's filtered out (not in result)
6. **File path normalization:** API returns `file_path: 'src\\button.tsx'`, result has `filePath: 'src/button.tsx'`
7. **Happy path:** Call with valid mock API returns correct ReviewData array with correct types

## Global Constraints
- TypeScript strict mode, no any
- Review statuses: exactly `'approved'` | `'needs-review'` | `'issues'` | `'not-reviewed'`
- Timeout: 30 seconds maximum, enforced via AbortController
- File path normalization required (backslashes → forward slashes, strip leading slashes)
- Graceful degradation: return empty array on all errors, never throw
- No external dependencies except what's in package.json (fetch is native in Node 18+)

## Code Quality
- Comment decisions, not syntax
- No magic numbers (30000 is ok, extract as const)
- Test code uses jest mocking for CodeRabbit API responses
- Self-review: are all four review statuses handled? Is timeout respected? Do paths normalize?

## Report File
Write your report to: `.superpowers/sdd/phase-5-coderabbit/task-1-report.md`

Format:
```
## Status
DONE or DONE_WITH_CONCERNS or NEEDS_CONTEXT or BLOCKED

## Commits
[list of commit messages or git log range]

## Tests
[one-line summary of test results, e.g., "7/7 tests passing"]

## Concerns
[if any; optional]
```

Done when:
- Types defined in `lib/coderabbit/types.ts`
- Client implemented in `lib/coderabbit/client.ts`
- All 7+ tests in `__tests__/coderabbit.test.ts` passing
- Both files committed to git
- Report written to task-1-report.md
