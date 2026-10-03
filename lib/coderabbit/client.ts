import type { ReviewData, ReviewStatus, CodeRabbitReview } from './types';

const API_ENDPOINT = 'https://api.coderabbit.ai/v1/reviews';
const TIMEOUT_MS = 30000;

/**
 * Valid review statuses.
 */
const VALID_REVIEW_STATUSES = new Set<ReviewStatus>([
  'approved',
  'needs-review',
  'issues',
  'not-reviewed',
]);

/**
 * Normalize a file path: convert backslashes to forward slashes,
 * and strip leading slashes.
 */
function normalizeFilePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '');
}

/**
 * Check if a value is a valid review status.
 */
function isValidReviewStatus(status: unknown): status is ReviewStatus {
  return VALID_REVIEW_STATUSES.has(status as ReviewStatus);
}

/**
 * Fetch code reviews for a repository from CodeRabbit API.
 * Implements graceful error handling with 30-second timeout.
 *
 * @param repoUrl - GitHub repository URL (e.g., "https://github.com/example/repo")
 * @param apiKey - CodeRabbit API key
 * @returns Array of ReviewData, empty array on any error
 */
export async function fetchReviewsForRepo(
  repoUrl: string,
  apiKey: string
): Promise<ReviewData[]> {
  // Early return if API key is missing
  if (!apiKey || apiKey.trim() === '') {
    console.warn('CodeRabbit API key is empty or null');
    return [];
  }

  try {
    // Create abort controller for timeout enforcement
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, TIMEOUT_MS);

    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ repository_url: repoUrl }),
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);

      // Check response status
      if (!response.ok) {
        console.warn(
          `CodeRabbit API request failed with status ${response.status}`
        );
        return [];
      }

      // Parse JSON response
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        console.warn('Failed to parse CodeRabbit API response as JSON');
        return [];
      }

      // Validate response structure
      if (!isResponseValid(data)) {
        console.warn('CodeRabbit API response has invalid structure');
        return [];
      }

      // Transform and validate reviews
      const now = new Date();
      const reviews: ReviewData[] = [];

      for (const review of data.reviews) {
        // Skip reviews with invalid status
        if (!isValidReviewStatus(review.review_status)) {
          continue;
        }

        // Validate required fields
        if (
          typeof review.file_path !== 'string' ||
          typeof review.comment_count !== 'number' ||
          review.comment_count < 0
        ) {
          continue;
        }

        // Transform to ReviewData
        const reviewData: ReviewData = {
          filePath: normalizeFilePath(review.file_path),
          reviewStatus: review.review_status,
          commentCount: review.comment_count,
          summary: review.summary ?? null,
          externalReviewUrl: review.external_url ?? null,
          fetchedAt: now,
        };

        reviews.push(reviewData);
      }

      return reviews;
    } catch (error) {
      clearTimeout(timeoutId);

      // Check for timeout (AbortError)
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('CodeRabbit API request timed out (30s)');
        return [];
      }

      // Any other error
      console.warn('CodeRabbit API request failed:', error);
      return [];
    }
  } catch (error) {
    console.warn('Unexpected error in fetchReviewsForRepo:', error);
    return [];
  }
}

/**
 * Type guard to validate API response structure.
 */
function isResponseValid(data: unknown): data is { reviews: CodeRabbitReview[] } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'reviews' in data &&
    Array.isArray((data as Record<string, unknown>).reviews)
  );
}
