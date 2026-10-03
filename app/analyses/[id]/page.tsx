'use client';

import { use, useState } from 'react';
import { DependencyGraph } from '@/components/DependencyGraph';
import { GraphControls } from '@/components/GraphControls';
import { FileDetail } from '@/components/FileDetail';
import { useAnalysis } from '@/hooks/useAnalysis';
import { useGraphLayout } from '@/hooks/useGraphLayout';
import { useFileDetail } from '@/hooks/useFileDetail';
import { AlertCircle, Loader2 } from 'lucide-react';

interface AnalysisPageProps {
  params: Promise<{ id: string }>;
}

export default function AnalysisPage({ params }: AnalysisPageProps) {
  const resolvedParams = use(params);
  const { data: analysis, loading: analysisLoading, error: analysisError } = useAnalysis(
    resolvedParams.id
  );

  const [layoutMode, setLayoutMode] = useState<'hierarchical' | 'force-directed'>(
    'hierarchical'
  );

  // Initialize file detail hook when analysis loads
  const fileDetail = useFileDetail(
    analysis?.fileList || [],
    analysis?.edgeList || [],
    resolvedParams.id
  );

  const { nodes, edges } = useGraphLayout(
    analysis?.fileList || [],
    analysis?.edgeList || [],
    fileDetail.selectedFile,
    layoutMode
  );

  if (analysisLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-white dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-blue-500" />
          <p className="text-sm text-gray-600 dark:text-gray-400">Loading analysis...</p>
        </div>
      </div>
    );
  }

  if (analysisError || !analysis) {
    return (
      <div className="flex items-center justify-center h-screen bg-white dark:bg-slate-950">
        <div className="flex flex-col items-center gap-4 max-w-md">
          <AlertCircle size={48} className="text-red-500" />
          <div className="text-center">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Failed to load analysis
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {analysisError?.message || 'The analysis could not be found or loaded.'}
            </p>
          </div>
          <a
            href="/analyses"
            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            Back to analyses
          </a>
        </div>
      </div>
    );
  }

  const coveragePercentage = analysis.coverage.parsed / (analysis.coverage.parsed + analysis.coverage.skipped);

  return (
    <div className="flex h-screen bg-white dark:bg-slate-950 overflow-hidden">
      {/* Left: Controls */}
      <GraphControls
        fileCount={analysis.fileList.length}
        edgeCount={analysis.edgeList.filter((e) => e.to !== null).length}
        coverage={coveragePercentage}
        onLayoutChange={setLayoutMode}
      />

      {/* Center: Graph */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-slate-900">
        <div className="flex-1 overflow-hidden">
          {nodes.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-500 dark:text-gray-400">
                <p className="text-sm">No files to display</p>
              </div>
            </div>
          ) : (
            <DependencyGraph
              files={analysis.fileList}
              edges={analysis.edgeList}
              onSelectFile={fileDetail.setSelectedFile}
              selectedFile={fileDetail.selectedFile || undefined}
              layout={layoutMode}
            />
          )}
        </div>

        {/* Repository Info Footer */}
        <div className="flex-shrink-0 border-t border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 py-2 text-xs text-gray-600 dark:text-gray-400 font-mono">
          <span className="truncate">{analysis.repositoryUrl}</span>
        </div>
      </div>

      {/* Right: File Detail */}
      <FileDetail
        selectedFile={fileDetail.selectedFile}
        fileKind={fileDetail.fileKind}
        fanIn={fileDetail.fanIn}
        fanOut={fileDetail.fanOut}
        blastRadius={fileDetail.blastRadius}
        neighbors={fileDetail.neighbors}
        onLoadExplanation={fileDetail.loadExplanation}
        explanation={fileDetail.explanation}
        isLoadingExplanation={fileDetail.isLoadingExplanation}
      />
    </div>
  );
}
