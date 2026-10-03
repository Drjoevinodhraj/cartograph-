/**
 * app/api/coderabbit/refresh/route.ts
 *
 * POST /api/coderabbit/refresh — Fetch fresh review for a single file on-demand.
 *
 * Auth: Clerk session via auth().
 * Org:  RLS verification at DB layer.
 * Security: Service-role client + explicit organization membership check.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { fetchReviewsForRepo } from '@/lib/coderabbit/client';
import { refreshReview } from '@/lib/coderabbit/storage';
import type { ReviewData } from '@/lib/coderabbit/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a service-role Supabase client. Server-side only. */
function makeSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase environment variables are not configured (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)'
    );
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

/** Create a default "not-reviewed" review for a file. */
function createDefaultReview(filePath: string): ReviewData {
  return {
    filePath,
    reviewStatus: 'not-reviewed',
    commentCount: 0,
    summary: null,
    externalReviewUrl: null,
    fetchedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// POST /api/coderabbit/refresh
// ---------------------------------------------------------------------------

/**
 * Refresh a code review for a single file on-demand.
 *
 * Body: { analysisId: string, filePath: string }
 *
 * Returns 200 with ReviewData on success.
 * Returns 400 if analysisId or filePath is missing.
 * Returns 401 if the user is not authenticated.
 * Returns 403 if the user is not in the analysis's organization.
 * Returns 404 if the analysis or repository is not found.
 * Returns 503 if CodeRabbit is not configured for the organization.
 * Returns 500 on unexpected errors.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    // 1. Parse and validate input
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    if (
      typeof body !== 'object' ||
      body === null ||
      !('analysisId' in body) ||
      !('filePath' in body) ||
      typeof (body as Record<string, unknown>).analysisId !== 'string' ||
      typeof (body as Record<string, unknown>).filePath !== 'string'
    ) {
      return NextResponse.json(
        { error: 'Missing analysisId or filePath' },
        { status: 400 }
      );
    }

    const { analysisId, filePath } = body as {
      analysisId: string;
      filePath: string;
    };

    // 2. Authenticate user
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = makeSupabaseClient();

    // 3. Fetch analysis and verify it exists
    const { data: analysis, error: analysisError } = await supabase
      .from('analysis_results')
      .select('id, repositories!inner(repository_id, organization_id)')
      .eq('id', analysisId)
      .single();

    if (analysisError || !analysis) {
      return NextResponse.json(
        { error: 'Analysis not found' },
        { status: 404 }
      );
    }

    // Extract organization_id from the joined repository
    const repo = Array.isArray(analysis.repositories)
      ? analysis.repositories[0]
      : analysis.repositories;

    if (!repo) {
      return NextResponse.json(
        { error: 'Analysis not found' },
        { status: 404 }
      );
    }

    const organizationId = repo.organization_id;
    const repositoryId = repo.repository_id;

    // 4. Verify user is in organization (RLS check)
    const { data: membership, error: membershipError } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json(
        { error: 'Unauthorized - not in organization' },
        { status: 403 }
      );
    }

    // 5. Get repository info
    const { data: repository, error: repoError } = await supabase
      .from('repositories')
      .select('id, url')
      .eq('id', repositoryId)
      .single();

    if (repoError || !repository) {
      return NextResponse.json(
        { error: 'Repository not found' },
        { status: 404 }
      );
    }

    // 6. Get organization's CodeRabbit API key
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('coderabbit_api_key')
      .eq('id', organizationId)
      .single();

    if (orgError || !organization || !organization.coderabbit_api_key) {
      return NextResponse.json(
        { error: 'CodeRabbit not configured for organization' },
        { status: 503 }
      );
    }

    // 7. Fetch fresh review from CodeRabbit
    const reviews = await fetchReviewsForRepo(
      repository.url,
      organization.coderabbit_api_key
    );

    // Find the review matching the requested file path
    let freshReview = reviews.find((r) => r.filePath === filePath);

    // If not found, create a default "not-reviewed" review
    if (!freshReview) {
      freshReview = createDefaultReview(filePath);
    }

    // 8. Store updated review in database
    await refreshReview(organizationId, repositoryId, filePath, freshReview);

    // 9. Return ReviewData
    return NextResponse.json(freshReview, { status: 200 });
  } catch (error) {
    console.error('[POST /api/coderabbit/refresh]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
