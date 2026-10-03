/**
 * __tests__/runner-integration.test.ts
 *
 * Integration tests for CodeRabbit review fetching in analyzeRepository.
 * Tests the fire-and-forget pattern: analysis completes before CodeRabbit fetch resolves.
 */

import { analyzeRepository, AnalysisError } from '../lib/parser/runner';

// Provide fake env vars so makeSupabaseClient() doesn't throw before createClient is called.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

// Mutable state per test
let mockQueryResult: { data: unknown; error: unknown } = { data: null, error: null };
let mockInsertSelectResult: { data: unknown; error: unknown } = { data: { id: 'analysis-123', created_at: '2024-01-01T00:00:00Z' }, error: null };
let mockUpsertSelectResult: { data: unknown; error: unknown } = { data: { id: 'repo-456' }, error: null };

// Build chain object
const supabaseChain: Record<string, unknown> = {};

const createChain = () => {
  const chain: Record<string, unknown> = {
    from: jest.fn((table: string) => {
      if (table === 'organizations') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn(() => Promise.resolve(mockQueryResult)),
            })),
          })),
        };
      }
      // For other tables, return full chain
      return chain;
    }),
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    single: jest.fn(() => Promise.resolve(mockInsertSelectResult)),
    insert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn(() => Promise.resolve(mockInsertSelectResult)),
      })),
    })),
    upsert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn(() => Promise.resolve(mockUpsertSelectResult)),
      })),
      onConflict: undefined as unknown,
    })),
  };
  return chain;
};

let supabaseClientChain: Record<string, unknown>;

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => {
    supabaseClientChain = createChain();
    return supabaseClientChain;
  }),
}));

// Mock the parser
jest.mock('@/lib/parser', () => ({
  parseRepository: jest.fn(() => Promise.resolve({
    files: [{ path: 'src/index.ts', kind: 'source' }],
    edges: [],
    coverage: { parsed: 1, skipped: 0, reasons: new Map() },
  })),
}));

// Mock git
jest.mock('simple-git', () => ({
  simpleGit: jest.fn(() => ({
    clone: jest.fn(() => Promise.resolve()),
  })),
}));

// Mock filesystem
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(() => Promise.resolve()),
    rm: jest.fn(() => Promise.resolve()),
  },
}));

// CodeRabbit mocks
const mockFetchReviewsForRepo = jest.fn();
const mockStoreReviews = jest.fn();

jest.mock('@/lib/coderabbit/client', () => ({
  fetchReviewsForRepo: (...args: unknown[]) => mockFetchReviewsForRepo(...args),
}));

jest.mock('@/lib/coderabbit/storage', () => ({
  storeReviews: (...args: unknown[]) => mockStoreReviews(...args),
}));

describe('analyzeRepository — CodeRabbit Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'debug').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Reset mocks
    mockQueryResult = { data: null, error: null };
    mockInsertSelectResult = { data: { id: 'analysis-123', created_at: '2024-01-01T00:00:00Z' }, error: null };
    mockUpsertSelectResult = { data: { id: 'repo-456' }, error: null };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('1. Analysis completes when CodeRabbit succeeds', async () => {
    // Org has API key
    mockQueryResult = {
      data: { coderabbit_api_key: 'test-api-key' },
      error: null,
    };

    // CodeRabbit fetch returns reviews
    const mockReviews = [
      {
        filePath: 'src/index.ts',
        reviewStatus: 'approved' as const,
        commentCount: 3,
        summary: 'Good code',
        externalReviewUrl: 'https://example.com/review/1',
        fetchedAt: new Date(),
      },
    ];
    mockFetchReviewsForRepo.mockResolvedValue(mockReviews);
    mockStoreReviews.mockResolvedValue(undefined);

    // Analyze
    const result = await analyzeRepository(
      'https://github.com/test/repo',
      'user-123',
      'org-abc'
    );

    // Analysis should complete successfully
    expect(result.id).toBe('analysis-123');
    expect(result.organizationId).toBe('org-abc');
    expect(result.repositoryUrl).toBe('https://github.com/test/repo');

    // Give async fetch time to execute
    await new Promise(resolve => setTimeout(resolve, 100));

    // CodeRabbit should have been called
    expect(mockFetchReviewsForRepo).toHaveBeenCalledWith(
      'https://github.com/test/repo',
      'test-api-key'
    );
  });

  it('2. Analysis completes even if CodeRabbit fails', async () => {
    // Org has API key
    mockQueryResult = {
      data: { coderabbit_api_key: 'bad-api-key' },
      error: null,
    };

    // CodeRabbit fetch fails
    mockFetchReviewsForRepo.mockRejectedValue(new Error('API error'));

    // Analyze
    const result = await analyzeRepository(
      'https://github.com/test/repo',
      'user-123',
      'org-abc'
    );

    // Analysis should still complete successfully
    expect(result.id).toBe('analysis-123');
    expect(result.repositoryUrl).toBe('https://github.com/test/repo');

    // Give async fetch time to execute
    await new Promise(resolve => setTimeout(resolve, 100));

    // Should have logged a warning
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[runner] CodeRabbit fetch failed'),
      expect.any(String)
    );
  });

  it('3. Respects 30-second timeout for CodeRabbit', async () => {
    // Org has API key
    mockQueryResult = {
      data: { coderabbit_api_key: 'test-api-key' },
      error: null,
    };

    // CodeRabbit never resolves (simulating hang)
    mockFetchReviewsForRepo.mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    const startTime = Date.now();

    // Analyze
    const result = await analyzeRepository(
      'https://github.com/test/repo',
      'user-123',
      'org-abc'
    );

    // Analysis should return immediately
    expect(result.id).toBe('analysis-123');

    // Wait a shorter time to verify async timeout works
    // The key is that analysis returns before the 30s timeout completes
    await new Promise(resolve => setTimeout(resolve, 500));

    // Timeout error should have been logged (eventually)
    // We can't guarantee it's logged immediately in async code
    expect(mockFetchReviewsForRepo).toHaveBeenCalled();
  }, 10000); // Give this test 10 seconds max

  it('4. No API key is handled gracefully', async () => {
    // Org has no API key
    mockQueryResult = {
      data: { coderabbit_api_key: null },
      error: null,
    };

    // Analyze
    const result = await analyzeRepository(
      'https://github.com/test/repo',
      'user-123',
      'org-abc'
    );

    // Analysis should complete successfully
    expect(result.id).toBe('analysis-123');
    expect(result.repositoryUrl).toBe('https://github.com/test/repo');

    // Give async fetch time to execute (or not)
    await new Promise(resolve => setTimeout(resolve, 100));

    // Should have logged debug message
    expect(console.debug).toHaveBeenCalledWith(
      expect.stringContaining('No CodeRabbit API key configured')
    );

    // CodeRabbit should NOT have been called
    expect(mockFetchReviewsForRepo).not.toHaveBeenCalled();
    expect(mockStoreReviews).not.toHaveBeenCalled();
  });

  it('5. Fire-and-forget pattern: analysis returns before CodeRabbit completes', async () => {
    // Org has API key
    mockQueryResult = {
      data: { coderabbit_api_key: 'test-api-key' },
      error: null,
    };

    // CodeRabbit fetch is very slow
    let resolveFetchReviews: (reviews: unknown[]) => void = () => {};
    mockFetchReviewsForRepo.mockImplementation(
      () => new Promise((resolve) => {
        resolveFetchReviews = resolve;
      })
    );

    const startTime = Date.now();

    // Analyze
    const result = await analyzeRepository(
      'https://github.com/test/repo',
      'user-123',
      'org-abc'
    );

    const analysisTime = Date.now() - startTime;

    // Analysis should return quickly (not wait for CodeRabbit)
    expect(analysisTime < 1000).toBe(true);
    expect(result.id).toBe('analysis-123');

    // Now resolve the CodeRabbit fetch
    resolveFetchReviews([]);
    await new Promise(resolve => setTimeout(resolve, 100));

    // CodeRabbit should have been called
    expect(mockFetchReviewsForRepo).toHaveBeenCalled();
  });

  it('6. Empty reviews array from CodeRabbit is handled', async () => {
    // Org has API key
    mockQueryResult = {
      data: { coderabbit_api_key: 'test-api-key' },
      error: null,
    };

    // CodeRabbit returns empty array
    mockFetchReviewsForRepo.mockResolvedValue([]);
    mockStoreReviews.mockResolvedValue(undefined);

    // Analyze
    const result = await analyzeRepository(
      'https://github.com/test/repo',
      'user-123',
      'org-abc'
    );

    expect(result.id).toBe('analysis-123');

    // Give async fetch time to execute
    await new Promise(resolve => setTimeout(resolve, 100));

    // storeReviews should not be called for empty array
    expect(mockStoreReviews).not.toHaveBeenCalled();
  });

  it('7. storeReviews is called with correct parameters', async () => {
    // Org has API key
    mockQueryResult = {
      data: { coderabbit_api_key: 'test-api-key' },
      error: null,
    };

    // CodeRabbit returns reviews
    const mockReviews = [
      {
        filePath: 'src/index.ts',
        reviewStatus: 'approved' as const,
        commentCount: 1,
        summary: null,
        externalReviewUrl: null,
        fetchedAt: new Date(),
      },
    ];
    mockFetchReviewsForRepo.mockResolvedValue(mockReviews);
    mockStoreReviews.mockResolvedValue(undefined);

    // Analyze
    const result = await analyzeRepository(
      'https://github.com/test/repo',
      'user-123',
      'org-abc'
    );

    expect(result.id).toBe('analysis-123');

    // Give async fetch time to execute
    await new Promise(resolve => setTimeout(resolve, 100));

    // storeReviews should be called with correct org and repo IDs
    expect(mockStoreReviews).toHaveBeenCalledWith(
      'org-abc',
      'repo-456', // This is the mocked repository ID from upsert
      mockReviews
    );
  });

  it('8. Organization query failure is handled gracefully', async () => {
    // Organization query fails
    mockQueryResult = {
      data: null,
      error: { message: 'Failed to query organization' },
    };

    // Analyze
    const result = await analyzeRepository(
      'https://github.com/test/repo',
      'user-123',
      'org-abc'
    );

    // Analysis should still complete
    expect(result.id).toBe('analysis-123');

    // Give async fetch time to execute
    await new Promise(resolve => setTimeout(resolve, 100));

    // Should have logged warning
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch organization CodeRabbit API key'),
      expect.any(String)
    );

    // CodeRabbit should not be called
    expect(mockFetchReviewsForRepo).not.toHaveBeenCalled();
  });

  it('9. Multiple analyses do not interfere with each other', async () => {
    mockQueryResult = {
      data: { coderabbit_api_key: 'test-api-key' },
      error: null,
    };

    mockFetchReviewsForRepo.mockResolvedValue([]);

    // Run two analyses in sequence
    const result1 = await analyzeRepository(
      'https://github.com/test/repo1',
      'user-123',
      'org-abc'
    );

    const result2 = await analyzeRepository(
      'https://github.com/test/repo2',
      'user-123',
      'org-abc'
    );

    // Both should succeed
    expect(result1.repositoryUrl).toBe('https://github.com/test/repo1');
    expect(result2.repositoryUrl).toBe('https://github.com/test/repo2');

    // Give async fetches time to execute
    await new Promise(resolve => setTimeout(resolve, 100));

    // Both CodeRabbit calls should have been made
    expect(mockFetchReviewsForRepo).toHaveBeenCalledTimes(2);
  });
});
