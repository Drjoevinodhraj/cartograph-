import { useEffect, useState } from 'react';

export interface File {
  path: string;
  kind: 'component' | 'route' | 'util' | 'config' | 'other';
  language: 'ts' | 'tsx' | 'js' | 'jsx';
  isBarrel: boolean;
}

export interface Edge {
  from: string;
  to: string | null;
  type: 'import' | 'dynamic' | 'unresolved';
  reason?: string;
}

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

export interface Analysis {
  id: string;
  organizationId: string;
  repositoryUrl: string;
  fileList: File[];
  edgeList: Edge[];
  coverage: {
    parsed: number;
    skipped: number;
    reasons: Record<string, number>;
  };
  reviews?: ReviewData[];
}

interface UseAnalysisState {
  data: Analysis | null;
  loading: boolean;
  error: Error | null;
  reviews: Map<string, ReviewData>;
}

export function useAnalysis(analysisId: string): UseAnalysisState {
  const [state, setState] = useState<UseAnalysisState>({
    data: null,
    loading: true,
    error: null,
    reviews: new Map(),
  });

  useEffect(() => {
    if (!analysisId) {
      setState({ data: null, loading: false, error: null, reviews: new Map() });
      return;
    }

    const fetchAnalysis = async () => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        const response = await fetch(`/api/analyses/${analysisId}`);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch analysis: ${response.status} ${response.statusText}`
          );
        }

        const data: Analysis = await response.json();

        // Convert reviews array to Map for O(1) lookup by file path
        const reviewsMap = new Map<string, ReviewData>();
        if (data.reviews && Array.isArray(data.reviews)) {
          data.reviews.forEach((review) => {
            reviewsMap.set(review.filePath, review);
          });
        }

        setState({ data, loading: false, error: null, reviews: reviewsMap });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setState({ data: null, loading: false, error, reviews: new Map() });
      }
    };

    fetchAnalysis();
  }, [analysisId]);

  return state;
}
