import { useEffect, useState, useCallback } from 'react';
import type { File, Edge } from './useAnalysis';

interface FileDetailState {
  selectedFile: string | null;
  fileKind: File['kind'] | null;
  fanIn: string[];
  fanOut: string[];
  blastRadius: string[];
  neighbors: {
    in: string[];
    out: string[];
  };
  explanation: string | null;
  isLoadingExplanation: boolean;
}

/**
 * Calculate fan-in: files that import the given file
 */
function calculateFanIn(filePath: string, edges: Edge[]): string[] {
  const fanIn = new Set<string>();
  edges.forEach((edge) => {
    if (edge.to === filePath) {
      fanIn.add(edge.from);
    }
  });
  return Array.from(fanIn).sort();
}

/**
 * Calculate fan-out: files imported by the given file
 */
function calculateFanOut(filePath: string, edges: Edge[]): string[] {
  const fanOut = new Set<string>();
  edges.forEach((edge) => {
    if (edge.from === filePath && edge.to !== null) {
      fanOut.add(edge.to);
    }
  });
  return Array.from(fanOut).sort();
}

/**
 * Calculate blast radius: all files affected if this file changes
 * Uses BFS to find all transitive dependents
 */
function calculateBlastRadius(filePath: string, edges: Edge[]): string[] {
  const blastRadius = new Set<string>();
  const queue = [filePath];
  const visited = new Set<string>([filePath]);

  while (queue.length > 0) {
    const current = queue.shift()!;

    // Find all files that import the current file
    edges.forEach((edge) => {
      if (edge.to === current && !visited.has(edge.from)) {
        visited.add(edge.from);
        blastRadius.add(edge.from);
        queue.push(edge.from);
      }
    });
  }

  return Array.from(blastRadius).sort();
}

/**
 * Get direct neighbors: immediate imports and importers
 */
function getNeighbors(
  filePath: string,
  edges: Edge[]
): { in: string[]; out: string[] } {
  const inNeighbors = new Set<string>();
  const outNeighbors = new Set<string>();

  edges.forEach((edge) => {
    if (edge.from === filePath && edge.to !== null) {
      outNeighbors.add(edge.to);
    }
    if (edge.to === filePath) {
      inNeighbors.add(edge.from);
    }
  });

  return {
    in: Array.from(inNeighbors).sort(),
    out: Array.from(outNeighbors).sort(),
  };
}

export function useFileDetail(
  files: File[],
  edges: Edge[],
  analysisId: string
): FileDetailState & {
  setSelectedFile: (filePath: string | null) => void;
  loadExplanation: (filePath: string) => Promise<void>;
} {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isLoadingExplanation, setIsLoadingExplanation] = useState(false);

  // Find the selected file in the files array
  const fileData = selectedFile ? files.find((f) => f.path === selectedFile) : null;

  // Calculate metrics
  const fanIn = selectedFile ? calculateFanIn(selectedFile, edges) : [];
  const fanOut = selectedFile ? calculateFanOut(selectedFile, edges) : [];
  const blastRadius = selectedFile ? calculateBlastRadius(selectedFile, edges) : [];
  const neighbors = selectedFile ? getNeighbors(selectedFile, edges) : { in: [], out: [] };

  const loadExplanation = useCallback(
    async (filePath: string) => {
      if (!filePath || !analysisId) return;

      setIsLoadingExplanation(true);
      setExplanation(null);

      try {
        const response = await fetch(`/api/analyses/${analysisId}/explain`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath }),
        });

        if (!response.ok) {
          throw new Error(
            `Failed to load explanation: ${response.status} ${response.statusText}`
          );
        }

        const data = await response.json();
        setExplanation(data.explanation || '');
      } catch (err) {
        console.error('Failed to load explanation:', err);
        setExplanation(null);
      } finally {
        setIsLoadingExplanation(false);
      }
    },
    [analysisId]
  );

  // Clear explanation when file changes
  useEffect(() => {
    setExplanation(null);
  }, [selectedFile]);

  return {
    selectedFile,
    fileKind: fileData?.kind || null,
    fanIn,
    fanOut,
    blastRadius,
    neighbors,
    explanation,
    isLoadingExplanation,
    setSelectedFile,
    loadExplanation,
  };
}
