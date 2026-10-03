/**
 * Review status type as a union of string literals.
 * Represents the state of a code review.
 */
export type ReviewStatus =
  | 'approved'
  | 'needs-review'
  | 'issues'
  | 'not-reviewed';

/**
 * Normalized review data ready for application use.
 */
export interface ReviewData {
  filePath: string;
  reviewStatus: ReviewStatus;
  commentCount: number;
  summary: string | null;
  externalReviewUrl: string | null;
  fetchedAt: Date;
}

/**
 * Internal representation of API response from CodeRabbit API.
 * Uses snake_case as returned by the API.
 */
export interface CodeRabbitReview {
  file_path: string;
  review_status: ReviewStatus;
  comment_count: number;
  summary?: string;
  external_url?: string;
}
