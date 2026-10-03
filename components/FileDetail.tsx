'use client';

import { useState } from 'react';
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react';

interface FileDetailProps {
  selectedFile: string | null;
  fileKind: 'component' | 'route' | 'util' | 'config' | 'other' | null;
  fanIn: string[];
  fanOut: string[];
  blastRadius: string[];
  neighbors: {
    in: string[];
    out: string[];
  };
  onLoadExplanation?: (filePath: string) => Promise<void>;
  explanation?: string | null;
  isLoadingExplanation?: boolean;
}

const kindColors: Record<string, { bg: string; text: string }> = {
  component: { bg: 'bg-purple-100 dark:bg-purple-950', text: 'text-purple-700 dark:text-purple-300' },
  route: { bg: 'bg-blue-100 dark:bg-blue-950', text: 'text-blue-700 dark:text-blue-300' },
  util: { bg: 'bg-gray-100 dark:bg-gray-900', text: 'text-gray-700 dark:text-gray-300' },
  config: { bg: 'bg-orange-100 dark:bg-orange-950', text: 'text-orange-700 dark:text-orange-300' },
  other: { bg: 'bg-gray-100 dark:bg-gray-900', text: 'text-gray-600 dark:text-gray-400' },
};

const kindLabel: Record<string, string> = {
  component: 'Component',
  route: 'Route',
  util: 'Utility',
  config: 'Config',
  other: 'Other',
};

interface CollapsibleSectionProps {
  title: string;
  count: number;
  items: string[];
  children?: React.ReactNode;
}

function CollapsibleSection({ title, count, items }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(true);

  if (items.length === 0) return null;

  return (
    <div className="space-y-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-2 py-1 hover:bg-gray-50 dark:hover:bg-slate-900 rounded transition-colors"
      >
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown size={14} className="text-gray-500 dark:text-gray-500" />
          ) : (
            <ChevronUp size={14} className="text-gray-500 dark:text-gray-500" />
          )}
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
            {title}
          </span>
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-500">
            {count}
          </span>
        </div>
      </button>
      {isOpen && (
        <div className="space-y-1 pl-4 border-l border-gray-200 dark:border-slate-800">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="text-xs text-gray-600 dark:text-gray-400 font-mono py-0.5 truncate hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
              title={item}
            >
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function FileDetail({
  selectedFile,
  fileKind,
  fanIn,
  fanOut,
  blastRadius,
  neighbors,
  onLoadExplanation,
  explanation,
  isLoadingExplanation,
}: FileDetailProps) {
  const [explanationRequested, setExplanationRequested] = useState(false);

  if (!selectedFile) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-white dark:bg-slate-950 border-l border-gray-200 dark:border-slate-800 p-4 w-64 text-center">
        <div className="text-gray-500 dark:text-gray-400 text-sm">
          Select a file to see details
        </div>
      </div>
    );
  }

  const colors = fileKind ? kindColors[fileKind] : kindColors.other;
  const label = fileKind ? kindLabel[fileKind] : 'Other';

  const handleLoadExplanation = async () => {
    if (!onLoadExplanation || !selectedFile) return;
    setExplanationRequested(true);
    try {
      await onLoadExplanation(selectedFile);
    } catch (error) {
      console.error('Failed to load explanation:', error);
    }
  };

  return (
    <div className="flex flex-col bg-white dark:bg-slate-950 border-l border-gray-200 dark:border-slate-800 h-screen w-64 overflow-hidden">
      {/* File Header */}
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-slate-800 p-4 space-y-3">
        <div className="space-y-1">
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            File
          </div>
          <div
            className="text-xs font-mono text-gray-900 dark:text-gray-100 break-words"
            title={selectedFile}
          >
            {selectedFile}
          </div>
        </div>

        {/* Kind Badge */}
        {fileKind && (
          <div className={`inline-block px-2 py-1 rounded text-xs font-medium ${colors.bg} ${colors.text}`}>
            {label}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Metrics */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Metrics
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-slate-900 rounded">
              <span className="text-gray-600 dark:text-gray-400">Imports</span>
              <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">
                {fanOut.length}
              </span>
            </div>
            <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-slate-900 rounded">
              <span className="text-gray-600 dark:text-gray-400">Imported by</span>
              <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">
                {fanIn.length}
              </span>
            </div>
            <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-slate-900 rounded">
              <span className="text-gray-600 dark:text-gray-400">Blast radius</span>
              <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">
                {blastRadius.length}
              </span>
            </div>
          </div>
        </div>

        {/* Neighbors */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Neighbors
          </h3>
          <div className="space-y-3">
            <CollapsibleSection
              title="Imports"
              count={neighbors.out.length}
              items={neighbors.out}
            />
            <CollapsibleSection
              title="Imported by"
              count={neighbors.in.length}
              items={neighbors.in}
            />
          </div>
        </div>

        {/* Explanation */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
              Explanation
            </h3>
          </div>

          {!explanation && !explanationRequested ? (
            <button
              onClick={handleLoadExplanation}
              disabled={isLoadingExplanation}
              className="w-full px-3 py-2 text-xs font-medium text-white bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-700 disabled:bg-blue-300 dark:disabled:bg-blue-800 rounded border border-blue-600 dark:border-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              {isLoadingExplanation ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Loading...
                </>
              ) : (
                'Load Explanation'
              )}
            </button>
          ) : null}

          {isLoadingExplanation && (
            <div className="flex items-center justify-center gap-2 text-gray-600 dark:text-gray-400 py-4">
              <Loader2 size={14} className="animate-spin" />
              <span className="text-xs">Loading explanation...</span>
            </div>
          )}

          {explanation && (
            <div className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed space-y-2 p-3 bg-gray-50 dark:bg-slate-900 rounded border border-gray-200 dark:border-slate-800 max-h-96 overflow-y-auto">
              {explanation.split('\n\n').map((paragraph, idx) => (
                <p key={idx}>{paragraph}</p>
              ))}
            </div>
          )}

          {explanationRequested && !isLoadingExplanation && !explanation && (
            <div className="text-xs text-amber-600 dark:text-amber-400 p-2 bg-amber-50 dark:bg-amber-950 rounded border border-amber-200 dark:border-amber-800">
              Could not load explanation. Try again or check your connection.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
