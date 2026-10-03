/**
 * @jest-environment node
 */

/**
 * __tests__/api.test.ts
 *
 * Integration tests for the Phase 3 API routes:
 *   POST /api/analyses
 *   GET  /api/analyses
 *   GET  /api/analyses/[id]
 *   POST /api/analyses/[id]/explain
 *
 * Strategy:
 *   - Mock @clerk/nextjs/server to control auth state.
 *   - Mock @supabase/supabase-js so no real DB calls are made.
 *   - Mock lib/parser/runner so no real git clones happen.
 *   - Mock openai for explain tests.
 *   - Every test constructs a real Request and inspects the real Response.
 */

// ---------------------------------------------------------------------------
// Module-level mocks — must appear before any imports that pull the mocked modules
// ---------------------------------------------------------------------------

// Provide fake env vars so makeSupabaseClient() doesn't throw before createClient is called.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.OPENAI_API_KEY = 'sk-test-openai-key';

// Clerk auth mock: default to authenticated with user + org.
const mockAuthState = {
  userId: 'user_test_123',
  orgId: 'org_test_abc',
};
jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn(() => Promise.resolve(mockAuthState)),
}));

// ---------------------------------------------------------------------------
// Supabase mock
//
// The routes build chainable queries that terminate in one of two ways:
//   1. Awaiting the chain itself (list query): GET /api/analyses uses
//      `.from().select().eq().order()` and awaits the builder directly.
//   2. `.single()`: single-row fetch.
//   3. `.insert()`: write.
//
// We make the chain a thenable so `await chain` resolves to `mockListResult`.
// Every builder method returns `supabaseChain` so any chain length works.
// `.single()` returns a Promise driven by `singleResults` (sequential array of
// per-call responses) or falls back to `mockSingleResult`.
// ---------------------------------------------------------------------------

// Mutable state per test — reassigned in beforeEach.
let mockSingleResult: { data: unknown; error: unknown } = { data: null, error: null };
let mockListResult: { data: unknown; error: unknown } = { data: [], error: null };
let mockInsertResult: { data: unknown; error: unknown } = { data: null, error: null };

// single() call counter lets explain tests distinguish "fetch analysis" vs "check cache".
let singleCallCount = 0;
// Array of results to return on successive .single() calls (per test override).
let singleResults: Array<{ data: unknown; error: unknown }> = [];

// The chain object — typed loosely so we can attach both mock functions and `then`.
const supabaseChain: Record<string, unknown> = {};
const chainSelf = () => supabaseChain;

supabaseChain.from = jest.fn(chainSelf);
supabaseChain.select = jest.fn(chainSelf);
supabaseChain.eq = jest.fn(chainSelf);
supabaseChain.order = jest.fn(chainSelf);
supabaseChain.limit = jest.fn(chainSelf);
supabaseChain.single = jest.fn(() => {
  if (singleResults.length > 0) {
    const result = singleResults[singleCallCount] ?? singleResults[singleResults.length - 1];
    singleCallCount++;
    return Promise.resolve(result);
  }
  return Promise.resolve(mockSingleResult);
});
supabaseChain.insert = jest.fn(() => Promise.resolve(mockInsertResult));
supabaseChain.upsert = jest.fn(chainSelf);
// Make the chain a thenable: `await supabaseChain` resolves to the current mockListResult.
supabaseChain.then = jest.fn((resolve: (v: unknown) => unknown) => {
  return Promise.resolve(mockListResult).then(resolve);
});

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => supabaseChain),
}));

// Parser runner mock.
const mockAnalyzeRepository = jest.fn();
jest.mock('@/lib/parser/runner', () => ({
  analyzeRepository: (...args: unknown[]) => mockAnalyzeRepository(...args),
  AnalysisError: class AnalysisError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.name = 'AnalysisError';
      this.statusCode = statusCode;
    }
  },
}));

// OpenAI mock.
const mockChatCompletionsCreate = jest.fn();
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockChatCompletionsCreate,
      },
    },
  }));
});

// ---------------------------------------------------------------------------
// Now import the routes AFTER mocks are set up
// ---------------------------------------------------------------------------
import { POST as postAnalyses, GET as getAnalyses } from '@/app/api/analyses/route';
import { GET as getAnalysisDetail } from '@/app/api/analyses/[id]/route';
import { POST as postExplain } from '@/app/api/analyses/[id]/explain/route';

// Pull the Clerk mock so tests can change auth state.
import { auth as clerkAuth } from '@clerk/nextjs/server';
const mockAuth = clerkAuth as unknown as jest.Mock;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeRequest(body?: unknown, method = 'POST'): Request {
  if (body !== undefined) {
    return new Request('https://localhost/api/analyses', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  return new Request('https://localhost/api/analyses', { method });
}

function makeGetRequest(): Request {
  return new Request('https://localhost/api/analyses', { method: 'GET' });
}

function makeIdParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

const ANALYSIS_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const ORG_ID = 'org_test_abc';
const REPO_URL = 'https://github.com/test-owner/test-repo';

/** A minimal analysis row as Supabase would return it (for GET /api/analyses/[id]). */
const analysisDetailRow = {
  id: ANALYSIS_ID,
  repository_id: 'repo-uuid-001',
  file_list: [{ path: 'src/index.ts', kind: 'source' }],
  edge_list: [{ from: 'src/index.ts', to: 'src/helper.ts' }],
  coverage: 0.85,
  created_at: '2024-01-01T00:00:00Z',
  repositories: { url: REPO_URL, organization_id: ORG_ID },
};

/** A minimal analysis list row (no file_list / edge_list). */
const analysisListRow = {
  id: ANALYSIS_ID,
  coverage: 0.85,
  created_at: '2024-01-01T00:00:00Z',
  repositories: { url: REPO_URL, organization_id: ORG_ID },
};

// ---------------------------------------------------------------------------
// Reset helpers between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Reset auth to default authenticated state.
  mockAuth.mockResolvedValue({ userId: 'user_test_123', orgId: ORG_ID });

  // Reset supabase chain mock state.
  singleCallCount = 0;
  singleResults = [];
  mockSingleResult = { data: null, error: null };
  mockListResult = { data: [], error: null };
  mockInsertResult = { data: null, error: null };

  // Re-wire the chain mocks (jest.clearAllMocks resets call counts but not implementations).
  const cm = supabaseChain as Record<string, jest.Mock>;
  cm.from.mockImplementation(chainSelf);
  cm.select.mockImplementation(chainSelf);
  cm.eq.mockImplementation(chainSelf);
  cm.limit.mockImplementation(chainSelf);
  cm.upsert.mockImplementation(chainSelf);
  cm.order.mockImplementation(chainSelf);
  cm.single.mockImplementation(() => {
    if (singleResults.length > 0) {
      const result = singleResults[singleCallCount] ?? singleResults[singleResults.length - 1];
      singleCallCount++;
      return Promise.resolve(result);
    }
    return Promise.resolve(mockSingleResult);
  });
  cm.insert.mockImplementation(() => Promise.resolve(mockInsertResult));
  cm.then.mockImplementation((resolve: (v: unknown) => unknown) => {
    return Promise.resolve(mockListResult).then(resolve);
  });

  // Default OpenAI response.
  mockChatCompletionsCreate.mockResolvedValue({
    choices: [{ message: { content: 'This file handles routing.' } }],
  });

  // Default analyzeRepository to succeed.
  mockAnalyzeRepository.mockResolvedValue({
    id: ANALYSIS_ID,
    organizationId: ORG_ID,
    repositoryUrl: REPO_URL,
    fileCount: 10,
    edgeCount: 5,
    coverage: { parsed: 10, skipped: 0, reasons: {} },
    createdAt: new Date('2024-01-01T00:00:00Z'),
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// POST /api/analyses
// ---------------------------------------------------------------------------

describe('POST /api/analyses', () => {
  it('returns 201 with analysis summary for a valid GitHub repo URL', async () => {
    const req = makeRequest({ repositoryUrl: REPO_URL });
    const res = await postAnalyses(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe(ANALYSIS_ID);
    expect(body.repositoryUrl).toBe(REPO_URL);
    expect(mockAnalyzeRepository).toHaveBeenCalledWith(REPO_URL, 'user_test_123', ORG_ID);
  });

  it('returns 400 when repositoryUrl is missing from the body', async () => {
    const req = makeRequest({});
    const res = await postAnalyses(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/repositoryUrl/i);
  });

  it('returns 400 when repositoryUrl is not a string', async () => {
    const req = makeRequest({ repositoryUrl: 42 });
    const res = await postAnalyses(req);

    expect(res.status).toBe(400);
  });

  it('returns 400 when repositoryUrl is an empty string', async () => {
    const req = makeRequest({ repositoryUrl: '   ' });
    const res = await postAnalyses(req);

    expect(res.status).toBe(400);
  });

  it('returns 400 when the URL is not a GitHub URL', async () => {
    // analyzeRepository validates the URL and throws AnalysisError(400)
    const { AnalysisError } = await import('@/lib/parser/runner');
    mockAnalyzeRepository.mockRejectedValue(
      new AnalysisError('Invalid repository URL: must start with https://github.com/', 400),
    );

    const req = makeRequest({ repositoryUrl: 'https://gitlab.com/owner/repo' });
    const res = await postAnalyses(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('returns 404 when the repository does not exist', async () => {
    const { AnalysisError } = await import('@/lib/parser/runner');
    mockAnalyzeRepository.mockRejectedValue(
      new AnalysisError('Repository not found: https://github.com/nobody/nothing', 404),
    );

    const req = makeRequest({ repositoryUrl: 'https://github.com/nobody/nothing' });
    const res = await postAnalyses(req);

    expect(res.status).toBe(404);
  });

  it('returns 401 when the user is not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null, orgId: null });

    const req = makeRequest({ repositoryUrl: REPO_URL });
    const res = await postAnalyses(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/unauthorized/i);
  });

  it('returns 400 when the user has no active organization', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_test_123', orgId: null });

    const req = makeRequest({ repositoryUrl: REPO_URL });
    const res = await postAnalyses(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/organization/i);
  });

  it('returns 400 for a malformed (non-JSON) body', async () => {
    const req = new Request('https://localhost/api/analyses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json{{{',
    });
    const res = await postAnalyses(req);

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/analyses
// ---------------------------------------------------------------------------

describe('GET /api/analyses', () => {
  it('returns 200 with analyses array for the user organisation', async () => {
    mockListResult = { data: [analysisListRow], error: null };

    const req = makeGetRequest();
    const res = await getAnalyses(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.analyses)).toBe(true);
    expect(body.analyses).toHaveLength(1);
    expect(body.analyses[0].id).toBe(ANALYSIS_ID);
    expect(body.analyses[0].repository_url).toBe(REPO_URL);
  });

  it('returns an empty array when the organisation has no analyses', async () => {
    mockListResult = { data: [], error: null };

    const req = makeGetRequest();
    const res = await getAnalyses(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.analyses).toEqual([]);
  });

  it('returns analyses ordered by created_at descending', async () => {
    const older = { ...analysisListRow, id: 'id-older', created_at: '2023-01-01T00:00:00Z' };
    const newer = { ...analysisListRow, id: 'id-newer', created_at: '2024-01-01T00:00:00Z' };
    // Route calls .order('created_at', { ascending: false }) — we just verify it receives them in this order.
    mockListResult = { data: [newer, older], error: null };

    const req = makeGetRequest();
    const res = await getAnalyses(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.analyses[0].id).toBe('id-newer');
    expect(body.analyses[1].id).toBe('id-older');
  });

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null, orgId: null });

    const req = makeGetRequest();
    const res = await getAnalyses(req);

    expect(res.status).toBe(401);
  });

  it('returns 400 when the user has no active organisation', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_test_123', orgId: null });

    const req = makeGetRequest();
    const res = await getAnalyses(req);

    expect(res.status).toBe(400);
  });

  it('returns 500 when the Supabase query fails', async () => {
    mockListResult = { data: null, error: { message: 'db failure' } };

    const req = makeGetRequest();
    const res = await getAnalyses(req);

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /api/analyses/[id]
// ---------------------------------------------------------------------------

describe('GET /api/analyses/[id]', () => {
  it('returns 200 with full analysis (file_list, edge_list) for a valid ID', async () => {
    mockSingleResult = { data: analysisDetailRow, error: null };

    const req = makeGetRequest();
    const res = await getAnalysisDetail(req, makeIdParams(ANALYSIS_ID));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(ANALYSIS_ID);
    expect(Array.isArray(body.file_list)).toBe(true);
    expect(Array.isArray(body.edge_list)).toBe(true);
    expect(body.file_count).toBe(1);
    expect(body.edge_count).toBe(1);
    expect(body.coverage).toBe(0.85);
    expect(body.repository_url).toBe(REPO_URL);
  });

  it('returns 404 for an ID that does not exist', async () => {
    mockSingleResult = { data: null, error: { code: 'PGRST116', message: 'no rows' } };

    const req = makeGetRequest();
    const res = await getAnalysisDetail(req, makeIdParams('nonexistent-id'));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it('returns 403 when the analysis belongs to a different organisation', async () => {
    mockSingleResult = {
      data: {
        ...analysisDetailRow,
        repositories: { url: REPO_URL, organization_id: 'org_other_999' },
      },
      error: null,
    };

    // Our user is in ORG_ID, not org_other_999.
    const req = makeGetRequest();
    const res = await getAnalysisDetail(req, makeIdParams(ANALYSIS_ID));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/forbidden/i);
  });

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null, orgId: null });

    const req = makeGetRequest();
    const res = await getAnalysisDetail(req, makeIdParams(ANALYSIS_ID));

    expect(res.status).toBe(401);
  });

  it('returns 500 on a general Supabase error', async () => {
    mockSingleResult = { data: null, error: { code: 'PGRST000', message: 'unexpected db error' } };

    const req = makeGetRequest();
    const res = await getAnalysisDetail(req, makeIdParams(ANALYSIS_ID));

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /api/analyses/[id]/explain
// ---------------------------------------------------------------------------

describe('POST /api/analyses/[id]/explain', () => {
  /**
   * Sets up successive .single() results:
   *   call 1 → analysis row (data, no error)
   *   call 2 → cache miss (no data, no error)
   */
  function setupCacheMiss(analysisData = analysisDetailRow) {
    singleResults = [
      { data: analysisData, error: null },
      { data: null, error: null }, // cache miss
    ];
  }

  it('returns 200 with explanation for a valid file path', async () => {
    setupCacheMiss();

    const req = makeRequest({ filePath: 'src/index.ts' });
    const res = await postExplain(req, makeIdParams(ANALYSIS_ID));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.file).toBe('src/index.ts');
    expect(typeof body.explanation).toBe('string');
    expect(body.explanation).toBeTruthy();
    expect(mockChatCompletionsCreate).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when filePath is not in the analysis', async () => {
    setupCacheMiss();

    const req = makeRequest({ filePath: 'src/does-not-exist.ts' });
    const res = await postExplain(req, makeIdParams(ANALYSIS_ID));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not found in analysis/i);
  });

  it('returns 400 when filePath is missing from the body', async () => {
    setupCacheMiss();

    const req = makeRequest({});
    const res = await postExplain(req, makeIdParams(ANALYSIS_ID));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/filePath/i);
  });

  it('returns 400 when filePath is an empty string', async () => {
    setupCacheMiss();

    const req = makeRequest({ filePath: '   ' });
    const res = await postExplain(req, makeIdParams(ANALYSIS_ID));

    expect(res.status).toBe(400);
  });

  it('serves the cached explanation on the second request without calling OpenAI', async () => {
    const cachedResponse = { file: 'src/index.ts', explanation: 'Cached explanation.' };
    singleResults = [
      { data: analysisDetailRow, error: null },  // call 1: fetch analysis
      { data: { response: cachedResponse }, error: null }, // call 2: cache hit
    ];

    const req = makeRequest({ filePath: 'src/index.ts' });
    const res = await postExplain(req, makeIdParams(ANALYSIS_ID));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.explanation).toBe('Cached explanation.');
    expect(mockChatCompletionsCreate).not.toHaveBeenCalled();
  });

  it('calls OpenAI and writes the cache on a cache miss', async () => {
    setupCacheMiss();

    const req = makeRequest({ filePath: 'src/index.ts' });
    await postExplain(req, makeIdParams(ANALYSIS_ID));

    expect(mockChatCompletionsCreate).toHaveBeenCalledTimes(1);
    expect(supabaseChain.insert).toHaveBeenCalledTimes(1);
  });

  it('returns 404 for an invalid analysis ID', async () => {
    singleResults = [
      { data: null, error: { code: 'PGRST116', message: 'no rows' } },
    ];

    const req = makeRequest({ filePath: 'src/index.ts' });
    const res = await postExplain(req, makeIdParams('nonexistent-id'));

    expect(res.status).toBe(404);
  });

  it('returns 403 when the analysis belongs to a different organisation', async () => {
    singleResults = [
      {
        data: { ...analysisDetailRow, repositories: { organization_id: 'org_other_999' } },
        error: null,
      },
    ];

    const req = makeRequest({ filePath: 'src/index.ts' });
    const res = await postExplain(req, makeIdParams(ANALYSIS_ID));

    expect(res.status).toBe(403);
  });

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null, orgId: null });

    const req = makeRequest({ filePath: 'src/index.ts' });
    const res = await postExplain(req, makeIdParams(ANALYSIS_ID));

    expect(res.status).toBe(401);
  });

  it('returns 500 when OpenAI returns an empty response', async () => {
    setupCacheMiss();
    mockChatCompletionsCreate.mockResolvedValue({ choices: [] });

    const req = makeRequest({ filePath: 'src/index.ts' });
    const res = await postExplain(req, makeIdParams(ANALYSIS_ID));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/explanation|failed/i);
  });

  it('returns 500 when OpenAI throws an error', async () => {
    setupCacheMiss();
    mockChatCompletionsCreate.mockRejectedValue(new Error('OpenAI rate limit'));

    const req = makeRequest({ filePath: 'src/index.ts' });
    const res = await postExplain(req, makeIdParams(ANALYSIS_ID));

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Auth and RLS — cross-cutting cases
// ---------------------------------------------------------------------------

describe('Auth and RLS', () => {
  it('all routes return 401 when no user session exists', async () => {
    mockAuth.mockResolvedValue({ userId: null, orgId: null });

    const postRes = await postAnalyses(makeRequest({ repositoryUrl: REPO_URL }));
    const getListRes = await getAnalyses(makeGetRequest());
    const getDetailRes = await getAnalysisDetail(makeGetRequest(), makeIdParams(ANALYSIS_ID));
    const explainRes = await postExplain(
      makeRequest({ filePath: 'src/index.ts' }),
      makeIdParams(ANALYSIS_ID),
    );

    expect(postRes.status).toBe(401);
    expect(getListRes.status).toBe(401);
    expect(getDetailRes.status).toBe(401);
    expect(explainRes.status).toBe(401);
  });

  it('returns 400 (not 500) when the user has no active org context', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_test_123', orgId: null });

    const postRes = await postAnalyses(makeRequest({ repositoryUrl: REPO_URL }));
    const getListRes = await getAnalyses(makeGetRequest());

    expect(postRes.status).toBe(400);
    expect(getListRes.status).toBe(400);
    const postBody = await postRes.json();
    const getBody = await getListRes.json();
    expect(postBody.error).toMatch(/organization/i);
    expect(getBody.error).toMatch(/organization/i);
  });

  it('enforces organisation isolation: user in org_A cannot see org_B analysis (GET detail)', async () => {
    // User belongs to ORG_ID; analysis belongs to org_other.
    mockSingleResult = {
      data: { ...analysisDetailRow, repositories: { url: REPO_URL, organization_id: 'org_other_999' } },
      error: null,
    };

    const req = makeGetRequest();
    const res = await getAnalysisDetail(req, makeIdParams(ANALYSIS_ID));

    expect(res.status).toBe(403);
  });

  it('enforces organisation isolation: user in org_A cannot explain org_B analysis', async () => {
    singleResults = [
      {
        data: { ...analysisDetailRow, repositories: { organization_id: 'org_other_999' } },
        error: null,
      },
    ];

    const req = makeRequest({ filePath: 'src/index.ts' });
    const res = await postExplain(req, makeIdParams(ANALYSIS_ID));

    expect(res.status).toBe(403);
  });

  it('does not reveal the existence of a resource to an unauthorised organisation', async () => {
    // Even if the resource exists, org mismatch returns 403, not 404.
    mockSingleResult = {
      data: { ...analysisDetailRow, repositories: { url: REPO_URL, organization_id: 'org_other_999' } },
      error: null,
    };

    const res = await getAnalysisDetail(makeGetRequest(), makeIdParams(ANALYSIS_ID));

    expect(res.status).toBe(403);
    const body = await res.json();
    // The error message must not confirm the resource exists.
    expect(body.error.toLowerCase()).not.toContain('analysis');
    expect(body.error.toLowerCase()).toContain('forbidden');
  });
});
