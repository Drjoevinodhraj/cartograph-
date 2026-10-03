import { fetchReviewsForRepo } from '../lib/coderabbit/client';
import type { ReviewData, ReviewStatus, CodeRabbitReview } from '../lib/coderabbit/types';

// Mock global fetch
global.fetch = jest.fn();

describe('CodeRabbit Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Suppress console.warn during tests
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * Test 1: Basic fetch returns an array
   */
  it('should return an array when called with valid parameters', async () => {
    const mockReviews: CodeRabbitReview[] = [];
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reviews: mockReviews }),
    });

    const result = await fetchReviewsForRepo(
      'https://github.com/example/repo',
      'test-key'
    );

    expect(Array.isArray(result)).toBe(true);
  });

  /**
   * Test 2: Type validation - returned data has correct types
   */
  it('should return ReviewData with correct types', async () => {
    const mockReviews: CodeRabbitReview[] = [
      {
        file_path: 'src/Button.tsx',
        review_status: 'approved' as ReviewStatus,
        comment_count: 5,
        summary: 'Looks good',
        external_url: 'https://example.com/review/1',
      },
    ];

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reviews: mockReviews }),
    });

    const result = await fetchReviewsForRepo(
      'https://github.com/example/repo',
      'test-key'
    );

    expect(result).toHaveLength(1);
    const review = result[0];
    expect(typeof review.filePath).toBe('string');
    expect(typeof review.reviewStatus).toBe('string');
    expect(typeof review.commentCount).toBe('number');
    expect(review.summary === null || typeof review.summary === 'string').toBe(
      true
    );
    expect(
      review.externalReviewUrl === null || typeof review.externalReviewUrl === 'string'
    ).toBe(true);
    expect(review.fetchedAt instanceof Date).toBe(true);
  });

  /**
   * Test 3: Error handling - missing API key returns empty array
   */
  it('should return empty array when API key is missing', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn');

    const result = await fetchReviewsForRepo(
      'https://github.com/example/repo',
      ''
    );

    expect(result).toEqual([]);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'CodeRabbit API key is empty or null'
    );
  });

  /**
   * Test 4: Error handling - abort triggers timeout error
   */
  it('should catch AbortError and return empty array', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn');

    // Mock fetch to throw an AbortError
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    (global.fetch as jest.Mock).mockRejectedValueOnce(abortError);

    const result = await fetchReviewsForRepo(
      'https://github.com/example/repo',
      'test-key'
    );

    expect(result).toEqual([]);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'CodeRabbit API request timed out (30s)'
    );
  });

  /**
   * Test 5: Invalid review status filtering
   */
  it('should filter out reviews with invalid status', async () => {
    const mockReviews = [
      {
        file_path: 'src/valid.tsx',
        review_status: 'approved' as ReviewStatus,
        comment_count: 1,
      },
      {
        file_path: 'src/invalid.tsx',
        review_status: 'unknown' as unknown as ReviewStatus,
        comment_count: 2,
      },
    ];

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reviews: mockReviews }),
    });

    const result = await fetchReviewsForRepo(
      'https://github.com/example/repo',
      'test-key'
    );

    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe('src/valid.tsx');
  });

  /**
   * Test 6: File path normalization
   */
  it('should normalize file paths (backslashes to forward slashes, strip leading slashes)', async () => {
    const mockReviews: CodeRabbitReview[] = [
      {
        file_path: 'src\\button.tsx',
        review_status: 'approved' as ReviewStatus,
        comment_count: 3,
      },
      {
        file_path: '/src/input.tsx',
        review_status: 'needs-review' as ReviewStatus,
        comment_count: 2,
      },
      {
        file_path: '///src/checkbox.tsx',
        review_status: 'issues' as ReviewStatus,
        comment_count: 5,
      },
    ];

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reviews: mockReviews }),
    });

    const result = await fetchReviewsForRepo(
      'https://github.com/example/repo',
      'test-key'
    );

    expect(result).toHaveLength(3);
    expect(result[0].filePath).toBe('src/button.tsx');
    expect(result[1].filePath).toBe('src/input.tsx');
    expect(result[2].filePath).toBe('src/checkbox.tsx');
  });

  /**
   * Test 7: Happy path with valid mock API response
   */
  it('should return correct ReviewData array from valid API response', async () => {
    const mockReviews: CodeRabbitReview[] = [
      {
        file_path: 'src/Button.tsx',
        review_status: 'approved' as ReviewStatus,
        comment_count: 0,
        summary: 'Looks good!',
        external_url: 'https://coderabbit.ai/reviews/123',
      },
      {
        file_path: 'src/Input.tsx',
        review_status: 'needs-review' as ReviewStatus,
        comment_count: 3,
        summary: 'Needs fixes',
        external_url: 'https://coderabbit.ai/reviews/124',
      },
      {
        file_path: 'src/Modal.tsx',
        review_status: 'issues' as ReviewStatus,
        comment_count: 5,
      },
      {
        file_path: 'src/Dialog.tsx',
        review_status: 'not-reviewed' as ReviewStatus,
        comment_count: 0,
      },
    ];

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reviews: mockReviews }),
    });

    const result = await fetchReviewsForRepo(
      'https://github.com/example/repo',
      'test-key'
    );

    expect(result).toHaveLength(4);

    // Check first review
    expect(result[0]).toEqual({
      filePath: 'src/Button.tsx',
      reviewStatus: 'approved',
      commentCount: 0,
      summary: 'Looks good!',
      externalReviewUrl: 'https://coderabbit.ai/reviews/123',
      fetchedAt: expect.any(Date),
    });

    // Check second review
    expect(result[1]).toEqual({
      filePath: 'src/Input.tsx',
      reviewStatus: 'needs-review',
      commentCount: 3,
      summary: 'Needs fixes',
      externalReviewUrl: 'https://coderabbit.ai/reviews/124',
      fetchedAt: expect.any(Date),
    });

    // Check third review (no summary, no external_url)
    expect(result[2]).toEqual({
      filePath: 'src/Modal.tsx',
      reviewStatus: 'issues',
      commentCount: 5,
      summary: null,
      externalReviewUrl: null,
      fetchedAt: expect.any(Date),
    });

    // Check fourth review
    expect(result[3]).toEqual({
      filePath: 'src/Dialog.tsx',
      reviewStatus: 'not-reviewed',
      commentCount: 0,
      summary: null,
      externalReviewUrl: null,
      fetchedAt: expect.any(Date),
    });
  });

  /**
   * Test 8: HTTP error response handling
   */
  it('should return empty array on HTTP error response', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn');

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    const result = await fetchReviewsForRepo(
      'https://github.com/example/repo',
      'invalid-key'
    );

    expect(result).toEqual([]);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'CodeRabbit API request failed with status 401'
    );
  });

  /**
   * Test 9: JSON parse error handling
   */
  it('should return empty array on JSON parse error', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn');

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    });

    const result = await fetchReviewsForRepo(
      'https://github.com/example/repo',
      'test-key'
    );

    expect(result).toEqual([]);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Failed to parse CodeRabbit API response as JSON'
    );
  });

  /**
   * Test 10: All four review statuses are handled correctly
   */
  it('should accept all four valid review statuses', async () => {
    const validStatuses: ReviewStatus[] = [
      'approved',
      'needs-review',
      'issues',
      'not-reviewed',
    ];

    const mockReviews: CodeRabbitReview[] = validStatuses.map(
      (status, index) => ({
        file_path: `src/file${index}.tsx`,
        review_status: status,
        comment_count: index,
      })
    );

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reviews: mockReviews }),
    });

    const result = await fetchReviewsForRepo(
      'https://github.com/example/repo',
      'test-key'
    );

    expect(result).toHaveLength(4);
    result.forEach((review, index) => {
      expect(review.reviewStatus).toBe(validStatuses[index]);
    });
  });
});
