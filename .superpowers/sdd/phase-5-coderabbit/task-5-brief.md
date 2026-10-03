# Task 5: API Endpoint for On-Demand Refresh — Requirements Brief

## Context
Phase 5 CodeRabbit integration. This task creates the refresh endpoint that allows users to fetch fresh review data for a single file on-demand. Task 5 depends on Task 1-4 and is upstream of Task 8 (hooks use this endpoint).

**Your job:** Create `app/api/coderabbit/refresh/route.ts` POST endpoint with auth, RLS verification, and CodeRabbit API integration.

## File to Create
- `app/api/coderabbit/refresh/route.ts` — Next.js API route

## Exact Requirements

### Endpoint Specification
- **Method**: POST
- **Path**: `/api/coderabbit/refresh`
- **Input**: JSON body `{ analysisId: string, filePath: string }`
- **Output**: JSON `ReviewData | error message`
- **Status codes**: 200 (success), 400 (bad input), 401 (unauthorized), 403 (forbidden), 404 (not found), 503 (CodeRabbit not configured), 500 (server error)

### Request Handling Steps
1. **Parse and validate input**
   - Extract analysisId and filePath from request.json()
   - If missing: return 400 with `{ error: 'Missing analysisId or filePath' }`

2. **Authenticate user**
   - Use `auth()` from '@clerk/nextjs/server'
   - If userId not present: return 401 with `{ error: 'Unauthorized' }`

3. **Fetch analysis and verify ownership**
   - Query analyses table: `SELECT id, repository_id, organization_id FROM analyses WHERE id = analysisId`
   - If not found: return 404 with `{ error: 'Analysis not found' }`

4. **Verify user is in organization (RLS check)**
   - Query organization_members: `SELECT organization_id FROM organization_members WHERE organization_id = analysis.organization_id AND user_id = userId`
   - If not found: return 403 with `{ error: 'Unauthorized - not in organization' }`

5. **Get repository info**
   - Query repositories table: `SELECT id, url FROM repositories WHERE id = analysis.repository_id`
   - If not found: return 404 with `{ error: 'Repository not found' }`

6. **Get organization's CodeRabbit API key**
   - Query organizations: `SELECT coderabbit_api_key FROM organizations WHERE id = analysis.organization_id`
   - If not found or API key is null: return 503 with `{ error: 'CodeRabbit not configured for organization' }`

7. **Fetch fresh review from CodeRabbit**
   - Call `fetchReviewsForRepo(repo.url, org.coderabbit_api_key)`
   - Find review matching filePath: `reviews.find((r) => r.filePath === filePath)`
   - If not found: create default "not-reviewed" ReviewData

8. **Store updated review in database**
   - Upsert to coderabbit_reviews table with new fetched_at timestamp

9. **Return ReviewData**
   - Status 200 with ReviewData as JSON

### Error Handling
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { fetchReviewsForRepo } from '@/lib/coderabbit/client';
import type { ReviewData } from '@/lib/coderabbit/types';

export async function POST(request: NextRequest) {
  try {
    // 1. Parse input
    const { analysisId, filePath } = await request.json();
    if (!analysisId || !filePath) {
      return NextResponse.json({ error: 'Missing analysisId or filePath' }, { status: 400 });
    }

    // 2. Auth
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 3-8. Fetch, verify, update (as per steps above)
    // ... implementation details ...

    // 9. Return
    return NextResponse.json(freshReviewData);
  } catch (error) {
    console.error('Refresh endpoint error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

### Tests Required
These exact tests must pass:

1. **Success path**: Valid request returns ReviewData with 200
2. **Missing input**: No analysisId → 400
3. **Unauthorized**: No auth token → 401
4. **Analysis not found**: Invalid analysisId → 404
5. **Not in org**: User from different org → 403
6. **CodeRabbit not configured**: No API key → 503
7. **Stale review cached**: API returns updated status → database updated with new timestamp
8. **File not in CodeRabbit**: API returns no review for file → default "not-reviewed" created
9. **API error**: CodeRabbit API fails → 503 or graceful response
10. **Concurrent requests**: Two requests for same file → no race condition

## Global Constraints
- TypeScript strict mode, no any
- Use Clerk for auth: `auth()` from '@clerk/nextjs/server'
- Use Supabase service role for DB queries
- Check organization_id at DB level (RLS), don't assume auth token
- Handle all 6 status codes: 200, 400, 401, 403, 404, 503
- Never expose database errors to client (always 500)
- Error messages are user-friendly (no stack traces)

## Code Quality
- Comments explain each verification step
- Clear error messages
- Proper HTTP status codes
- No blocking on CodeRabbit API (timeout already handled by client)

## Report File
Write your report to: `.superpowers/sdd/phase-5-coderabbit/task-5-report.md`

Format:
```
## Status
DONE

## Commits
[commit message(s)]

## Tests
[X/X endpoint tests passing]

## Status Codes Tested
- 200: ✓
- 400: ✓
- 401: ✓
- 403: ✓
- 404: ✓
- 503: ✓

## Concerns
[if any]
```

Done when:
- API route created and implemented
- 10+ tests passing (all status codes covered)
- All Phase 5 tests still passing (no regressions)
- Committed to git
- Report written
