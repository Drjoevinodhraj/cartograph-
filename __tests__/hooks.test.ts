import { renderHook, act, waitFor } from '@testing-library/react';
import { useFileDetail } from '@/hooks/useFileDetail';
import { useAnalysis } from '@/hooks/useAnalysis';
import type { File, Edge, ReviewData } from '@/hooks/useAnalysis';

// Mock fetch
global.fetch = jest.fn();

// Mock data
const mockFiles: File[] = [
  { path: 'app/page.tsx', kind: 'route', language: 'tsx', isBarrel: false },
  { path: 'components/Button.tsx', kind: 'component', language: 'tsx', isBarrel: false },
  { path: 'lib/utils.ts', kind: 'util', language: 'ts', isBarrel: false },
];

const mockEdges: Edge[] = [
  { from: 'app/page.tsx', to: 'components/Button.tsx', type: 'import' },
  { from: 'components/Button.tsx', to: 'lib/utils.ts', type: 'import' },
];

const mockReviewData: ReviewData = {
  filePath: 'components/Button.tsx',
  reviewStatus: 'approved',
  commentCount: 3,
  summary: 'Great implementation',
  externalReviewUrl: 'https://coderabbit.ai/reviews/abc123',
  fetchedAt: new Date(),
};

const mockReviews: ReviewData[] = [
  mockReviewData,
  {
    filePath: 'app/page.tsx',
    reviewStatus: 'needs-review',
    commentCount: 2,
    summary: 'Some improvements needed',
    externalReviewUrl: 'https://coderabbit.ai/reviews/def456',
    fetchedAt: new Date(),
  },
];

// =============================================================================
// useFileDetail Hook Tests
// =============================================================================

describe('useFileDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    test('initializes with null selected file', () => {
      const { result } = renderHook(() => useFileDetail(mockFiles, mockEdges, 'analysis-1'));

      expect(result.current.selectedFile).toBeNull();
      expect(result.current.fileKind).toBeNull();
      expect(result.current.explanation).toBeNull();
      expect(result.current.isLoadingExplanation).toBe(false);
    });

    test('initializes with empty metrics', () => {
      const { result } = renderHook(() => useFileDetail(mockFiles, mockEdges, 'analysis-1'));

      expect(result.current.fanIn).toEqual([]);
      expect(result.current.fanOut).toEqual([]);
      expect(result.current.blastRadius).toEqual([]);
      expect(result.current.neighbors).toEqual({ in: [], out: [] });
    });

    test('initializes review state as null', () => {
      const { result } = renderHook(() => useFileDetail(mockFiles, mockEdges, 'analysis-1'));

      expect(result.current.reviewData).toBeNull();
      expect(result.current.isRefreshingReview).toBe(false);
    });
  });

  describe('file selection and metrics calculation', () => {
    test('sets selected file and calculates metrics', () => {
      const { result } = renderHook(() => useFileDetail(mockFiles, mockEdges, 'analysis-1'));

      act(() => {
        result.current.setSelectedFile('components/Button.tsx');
      });

      expect(result.current.selectedFile).toBe('components/Button.tsx');
      expect(result.current.fileKind).toBe('component');
      expect(result.current.fanIn).toContain('app/page.tsx');
      expect(result.current.fanOut).toContain('lib/utils.ts');
    });

    test('calculates fan-in correctly', () => {
      const { result } = renderHook(() => useFileDetail(mockFiles, mockEdges, 'analysis-1'));

      act(() => {
        result.current.setSelectedFile('lib/utils.ts');
      });

      expect(result.current.fanIn).toContain('components/Button.tsx');
      expect(result.current.fanIn).toHaveLength(1);
    });

    test('calculates fan-out correctly', () => {
      const { result } = renderHook(() => useFileDetail(mockFiles, mockEdges, 'analysis-1'));

      act(() => {
        result.current.setSelectedFile('app/page.tsx');
      });

      expect(result.current.fanOut).toContain('components/Button.tsx');
      expect(result.current.fanOut).toHaveLength(1);
    });

    test('clears metrics when file is deselected', () => {
      const { result } = renderHook(() => useFileDetail(mockFiles, mockEdges, 'analysis-1'));

      act(() => {
        result.current.setSelectedFile('components/Button.tsx');
      });

      expect(result.current.fanIn.length).toBeGreaterThan(0);

      act(() => {
        result.current.setSelectedFile(null);
      });

      expect(result.current.selectedFile).toBeNull();
      expect(result.current.fanIn).toEqual([]);
      expect(result.current.fanOut).toEqual([]);
    });
  });

  describe('explanation loading', () => {
    test('fetches explanation for selected file', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ explanation: 'This is a button component.' }),
      });

      const { result } = renderHook(() => useFileDetail(mockFiles, mockEdges, 'analysis-1'));

      act(() => {
        result.current.setSelectedFile('components/Button.tsx');
      });

      act(() => {
        result.current.loadExplanation('components/Button.tsx');
      });

      await waitFor(() => {
        expect(result.current.explanation).toBe('This is a button component.');
      });
    });

    test('sets loading state during explanation fetch', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({ explanation: 'Test' }),
                }),
              50
            )
          )
      );

      const { result } = renderHook(() => useFileDetail(mockFiles, mockEdges, 'analysis-1'));

      act(() => {
        result.current.setSelectedFile('components/Button.tsx');
        result.current.loadExplanation('components/Button.tsx');
      });

      // Should show loading initially
      expect(result.current.isLoadingExplanation).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoadingExplanation).toBe(false);
      });
    });

    test('clears explanation when file changes', () => {
      const { result } = renderHook(() => useFileDetail(mockFiles, mockEdges, 'analysis-1'));

      act(() => {
        result.current.setSelectedFile('components/Button.tsx');
      });

      // Manually set explanation to simulate a loaded state
      act(() => {
        result.current.loadExplanation('components/Button.tsx');
      });

      act(() => {
        result.current.setSelectedFile('lib/utils.ts');
      });

      expect(result.current.explanation).toBeNull();
    });

    test('handles explanation fetch error gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const { result } = renderHook(() => useFileDetail(mockFiles, mockEdges, 'analysis-1'));

      act(() => {
        result.current.setSelectedFile('components/Button.tsx');
        result.current.loadExplanation('components/Button.tsx');
      });

      await waitFor(() => {
        expect(result.current.isLoadingExplanation).toBe(false);
      });

      expect(result.current.explanation).toBeNull();
    });

    test('does not fetch if analysisId is missing', async () => {
      const { result } = renderHook(() => useFileDetail(mockFiles, mockEdges, ''));

      act(() => {
        result.current.setSelectedFile('components/Button.tsx');
        result.current.loadExplanation('components/Button.tsx');
      });

      await waitFor(() => {
        expect(global.fetch).not.toHaveBeenCalled();
      });
    });
  });

  describe('review state management', () => {
    test('initializes reviewData as null', () => {
      const { result } = renderHook(() => useFileDetail(mockFiles, mockEdges, 'analysis-1'));

      expect(result.current.reviewData).toBeNull();
    });

    test('accepts reviews prop as Map and extracts review for selected file', () => {
      const reviewsMap = new Map<string, ReviewData>([
        ['components/Button.tsx', mockReviewData],
        ['app/page.tsx', mockReviews[1]],
      ]);

      const { result } = renderHook(() =>
        useFileDetail(mockFiles, mockEdges, 'analysis-1', { reviews: reviewsMap })
      );

      act(() => {
        result.current.setSelectedFile('components/Button.tsx');
      });

      expect(result.current.reviewData).toEqual(mockReviewData);
      expect(result.current.reviewData?.reviewStatus).toBe('approved');
      expect(result.current.reviewData?.commentCount).toBe(3);
    });

    test('returns null when no review exists for selected file', () => {
      const reviewsMap = new Map<string, ReviewData>([['app/page.tsx', mockReviews[1]]]);

      const { result } = renderHook(() =>
        useFileDetail(mockFiles, mockEdges, 'analysis-1', { reviews: reviewsMap })
      );

      act(() => {
        result.current.setSelectedFile('components/Button.tsx');
      });

      expect(result.current.reviewData).toBeNull();
    });

    test('clears reviewData when file is deselected', () => {
      const reviewsMap = new Map<string, ReviewData>([
        ['components/Button.tsx', mockReviewData],
      ]);

      const { result } = renderHook(() =>
        useFileDetail(mockFiles, mockEdges, 'analysis-1', { reviews: reviewsMap })
      );

      act(() => {
        result.current.setSelectedFile('components/Button.tsx');
      });

      expect(result.current.reviewData).not.toBeNull();

      act(() => {
        result.current.setSelectedFile(null);
      });

      expect(result.current.reviewData).toBeNull();
    });

    test('initializes isRefreshingReview as false', () => {
      const { result } = renderHook(() => useFileDetail(mockFiles, mockEdges, 'analysis-1'));

      expect(result.current.isRefreshingReview).toBe(false);
    });
  });

  describe('refreshReview function', () => {
    test('calls POST /api/coderabbit/refresh with correct parameters', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockReviewData,
      });

      const { result } = renderHook(() => useFileDetail(mockFiles, mockEdges, 'analysis-1'));

      act(() => {
        result.current.setSelectedFile('components/Button.tsx');
        result.current.refreshReview('components/Button.tsx');
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/coderabbit/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            analysisId: 'analysis-1',
            filePath: 'components/Button.tsx',
          }),
        });
      });
    });

    test('sets isRefreshingReview to true during refresh', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => mockReviewData,
                }),
              50
            )
          )
      );

      const { result } = renderHook(() => useFileDetail(mockFiles, mockEdges, 'analysis-1'));

      act(() => {
        result.current.setSelectedFile('components/Button.tsx');
        result.current.refreshReview('components/Button.tsx');
      });

      expect(result.current.isRefreshingReview).toBe(true);

      await waitFor(() => {
        expect(result.current.isRefreshingReview).toBe(false);
      });
    });

    test('updates reviewData with fresh review from API', async () => {
      const freshReview: ReviewData = {
        filePath: 'components/Button.tsx',
        reviewStatus: 'needs-review',
        commentCount: 5,
        summary: 'Updated review',
        externalReviewUrl: 'https://coderabbit.ai/reviews/fresh',
        fetchedAt: new Date(),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => freshReview,
      });

      const reviewsMap = new Map<string, ReviewData>([
        ['components/Button.tsx', mockReviewData],
      ]);

      const { result } = renderHook(() =>
        useFileDetail(mockFiles, mockEdges, 'analysis-1', { reviews: reviewsMap })
      );

      act(() => {
        result.current.setSelectedFile('components/Button.tsx');
      });

      expect(result.current.reviewData?.commentCount).toBe(3);

      act(() => {
        result.current.refreshReview('components/Button.tsx');
      });

      await waitFor(() => {
        expect(result.current.reviewData?.commentCount).toBe(5);
        expect(result.current.reviewData?.reviewStatus).toBe('needs-review');
      });
    });

    test('handles refresh error gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const reviewsMap = new Map<string, ReviewData>([
        ['components/Button.tsx', mockReviewData],
      ]);

      const { result } = renderHook(() =>
        useFileDetail(mockFiles, mockEdges, 'analysis-1', { reviews: reviewsMap })
      );

      act(() => {
        result.current.setSelectedFile('components/Button.tsx');
      });

      const originalReview = result.current.reviewData;

      act(() => {
        result.current.refreshReview('components/Button.tsx');
      });

      await waitFor(() => {
        expect(result.current.isRefreshingReview).toBe(false);
      });

      // Review data should remain unchanged on error
      expect(result.current.reviewData).toEqual(originalReview);
    });

    test('does not call refreshReview if no analysisId', async () => {
      const { result } = renderHook(() => useFileDetail(mockFiles, mockEdges, ''));

      act(() => {
        result.current.setSelectedFile('components/Button.tsx');
        result.current.refreshReview('components/Button.tsx');
      });

      await waitFor(() => {
        expect(global.fetch).not.toHaveBeenCalledWith(
          expect.stringContaining('/api/coderabbit/refresh'),
          expect.anything()
        );
      });
    });
  });
});

// =============================================================================
// useAnalysis Hook Tests
// =============================================================================

describe('useAnalysis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    test('initializes with loading state', () => {
      const { result } = renderHook(() => useAnalysis('analysis-1'));

      expect(result.current.loading).toBe(true);
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.reviews).toEqual(new Map());
    });
  });

  describe('analysis data fetching', () => {
    test('fetches analysis data from API', async () => {
      const mockAnalysisResponse = {
        id: 'analysis-1',
        organizationId: 'org-1',
        repositoryUrl: 'https://github.com/test/repo',
        fileList: mockFiles,
        edgeList: mockEdges,
        coverage: { parsed: 3, skipped: 0, reasons: {} },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockAnalysisResponse,
      });

      const { result } = renderHook(() => useAnalysis('analysis-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockAnalysisResponse);
      expect(result.current.error).toBeNull();
    });

    test('converts reviews array to Map for O(1) lookup', async () => {
      const mockAnalysisResponse = {
        id: 'analysis-1',
        organizationId: 'org-1',
        repositoryUrl: 'https://github.com/test/repo',
        fileList: mockFiles,
        edgeList: mockEdges,
        coverage: { parsed: 3, skipped: 0, reasons: {} },
        reviews: mockReviews,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockAnalysisResponse,
      });

      const { result } = renderHook(() => useAnalysis('analysis-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.reviews).toBeInstanceOf(Map);
      expect(result.current.reviews.size).toBe(2);
      expect(result.current.reviews.get('components/Button.tsx')).toEqual(mockReviewData);
      expect(result.current.reviews.get('app/page.tsx')).toEqual(mockReviews[1]);
    });

    test('handles empty reviews array', async () => {
      const mockAnalysisResponse = {
        id: 'analysis-1',
        organizationId: 'org-1',
        repositoryUrl: 'https://github.com/test/repo',
        fileList: mockFiles,
        edgeList: mockEdges,
        coverage: { parsed: 3, skipped: 0, reasons: {} },
        reviews: [],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockAnalysisResponse,
      });

      const { result } = renderHook(() => useAnalysis('analysis-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.reviews).toEqual(new Map());
    });

    test('handles undefined reviews in response', async () => {
      const mockAnalysisResponse = {
        id: 'analysis-1',
        organizationId: 'org-1',
        repositoryUrl: 'https://github.com/test/repo',
        fileList: mockFiles,
        edgeList: mockEdges,
        coverage: { parsed: 3, skipped: 0, reasons: {} },
        // No reviews field
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockAnalysisResponse,
      });

      const { result } = renderHook(() => useAnalysis('analysis-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.reviews).toEqual(new Map());
    });
  });

  describe('error handling', () => {
    test('handles fetch error', async () => {
      const error = new Error('Network error');
      (global.fetch as jest.Mock).mockRejectedValueOnce(error);

      const { result } = renderHook(() => useAnalysis('analysis-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeDefined();
      expect(result.current.data).toBeNull();
      expect(result.current.reviews).toEqual(new Map());
    });

    test('handles HTTP error response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const { result } = renderHook(() => useAnalysis('analysis-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeDefined();
      expect(result.current.error?.message).toContain('Failed to fetch analysis');
      expect(result.current.data).toBeNull();
    });
  });

  describe('analysisId changes', () => {
    test('refetches when analysisId changes', async () => {
      const mockAnalysis1 = {
        id: 'analysis-1',
        organizationId: 'org-1',
        repositoryUrl: 'https://github.com/test/repo1',
        fileList: mockFiles,
        edgeList: mockEdges,
        coverage: { parsed: 3, skipped: 0, reasons: {} },
      };

      const mockAnalysis2 = {
        id: 'analysis-2',
        organizationId: 'org-2',
        repositoryUrl: 'https://github.com/test/repo2',
        fileList: mockFiles,
        edgeList: mockEdges,
        coverage: { parsed: 3, skipped: 0, reasons: {} },
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => mockAnalysis1 })
        .mockResolvedValueOnce({ ok: true, json: async () => mockAnalysis2 });

      const { result, rerender } = renderHook(
        ({ analysisId }: { analysisId: string }) => useAnalysis(analysisId),
        { initialProps: { analysisId: 'analysis-1' } }
      );

      await waitFor(() => {
        expect(result.current.data?.id).toBe('analysis-1');
      });

      rerender({ analysisId: 'analysis-2' });

      await waitFor(() => {
        expect(result.current.data?.id).toBe('analysis-2');
      });

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('clears state when analysisId is empty', () => {
      const { result } = renderHook(() => useAnalysis(''));

      expect(result.current.data).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.reviews).toEqual(new Map());
    });
  });

  describe('reviews Map lookup performance', () => {
    test('provides O(1) lookup by file path', async () => {
      const manyReviews = Array.from({ length: 100 }, (_, i) => ({
        filePath: `file-${i}.tsx`,
        reviewStatus: 'approved' as const,
        commentCount: i,
        summary: `Review for file ${i}`,
        externalReviewUrl: `https://coderabbit.ai/reviews/${i}`,
        fetchedAt: new Date(),
      }));

      const mockAnalysisResponse = {
        id: 'analysis-1',
        organizationId: 'org-1',
        repositoryUrl: 'https://github.com/test/repo',
        fileList: mockFiles,
        edgeList: mockEdges,
        coverage: { parsed: 3, skipped: 0, reasons: {} },
        reviews: manyReviews,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockAnalysisResponse,
      });

      const { result } = renderHook(() => useAnalysis('analysis-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Map should have all reviews
      expect(result.current.reviews.size).toBe(100);

      // Lookups should be efficient
      expect(result.current.reviews.get('file-50.tsx')?.commentCount).toBe(50);
      expect(result.current.reviews.get('file-99.tsx')?.commentCount).toBe(99);
      expect(result.current.reviews.get('file-notfound.tsx')).toBeUndefined();
    });
  });
});
