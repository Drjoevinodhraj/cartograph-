'use client';

import { useEffect, useState } from 'react';
import { useReactFlow } from 'reactflow';
import { Moon, Sun, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface GraphControlsProps {
  fileCount: number;
  edgeCount: number;
  coverage: number;
  onLayoutChange?: (layout: 'hierarchical' | 'force-directed') => void;
}

export function GraphControls({
  fileCount,
  edgeCount,
  coverage,
  onLayoutChange,
}: GraphControlsProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [layout, setLayout] = useState<'hierarchical' | 'force-directed'>(
    'hierarchical'
  );

  const applyDarkMode = (isDark: boolean) => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
  };

  // Initialize dark mode from localStorage and system preference
  useEffect(() => {
    const savedDarkMode = localStorage.getItem('cartograph-dark-mode');
    if (savedDarkMode !== null) {
      const isDark = savedDarkMode === 'true';
      setIsDarkMode(isDark);
      applyDarkMode(isDark);
    } else {
      // Use system preference
      const prefersDark = window.matchMedia(
        '(prefers-color-scheme: dark)'
      ).matches;
      setIsDarkMode(prefersDark);
      applyDarkMode(prefersDark);
    }
  }, []);


  const handleDarkModeToggle = () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);
    localStorage.setItem('cartograph-dark-mode', String(newDarkMode));
    applyDarkMode(newDarkMode);
  };

  const handleLayoutChange = (newLayout: 'hierarchical' | 'force-directed') => {
    setLayout(newLayout);
    onLayoutChange?.(newLayout);
  };

  const coveragePercent = Math.round(coverage * 100);

  return (
    <div className="flex flex-col gap-6 bg-white dark:bg-slate-950 border-r border-gray-200 dark:border-slate-800 p-4 h-screen overflow-y-auto w-48">
      {/* Zoom Controls */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          Zoom
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => zoomIn()}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 rounded border border-gray-300 dark:border-slate-700 transition-colors"
            title="Zoom In (Ctrl/Cmd +)"
          >
            <ZoomIn size={16} />
            In
          </button>
          <button
            onClick={() => zoomOut()}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 rounded border border-gray-300 dark:border-slate-700 transition-colors"
            title="Zoom Out (Ctrl/Cmd -)"
          >
            <ZoomOut size={16} />
            Out
          </button>
          <button
            onClick={() => fitView()}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 rounded border border-gray-300 dark:border-slate-700 transition-colors"
            title="Fit View"
          >
            <Maximize2 size={16} />
            Fit
          </button>
        </div>
      </div>

      {/* Layout Toggle */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          Layout
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => handleLayoutChange('hierarchical')}
            className={`flex-1 px-2 py-2 text-xs font-medium rounded border transition-colors ${
              layout === 'hierarchical'
                ? 'bg-blue-500 dark:bg-blue-600 text-white border-blue-600 dark:border-blue-700'
                : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-slate-700 hover:bg-gray-200 dark:hover:bg-slate-700'
            }`}
          >
            Hierarchical
          </button>
          <button
            onClick={() => handleLayoutChange('force-directed')}
            className={`flex-1 px-2 py-2 text-xs font-medium rounded border transition-colors ${
              layout === 'force-directed'
                ? 'bg-blue-500 dark:bg-blue-600 text-white border-blue-600 dark:border-blue-700'
                : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-slate-700 hover:bg-gray-200 dark:hover:bg-slate-700'
            }`}
          >
            Force
          </button>
        </div>
      </div>

      {/* File Stats */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          File Stats
        </h3>
        <div className="space-y-3 text-xs">
          <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-slate-900 rounded border border-gray-200 dark:border-slate-800">
            <span className="text-gray-600 dark:text-gray-400">Files</span>
            <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">
              {fileCount}
            </span>
          </div>
          <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-slate-900 rounded border border-gray-200 dark:border-slate-800">
            <span className="text-gray-600 dark:text-gray-400">Edges</span>
            <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">
              {edgeCount}
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Coverage</span>
              <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">
                {coveragePercent}%
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-green-500 dark:bg-green-600 rounded-full transition-all duration-300"
                style={{ width: `${coveragePercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Dark Mode Toggle */}
      <div className="space-y-2 mt-auto pt-4 border-t border-gray-200 dark:border-slate-800">
        <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          Theme
        </h3>
        <button
          onClick={handleDarkModeToggle}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 rounded border border-gray-300 dark:border-slate-700 transition-colors"
          title="Toggle Dark Mode"
        >
          {isDarkMode ? (
            <>
              <Sun size={16} />
              Light
            </>
          ) : (
            <>
              <Moon size={16} />
              Dark
            </>
          )}
        </button>
      </div>
    </div>
  );
}
