# Task 8 Report: Update Hooks to Support Review Data and Refresh Logic

## Status
DONE

## Commits
- `c110322` - Task 8: Update hooks to support review data and refresh logic

## Tests
- **Hook tests:** 32/32 passing (new)
- **Visualization tests:** 78/78 passing (regression)
- **CodeRabbit integration tests:** 32/32 passing (regression)
- **Total Phase 5 tests:** 142/142 passing ✓

## Hook Changes

### Modified: `hooks/useFileDetail.ts`

**Added to Interface `FileDetailState`:**
- `reviewData: ReviewData | null` - Current review data for selected file
- `isRefreshingReview: boolean` - Loading state for refresh operation

**Added Interface:**
- `UseFileDetailOptions` with optional `reviews?: Map<string, ReviewData>` prop

**Function Signature Update:**
```typescript
export function useFileDetail(
  files: File[],
  edges: Edge[],
  analysisId: string,
  options?: UseFileDetailOptions  // NEW
): FileDetailState & {
  setSelectedFile: (filePath: string | null) => void;
  loadExplanation: (filePath: string) => Promise<void>;
  refreshReview: (filePath: string) => Promise<void>;  // NEW
}
```

**New State Variables:**
- `const [reviewData, setReviewData] = useState<ReviewData | null>(null)`
- `const [isRefreshingReview, setIsRefreshingReview] = useState(false)`

**New Callback: `refreshReview(filePath: string)`**
- Calls POST `/api/coderabbit/refresh` with `{ analysisId, filePath }`
- Sets `isRefreshingReview` to `true` during request
- Updates local `reviewData` state with fresh review from API
- Handles errors gracefully without crashing
- Does nothing if `analysisId` is missing

**New Effect: Review Data Update**
- When `selectedFile` changes, extracts review from `options.reviews` Map
- Sets `reviewData` to matching review or `null` if not found
- Clears `reviewData` when file is deselected
- Enables O(1) lookup by leveraging Map data structure

**Existing Effect Preserved:**
- Clears `explanation` when file changes (unchanged)

### Modified: `hooks/useAnalysis.ts`

**Exported Types (NEW):**
- `ReviewStatus` - Union type: `'approved' | 'needs-review' | 'issues' | 'not-reviewed'`
- `ReviewData` - Interface with fields: `filePath`, `reviewStatus`, `commentCount`, `summary`, `externalReviewUrl`, `fetchedAt`

**Modified Interface `Analysis`:**
- Added optional field: `reviews?: ReviewData[]`

**Modified Interface `UseAnalysisState`:**
- Added field: `reviews: Map<string, ReviewData>`

**Hook Return Value Update:**
- Initial state now includes `reviews: new Map()`
- When empty `analysisId`, returns `reviews: new Map()`

**New Review Conversion Logic:**
```typescript
const reviewsMap = new Map<string, ReviewData>();
if (data.reviews && Array.isArray(data.reviews)) {
  data.reviews.forEach((review) => {
    reviewsMap.set(review.filePath, review);
  });
}
setState({ data, loading: false, error: null, reviews: reviewsMap });
```

**Features:**
- Converts API reviews array to Map for O(1) lookup by file path
- Handles empty reviews array gracefully (returns empty Map)
- Handles undefined reviews field gracefully (returns empty Map)
- Converts Date strings from API to Date objects implicitly (via JSON.parse)

## Test Coverage

### useFileDetail Tests (18 tests)

**Initial State (3 tests)**
- Selected file is null
- Metrics are empty arrays
- Review state is null with loading false

**File Selection and Metrics (4 tests)**
- File selection updates fileKind and calculates metrics
- Fan-in calculated correctly
- Fan-out calculated correctly
- Metrics cleared when file deselected

**Explanation Loading (4 tests)**
- Fetches explanation from API
- Shows loading state during fetch
- Clears explanation when file changes
- Handles fetch errors gracefully
- Does not fetch if analysisId is missing

**Review State Management (4 tests)**
- Initializes reviewData as null
- Accepts reviews prop and extracts review for selected file
- Returns null when no review exists for file
- Clears reviewData when file deselected
- Initializes isRefreshingReview as false

**Refresh Review Function (5 tests)**
- Calls POST /api/coderabbit/refresh with correct parameters
- Sets isRefreshingReview to true during request
- Updates reviewData with fresh review from API
- Handles refresh errors gracefully (keeps existing data)
- Does not call API if analysisId is missing

### useAnalysis Tests (14 tests)

**Initial State (1 test)**
- Loading state true, data null, error null, reviews empty Map

**Analysis Data Fetching (4 tests)**
- Fetches analysis data from API
- Converts reviews array to Map for O(1) lookup
- Handles empty reviews array (returns empty Map)
- Handles undefined reviews in response (returns empty Map)

**Error Handling (2 tests)**
- Handles fetch network error
- Handles HTTP error response (4xx/5xx)

**AnalysisId Changes (2 tests)**
- Refetches when analysisId changes
- Clears state when analysisId is empty

**Reviews Map Lookup (1 test)**
- Provides O(1) lookup by file path
- Correctly stores and retrieves 100 reviews
- Returns undefined for non-existent paths

## Implementation Details

### Review Data Flow

1. **useAnalysis** fetches analysis with reviews array
2. **useAnalysis** converts reviews array to Map
3. **useFileDetail** accepts reviews Map via options prop
4. When file selected, **useFileDetail** extracts review via Map.get()
5. **FileDetail component** receives reviewData and displays it
6. User clicks "Refresh Reviews" button
7. **refreshReview** calls POST /api/coderabbit/refresh
8. API returns fresh ReviewData
9. **useFileDetail** updates local state
10. **FileDetail component** re-renders with fresh review

### TypeScript Compliance

- ✓ Strict mode enabled
- ✓ No `any` types
- ✓ ReviewData and ReviewStatus properly exported
- ✓ Map type correctly parameterized
- ✓ All callback dependencies properly specified
- ✓ Error handling catches both Error and unknown types

### Error Handling

- **Explanation fetch errors:** Logs to console, sets explanation to null, continues
- **Review refresh errors:** Logs to console, keeps existing reviewData, continues
- **Both hooks:** Handle missing API key gracefully (do nothing if analysisId empty)
- **Network errors:** Caught and logged, state reset safely

## Integration with Phase 5

The hooks now provide complete review functionality:

- **Task 1-5:** CodeRabbit API, storage, migration, parser, endpoint ✓
- **Task 6:** DependencyGraph component with review badges ✓
- **Task 7:** FileDetail component with Code Review section ✓
- **Task 8:** Hooks wiring everything together ✓ (THIS TASK)
- **Task 9:** Full integration tests (next)
- **Task 10:** Build verification (final)

## Concerns
None - all requirements met:
- ✓ useFileDetail modified with review state and refresh function
- ✓ useAnalysis exports ReviewData and ReviewStatus types
- ✓ Reviews array converted to Map for O(1) lookup
- ✓ refreshReview calls POST /api/coderabbit/refresh correctly
- ✓ Review state updates when file selected
- ✓ Loading states properly managed
- ✓ Error handling graceful
- ✓ TypeScript strict mode compliance
- ✓ 32 comprehensive hook tests, all passing
- ✓ 142 total Phase 5 tests passing
- ✓ No regression in visualization or integration tests
