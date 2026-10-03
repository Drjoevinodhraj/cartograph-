/**
 * lib/parser/runner.ts
 *
 * Analysis runner: clones a GitHub repo, runs the Phase 2 parser,
 * stores results in Supabase, then cleans up the temp clone.
 *
 * This is server-only code (database access). Do not import from client components.
 */

import * as fs from 'fs';
import * as path from 'path';
import { simpleGit } from 'simple-git';
import { createClient } from '@supabase/supabase-js';

import { parseRepository } from '@/lib/parser';
import type { Coverage, File as RepoFile, Edge } from '@/lib/parser';
import { fetchReviewsForRepo } from '@/lib/coderabbit/client';
import { storeReviews } from '@/lib/coderabbit/storage';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type Analysis = {
  id: string;              // UUID of the analysis_results row
  organizationId: string;
  repositoryUrl: string;
  fileCount: number;
  edgeCount: number;
  coverage: {
    parsed: number;
    skipped: number;
    reasons: Record<string, number>;
  };
  createdAt: Date;
};

// ---------------------------------------------------------------------------
// Errors with HTTP-style status codes
// ---------------------------------------------------------------------------

export class AnalysisError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 400 | 404 | 500 | 503,
  ) {
    super(message);
    this.name = 'AnalysisError';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validateGitHubUrl(url: string): void {
  if (!url.startsWith('https://github.com/')) {
    throw new AnalysisError(
      `Invalid repository URL: "${url}". Must start with https://github.com/`,
      400,
    );
  }
  // Require at least owner/repo after the domain
  const rest = url.replace('https://github.com/', '').replace(/\.git$/, '');
  const parts = rest.split('/').filter(Boolean);
  if (parts.length < 2) {
    throw new AnalysisError(
      `Invalid repository URL: "${url}". Must be in the form https://github.com/owner/repo`,
      400,
    );
  }
}

/** Build a Supabase service-role client (server-side only). */
function makeSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new AnalysisError(
      'Supabase environment variables are not configured (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)',
      500,
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

/** Remove a directory tree, logging failures without rethrowing. */
async function cleanupDir(dirPath: string): Promise<void> {
  try {
    await fs.promises.rm(dirPath, { recursive: true, force: true });
  } catch (err) {
    // Cleanup failure is non-fatal — log and continue
    console.error(`[runner] cleanup failed for ${dirPath}:`, err);
  }
}

/** Convert Coverage.reasons Map to a plain Record for serialisation. */
function reasonsToRecord(reasons: Map<string, number>): Record<string, number> {
  const record: Record<string, number> = {};
  for (const [key, value] of reasons) {
    record[key] = value;
  }
  return record;
}

/**
 * Fetch CodeRabbit API key for an organization from the database.
 * Non-fatal: returns null if key not found or query fails.
 *
 * @param orgId - Organization ID
 * @returns CodeRabbit API key or null if not configured
 */
async function getOrganizationCodeRabbitKey(orgId: string): Promise<string | null> {
  try {
    const supabase = makeSupabaseClient();

    const { data, error } = await supabase
      .from('organizations')
      .select('coderabbit_api_key')
      .eq('id', orgId)
      .single();

    if (error) {
      console.warn('[runner] Failed to fetch organization CodeRabbit API key:', error.message);
      return null;
    }

    return data?.coderabbit_api_key || null;
  } catch (err) {
    console.warn('[runner] Error querying CodeRabbit key:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Fetch CodeRabbit reviews asynchronously (fire-and-forget).
 * This runs after the analysis response is returned, so any delays here don't block the user.
 * Implements 30-second timeout with explicit error handling.
 *
 * SECURITY FIX #4: Explicit timeout handling to distinguish timeout from fetch errors.
 *
 * @param repoUrl - Repository URL
 * @param orgId - Organization ID
 * @param repoId - Repository ID
 * @param apiKey - CodeRabbit API key
 */
function fetchReviewsAsync(
  repoUrl: string,
  orgId: string,
  repoId: string,
  apiKey: string,
): void {
  // Fire-and-forget: create a timeout error class to distinguish timeouts
  class TimeoutError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'TimeoutError';
    }
  }

  // Race the fetch against a timeout, then handle the result
  Promise.race([
    fetchReviewsForRepo(repoUrl, apiKey),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new TimeoutError('CodeRabbit fetch timed out after 30 seconds')), 30000)
    ),
  ])
    .then((reviews) => {
      if (reviews.length > 0) {
        return storeReviews(orgId, repoId, reviews);
      }
    })
    .then(() => {
      console.info(`[runner] CodeRabbit reviews processed for repo ${repoId}`);
    })
    .catch((error) => {
      // Distinguish timeout from other errors
      if (error instanceof TimeoutError) {
        console.warn('[runner]', error.message);
      } else {
        console.warn(
          '[runner] CodeRabbit fetch failed:',
          error instanceof Error ? error.message : String(error)
        );
      }
      // Don't fail analysis on CodeRabbit errors — this is non-blocking
    });
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * analyzeRepository
 *
 * 1. Validates the GitHub URL.
 * 2. Clones the repo into a temp directory.
 * 3. Runs the Phase 2 parser over the clone.
 * 4. Stores the results in Supabase (repositories + analysis_results).
 * 5. Triggers CodeRabbit review fetch asynchronously (non-blocking).
 * 6. Cleans up the temp clone.
 * 7. Returns an Analysis summary.
 */
export async function analyzeRepository(
  repoUrl: string,
  userId: string,
  organizationId: string,
): Promise<Analysis> {
  // 1. Validate
  validateGitHubUrl(repoUrl);

  // 2. Clone
  const tmpDir = `/tmp/cartograph-analysis-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  try {
    await fs.promises.mkdir(tmpDir, { recursive: true });
  } catch (err) {
    throw new AnalysisError(
      `Failed to create temp directory: ${(err as NodeJS.ErrnoException).message}`,
      500,
    );
  }

  try {
    const git = simpleGit();

    try {
      await git.clone(repoUrl, tmpDir, ['--depth', '1']);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (
        message.includes('not found') ||
        message.includes('Repository not found') ||
        message.includes('does not exist') ||
        message.includes('404')
      ) {
        throw new AnalysisError(
          `Repository not found: ${repoUrl}`,
          404,
        );
      }

      if (
        message.includes('timed out') ||
        message.includes('timeout') ||
        message.includes('Connection refused') ||
        message.includes('Could not resolve host')
      ) {
        throw new AnalysisError(
          `Network error cloning ${repoUrl}: ${message}`,
          503,
        );
      }

      throw new AnalysisError(
        `Failed to clone repository ${repoUrl}: ${message}`,
        503,
      );
    }

    // 3. Parse
    let files: RepoFile[];
    let edges: Edge[];
    let coverage: Coverage;

    try {
      const result = await parseRepository(tmpDir);
      files = result.files;
      edges = result.edges;
      coverage = result.coverage;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new AnalysisError(
        `Failed to parse repository ${repoUrl}: ${message}`,
        500,
      );
    }

    // 4. Store in Supabase
    const supabase = makeSupabaseClient();

    // 4a. Upsert into repositories (url is unique per organization)
    const { data: repoRow, error: repoError } = await supabase
      .from('repositories')
      .upsert(
        {
          url: repoUrl,
          organization_id: organizationId,
          last_analyzed: new Date().toISOString(),
        },
        { onConflict: 'url,organization_id' },
      )
      .select('id')
      .single();

    if (repoError !== null) {
      throw new AnalysisError(
        `Failed to upsert repository record: ${repoError.message}`,
        500,
      );
    }

    const repositoryId: string = repoRow.id;

    // 4b. Insert analysis_results
    const coverageRecord = reasonsToRecord(coverage.reasons);
    const coveragePct =
      coverage.parsed + coverage.skipped > 0
        ? coverage.parsed / (coverage.parsed + coverage.skipped)
        : null;

    const { data: analysisRow, error: analysisError } = await supabase
      .from('analysis_results')
      .insert({
        repository_id: repositoryId,
        file_list: files as unknown as object,
        edge_list: edges as unknown as object,
        coverage: coveragePct,
      })
      .select('id, created_at')
      .single();

    if (analysisError !== null) {
      throw new AnalysisError(
        `Failed to insert analysis result: ${analysisError.message}`,
        500,
      );
    }

    // 5. Trigger CodeRabbit review fetch asynchronously (fire-and-forget)
    // This happens after analysis is stored, so we can return to the user immediately
    if (organizationId && repositoryId) {
      const coderabbitApiKey = await getOrganizationCodeRabbitKey(organizationId);
      
      if (coderabbitApiKey) {
        // Fire and forget: start the async fetch but don't await it
        fetchReviewsAsync(repoUrl, organizationId, repositoryId, coderabbitApiKey);
      } else {
        console.debug('[runner] No CodeRabbit API key configured for organization');
      }
    }

    return {
      id: analysisRow.id as string,
      organizationId,
      repositoryUrl: repoUrl,
      fileCount: files.length,
      edgeCount: edges.length,
      coverage: {
        parsed: coverage.parsed,
        skipped: coverage.skipped,
        reasons: coverageRecord,
      },
      createdAt: new Date(analysisRow.created_at as string),
    };
  } finally {
    // 6. Cleanup — always runs, even on error
    await cleanupDir(tmpDir);
  }
}
