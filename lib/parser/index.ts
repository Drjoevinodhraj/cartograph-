/**
 * lib/parser/index.ts
 *
 * Main export for the Cartograph parser.
 * Standalone: no Next.js, no database, no React imports.
 */

export type FileKind = 'component' | 'route' | 'util' | 'config' | 'other';
export type Language = 'ts' | 'tsx' | 'js' | 'jsx';

export type File = {
  path: string;       // relative path from repo root
  kind: FileKind;
  language: Language;
  isBarrel: boolean;  // true if index file with only re-exports
};

export type EdgeType = 'import' | 'dynamic' | 'unresolved';

export type Edge = {
  from: string;       // file doing the importing (relative path)
  to: string | null;  // resolved file path (relative), or null if unresolved
  type: EdgeType;
  reason?: string;    // why unresolved: 'external', 'not-found', 'parse-error', etc.
};

export type Coverage = {
  parsed: number;
  skipped: number;
  reasons: Map<string, number>;
};

export type ParserResult = {
  files: File[];
  edges: Edge[];
  coverage: Coverage;
};

export { parseRepository } from './parser';
