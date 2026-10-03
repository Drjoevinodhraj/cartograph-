import { createClient } from '@supabase/supabase-js';
import type { ReviewData, ReviewStatus } from './types';

// Lazy-load Supabase client to allow mocking in tests
let supabase: any = null;

function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
  }
  return supabase;
}

// For testing: allow injecting a mock client
export function _setSupabaseClient(client: any) {
  supabase = client;
}

/**
 * Error code for not-found responses from Supabase
 */
const PGRST_NOT_FOUND = 'PGRST116';

/**
 * Maps a database row to ReviewData type.
 * Handles type conversions: ISO string dates → Date objects, snake_case → camelCase.
 */
function mapRowToReviewData(row: any): ReviewData {
  return {
    filePath: row.file_path,
    reviewStatus: row.review_status as ReviewStatus,
    commentCount: row.comment_count || 0,
    summary: row.summary || null,
    externalReviewUrl: row.external_review_url || null,
    fetchedAt: new Date(row.fetched_at),
  };
}

/**
 * Store reviews in the database with upsert behavior.
 * Upsert key: (repository_id, file_path) — same file in same repo is updated, not duplicated.
 * RLS enforces that the user has access to the organization.
 *
 * @param orgId - Organization ID (enforced by RLS on SELECT)
 * @param repoId - Repository ID
 * @param reviews - Array of ReviewData to store
 */
export async function storeReviews(
  orgId: string,
  repoId: string,
  reviews: ReviewData[]
): Promise<void> {
  // Silent return if empty array
  if (reviews.length === 0) {
    return;
  }

  try {
    // Build upsert payload: convert ReviewData to database row format
    const rows = reviews.map((review) => ({
      id: crypto.randomUUID(),
      organization_id: orgId,
      repository_id: repoId,
      file_path: review.filePath,
      review_status: review.reviewStatus,
      comment_count: review.commentCount,
      summary: review.summary,
      external_review_url: review.externalReviewUrl,
      fetched_at: review.fetchedAt.toISOString(),
      created_at: new Date().toISOString(),
    }));

    // Upsert with conflict on (repository_id, file_path)
    const { error } = await getSupabaseClient()
      .from('coderabbit_reviews')
      .upsert(rows, {
        onConflict: 'repository_id,file_path',
      });

    if (error) {
      console.error('Error upserting reviews:', error);
      throw error;
    }
  } catch (error) {
    console.error('storeReviews failed:', error);
    throw error;
  }
}

/**
 * Fetch a single review by file path.
 * RLS enforces that the organization_id belongs to the user's organizations.
 *
 * @param orgId - Organization ID
 * @param repoId - Repository ID
 * @param filePath - File path to fetch
 * @returns ReviewData if found, null if not found or forbidden
 */
export async function getReviewForFile(
  orgId: string,
  repoId: string,
  filePath: string
): Promise<ReviewData | null> {
  try {
    const { data, error } = await getSupabaseClient()
      .from('coderabbit_reviews')
      .select('*')
      .eq('organization_id', orgId)
      .eq('repository_id', repoId)
      .eq('file_path', filePath)
      .single();

    // PGRST116 means "not found" — return null silently (not an error)
    if (error && error.code === PGRST_NOT_FOUND) {
      return null;
    }

    if (error) {
      console.error('Error fetching review for file:', error);
      throw error;
    }

    return data ? mapRowToReviewData(data) : null;
  } catch (error) {
    // If it's a not-found error (PGRST116), return null
    if (error instanceof Error && error.message.includes(PGRST_NOT_FOUND)) {
      return null;
    }
    console.error('getReviewForFile failed:', error);
    throw error;
  }
}

/**
 * Fetch all reviews for a repository.
 * RLS enforces that the organization_id belongs to the user's organizations.
 *
 * @param orgId - Organization ID
 * @param repoId - Repository ID
 * @returns Map<filePath, ReviewData> (empty map if no results)
 */
export async function getReviewsForRepo(
  orgId: string,
  repoId: string
): Promise<Map<string, ReviewData>> {
  try {
    const { data, error } = await getSupabaseClient()
      .from('coderabbit_reviews')
      .select('*')
      .eq('organization_id', orgId)
      .eq('repository_id', repoId);

    if (error) {
      console.error('Error fetching reviews for repo:', error);
      throw error;
    }

    const reviewMap = new Map<string, ReviewData>();

    if (data) {
      for (const row of data) {
        const review = mapRowToReviewData(row);
        reviewMap.set(review.filePath, review);
      }
    }

    return reviewMap;
  } catch (error) {
    console.error('getReviewsForRepo failed:', error);
    throw error;
  }
}

/**
 * Update a single review in the database.
 * Uses upsert with the same key as storeReviews: (repository_id, file_path).
 * RLS enforces that the user has access to the organization.
 *
 * @param orgId - Organization ID
 * @param repoId - Repository ID
 * @param filePath - File path to update
 * @param newReviewData - Updated ReviewData
 * @returns The updated ReviewData
 */
export async function refreshReview(
  orgId: string,
  repoId: string,
  filePath: string,
  newReviewData: ReviewData
): Promise<ReviewData> {
  try {
    const row = {
      id: crypto.randomUUID(),
      organization_id: orgId,
      repository_id: repoId,
      file_path: filePath,
      review_status: newReviewData.reviewStatus,
      comment_count: newReviewData.commentCount,
      summary: newReviewData.summary,
      external_review_url: newReviewData.externalReviewUrl,
      fetched_at: newReviewData.fetchedAt.toISOString(),
      created_at: new Date().toISOString(),
    };

    const { data, error } = await getSupabaseClient()
      .from('coderabbit_reviews')
      .upsert([row], {
        onConflict: 'repository_id,file_path',
      })
      .select()
      .single();

    if (error) {
      console.error('Error refreshing review:', error);
      throw error;
    }

    return mapRowToReviewData(data);
  } catch (error) {
    console.error('refreshReview failed:', error);
    throw error;
  }
}
