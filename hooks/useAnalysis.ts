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
}

interface UseAnalysisState {
  data: Analysis | null;
  loading: boolean;
  error: Error | null;
}

export function useAnalysis(analysisId: string): UseAnalysisState {
  const [state, setState] = useState<UseAnalysisState>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!analysisId) {
      setState({ data: null, loading: false, error: null });
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
        setState({ data, loading: false, error: null });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setState({ data: null, loading: false, error });
      }
    };

    fetchAnalysis();
  }, [analysisId]);

  return state;
}
