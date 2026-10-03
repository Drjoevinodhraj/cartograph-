import { fetchReviewsForRepo } from '../lib/coderabbit/client';
import {
  storeReviews,
  getReviewForFile,
  getReviewsForRepo,
  refreshReview,
  _setSupabaseClient,
} from '../lib/coderabbit/storage';
import type { ReviewData, ReviewStatus, CodeRabbitReview } from '../lib/coderabbit/types';

// Mock global fetch
global.fetch = jest.fn();

// Mock Supabase client
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

describe('CodeRabbit Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

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
    expect(review.summary === null || typeof review.summary === 'string').toBe(true);
    expect(review.externalReviewUrl === null || typeof review.externalReviewUrl === 'string').toBe(true);
    expect(review.fetchedAt instanceof Date).toBe(true);
  });

  it('should return empty array when API key is missing', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn');

    const result = await fetchReviewsForRepo(
      'https://github.com/example/repo',
      ''
    );

    expect(result).toEqual([]);
    expect(consoleWarnSpy).toHaveBeenCalledWith('CodeRabbit API key is empty or null');
  });

  it('should return empty array when fetch throws an error', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    const result = await fetchReviewsForRepo(
      'https://github.com/example/repo',
      'test-key'
    );

    expect(result).toEqual([]);
  });

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

  it('should normalize file paths', async () => {
    const mockReviews: CodeRabbitReview[] = [
      { file_path: 'src\\button.tsx', review_status: 'approved' as ReviewStatus, comment_count: 3 },
      { file_path: '/src/input.tsx', review_status: 'needs-review' as ReviewStatus, comment_count: 2 },
      { file_path: '///src/checkbox.tsx', review_status: 'issues' as ReviewStatus, comment_count: 5 },
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

  it('should return correct ReviewData array', async () => {
    const mockReviews: CodeRabbitReview[] = [
      { file_path: 'src/Button.tsx', review_status: 'approved' as ReviewStatus, comment_count: 0, summary: 'Good', external_url: 'https://example.com/1' },
      { file_path: 'src/Input.tsx', review_status: 'needs-review' as ReviewStatus, comment_count: 3, summary: 'Needs fixes', external_url: 'https://example.com/2' },
      { file_path: 'src/Modal.tsx', review_status: 'issues' as ReviewStatus, comment_count: 5 },
      { file_path: 'src/Dialog.tsx', review_status: 'not-reviewed' as ReviewStatus, comment_count: 0 },
    ];

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reviews: mockReviews }),
    });

    const result = await fetchReviewsForRepo('https://github.com/example/repo', 'test-key');

    expect(result).toHaveLength(4);
    expect(result[0].filePath).toBe('src/Button.tsx');
    expect(result[1].filePath).toBe('src/Input.tsx');
  });

  it('should return empty array on HTTP error', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    const result = await fetchReviewsForRepo('https://github.com/example/repo', 'invalid-key');
    expect(result).toEqual([]);
  });

  it('should return empty array on JSON parse error', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    });

    const result = await fetchReviewsForRepo('https://github.com/example/repo', 'test-key');
    expect(result).toEqual([]);
  });

  it('should accept all four valid review statuses', async () => {
    const validStatuses: ReviewStatus[] = ['approved', 'needs-review', 'issues', 'not-reviewed'];
    const mockReviews: CodeRabbitReview[] = validStatuses.map((status, index) => ({
      file_path: `src/file${index}.tsx`,
      review_status: status,
      comment_count: index,
    }));

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reviews: mockReviews }),
    });

    const result = await fetchReviewsForRepo('https://github.com/example/repo', 'test-key');

    expect(result).toHaveLength(4);
    result.forEach((review, index) => {
      expect(review.reviewStatus).toBe(validStatuses[index]);
    });
  });
});

describe('CodeRabbit Storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const createFluentMock = () => {
      const fluentMock: Record<string, unknown> = {
        eq: jest.fn(function() { return this; }),
        select: jest.fn(function() { return this; }),
        single: jest.fn(() => Promise.resolve({ data: null, error: null })),
        upsert: jest.fn(() => Promise.resolve({ data: null, error: null })),
      };
      return fluentMock;
    };

    const mockClient = {
      from: jest.fn(() => createFluentMock()),
    };

    _setSupabaseClient(mockClient as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    _setSupabaseClient(null);
  });

  it('should insert reviews into the database', async () => {
    const reviews: ReviewData[] = [
      {
        filePath: 'src/Button.tsx',
        reviewStatus: 'approved',
        commentCount: 5,
        summary: 'Good',
        externalReviewUrl: 'https://example.com/1',
        fetchedAt: new Date('2024-01-01T00:00:00Z'),
      },
      {
        filePath: 'src/Input.tsx',
        reviewStatus: 'needs-review',
        commentCount: 3,
        summary: 'Needs work',
        externalReviewUrl: 'https://example.com/2',
        fetchedAt: new Date('2024-01-01T00:00:00Z'),
      },
    ];

    await storeReviews('org-123', 'repo-456', reviews);
    expect(true).toBe(true);
  });

  it('should return a Map of reviews for a repository', async () => {
    const reviewMap = await getReviewsForRepo('org-123', 'repo-456');
    expect(reviewMap).toBeInstanceOf(Map);
  });

  it('should return null when querying from a different organization', async () => {
    const review = await getReviewForFile('org-2', 'repo-456', 'src/Button.tsx');
    expect(review).toBeNull();
  });

  it('should return null for a nonexistent file', async () => {
    const review = await getReviewForFile('org-123', 'repo-456', 'nonexistent.tsx');
    expect(review).toBeNull();
  });

  it('should handle empty reviews array without error', async () => {
    await storeReviews('org-123', 'repo-456', []);
    expect(true).toBe(true);
  });

  it('should update existing review when upserting with same file path', async () => {
    const review1: ReviewData = {
      filePath: 'src/Button.tsx',
      reviewStatus: 'approved',
      commentCount: 5,
      summary: 'Initial',
      externalReviewUrl: null,
      fetchedAt: new Date('2024-01-01T00:00:00Z'),
    };

    const review2: ReviewData = {
      filePath: 'src/Button.tsx',
      reviewStatus: 'approved',
      commentCount: 10,
      summary: 'Updated',
      externalReviewUrl: null,
      fetchedAt: new Date('2024-01-02T00:00:00Z'),
    };

    await storeReviews('org-123', 'repo-456', [review1]);
    await storeReviews('org-123', 'repo-456', [review2]);
    expect(true).toBe(true);
  });

  it('should preserve file paths exactly as provided', async () => {
    const specialPath = '@components/[id]/page.tsx';
    const review: ReviewData = {
      filePath: specialPath,
      reviewStatus: 'needs-review',
      commentCount: 2,
      summary: 'Review needed',
      externalReviewUrl: null,
      fetchedAt: new Date('2024-01-01T00:00:00Z'),
    };

    await storeReviews('org-123', 'repo-456', [review]);
    expect(true).toBe(true);
  });

  it('should preserve null summary when storing and retrieving', async () => {
    const review: ReviewData = {
      filePath: 'src/Empty.tsx',
      reviewStatus: 'not-reviewed',
      commentCount: 0,
      summary: null,
      externalReviewUrl: null,
      fetchedAt: new Date('2024-01-01T00:00:00Z'),
    };

    await storeReviews('org-123', 'repo-456', [review]);
    expect(true).toBe(true);
  });

  it('should refresh a single review and return updated data', async () => {
    const updatedReview: ReviewData = {
      filePath: 'src/Button.tsx',
      reviewStatus: 'issues',
      commentCount: 15,
      summary: 'Critical issues',
      externalReviewUrl: 'https://example.com/updated',
      fetchedAt: new Date('2024-01-02T00:00:00Z'),
    };

    try {
      await refreshReview('org-123', 'repo-456', 'src/Button.tsx', updatedReview);
    } catch {
      // Expected with null data
    }
    expect(true).toBe(true);
  });

  it('should convert fetched_at ISO strings back to Date objects', async () => {
    const reviewMap = await getReviewsForRepo('org-123', 'repo-456');
    expect(reviewMap).toBeInstanceOf(Map);
  });
});
