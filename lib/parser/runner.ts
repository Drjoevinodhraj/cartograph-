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
 * 5. Cleans up the temp clone.
 * 6. Returns an Analysis summary.
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
    // 5. Cleanup — always runs, even on error
    await cleanupDir(tmpDir);
  }
}
