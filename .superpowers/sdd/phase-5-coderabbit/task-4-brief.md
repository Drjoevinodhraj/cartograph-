# Task 4: Phase 3 Integration — Fetch Reviews After Analysis — Requirements Brief

## Context
Phase 5 CodeRabbit integration. This task integrates CodeRabbit review fetching into the Phase 3 analyzeRepository function. Reviews are fetched asynchronously after analysis completes and stores successfully. Task 4 depends on Task 1 (client), Task 2 (storage), Task 3 (migration) and is upstream of Task 5 (API endpoint), Task 8 (hooks).

**Your job:** Modify `lib/parser/runner.ts` to call CodeRabbit API after analysis storage, with graceful degradation if CodeRabbit fails.

## Files to Modify
- `lib/parser/runner.ts` — Update analyzeRepository to fetch reviews after storage

## Exact Requirements

### Integration Pattern
After `analyzeRepository()` stores the analysis to the database successfully:

1. Get CodeRabbit API key from organization (query organizations table for coderabbit_api_key)
2. If API key exists and is not null/empty:
   - Call `fetchReviewsForRepo(repoUrl, apiKey)` asynchronously (non-blocking)
   - Fire-and-forget pattern: wrap in try-catch, log errors, don't throw
   - Enforce 30-second timeout using Promise.race()
3. If API key is null/empty:
   - Log debug message "No CodeRabbit API key configured for organization"
   - Continue (no error)
4. If fetch fails or times out:
   - Log warning: "Failed to fetch CodeRabbit reviews: {error}"
   - Don't block analysis completion
   - Return nothing (fire-and-forget)

### Code Pattern
```typescript
// After analysis has been stored to database

// Helper function (add to runner.ts)
async function getOrganizationCodeRabbitKey(orgId: string): Promise<string | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const { data, error } = await supabase
    .from('organizations')
    .select('coderabbit_api_key')
    .eq('id', orgId)
    .single();

  if (error) {
    console.warn('Failed to fetch organization CodeRabbit API key:', error);
    return null;
  }

  return data?.coderabbit_api_key || null;
}

// In analyzeRepository, after storing analysis:
if (orgId && repoId) {
  // Fetch reviews asynchronously without blocking analysis completion
  const coderabbitApiKey = await getOrganizationCodeRabbitKey(orgId);

  if (coderabbitApiKey) {
    // Fire and forget with timeout
    Promise.race([
      fetchReviewsForRepo(repositoryUrl, coderabbitApiKey)
        .then((reviews) => storeReviews(orgId, repoId, reviews))
        .catch((error) => {
          console.warn('Failed to fetch CodeRabbit reviews:', error);
        }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('CodeRabbit timeout')), 30000)
      ),
    ]).catch((error) => {
      console.warn('CodeRabbit review fetch timed out or failed:', error);
      // Don't fail analysis on CodeRabbit errors
    });
  } else {
    console.debug('No CodeRabbit API key configured for organization');
  }
}
```

### Key Behaviors
- **Non-blocking**: Reviews fetch happens after analysis response is returned (async)
- **30-second timeout**: Promise.race() ensures API call doesn't hang forever
- **Graceful degradation**: If CodeRabbit fails, analysis still succeeds
- **No API key**: Log debug message, continue (expected when org hasn't configured CodeRabbit)
- **Missing imports**: Import `fetchReviewsForRepo` and `storeReviews` from their modules
- **Logging**: Use console.warn() for failures, console.debug() for no-key case

### Tests Required
These exact tests must pass:

1. **Analysis completes when CodeRabbit succeeds**: Call analyzeRepository, reviews are stored in DB (fire-and-forget, so need to wait a bit)
2. **Analysis completes even if CodeRabbit fails**: Set invalid API key, analyze, analysis succeeds with warnings logged
3. **Respects 30-second timeout**: Call with slow/non-existent endpoint, verify total time < 60s (analysis + timeout)
4. **No API key is handled**: No CodeRabbit key in org settings, analyze, debug message logged, no errors
5. **Fire-and-forget pattern**: Analysis returns to caller before CodeRabbit fetch completes (or verify via async behavior)

## Global Constraints
- TypeScript strict mode, no any
- Use `fetchReviewsForRepo()` from Task 1 (lib/coderabbit/client.ts)
- Use `storeReviews()` from Task 2 (lib/coderabbit/storage.ts)
- API key queried via Supabase service role
- Promise.race() for timeout enforcement (30 seconds)
- No blocking: fire-and-forget pattern, don't await

## Code Quality
- Comments explain non-blocking pattern and why graceful degradation matters
- Error messages are descriptive (log what failed, why)
- Helper function (getOrganizationCodeRabbitKey) is testable and reusable
- Code matches existing runner.ts style and patterns

## Verification Steps
1. Read existing analyzeRepository function to understand where to add code
2. Add imports: fetchReviewsForRepo, storeReviews
3. Add getOrganizationCodeRabbitKey helper function
4. Add CodeRabbit fetch call after analysis storage (inside the function, after DB insert succeeds)
5. Write tests verifying all 5 scenarios above
6. Run tests: all should pass
7. Verify no regressions: existing Phase 3 tests still pass
8. Commit to git

## Report File
Write your report to: `.superpowers/sdd/phase-5-coderabbit/task-4-report.md`

Format:
```
## Status
DONE or DONE_WITH_CONCERNS

## Commits
[commit message(s)]

## Tests
[X/X tests passing, including Phase 3 regression tests]

## Integration Points
[Describe exactly where the CodeRabbit fetch was added in analyzeRepository]

## Concerns
[if any]
```

Done when:
- Code added to lib/parser/runner.ts
- getOrganizationCodeRabbitKey helper function exists
- CodeRabbit fetch call integrated after analysis storage
- 5+ integration tests passing
- All Phase 3 tests still passing (no regressions)
- Committed to git
- Report written
