/**
 * lib/parser/parser.ts
 *
 * File walk, AST parsing with ts-morph, import extraction, and coverage reporting.
 * Standalone: no Next.js, no database, no React imports.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Project, SourceFile, SyntaxKind } from 'ts-morph';

import type {
  File as RepoFile,
  Edge,
  Coverage,
  Language,
  ParserResult,
} from './index';
import {
  loadPathAliases,
  resolveImport,
  detectBarrel,
  type PathAliases,
} from './resolve';

// Directories to skip during file walk
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'build',
  '.git',
  'coverage',
  '.turbo',
  '.cache',
]);

// Supported file extensions
const SUPPORTED_EXTENSIONS: Record<string, Language> = {
  '.ts': 'ts',
  '.tsx': 'tsx',
  '.js': 'js',
  '.jsx': 'jsx',
};

/**
 * Recursively walk `dirPath`, collecting all supported source files.
 * Populates `skipped` map with reasons for excluded files.
 */
async function walkDirectory(
  dirPath: string,
  skipped: Map<string, number>,
): Promise<string[]> {
  const results: string[] = [];

  async function walk(current: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      // Unreadable directory — skip silently
      return;
    }

    // Sort entries for determinism
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) {
          const reason =
            entry.name === 'node_modules'
              ? 'node_modules'
              : 'build-dir';
          skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
          continue;
        }
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (!(ext in SUPPORTED_EXTENSIONS)) {
        const reason = 'unsupported-lang';
        skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
        continue;
      }

      results.push(fullPath);
    }
  }

  await walk(dirPath);
  return results;
}

/**
 * Given a SourceFile, extract all import/export specifiers together with
 * their types and whether the file is purely re-exporting.
 */
type RawEdge = {
  specifier: string;
  edgeType: 'import' | 'dynamic';
};

type ExtractResult = {
  rawEdges: RawEdge[];
  hasOnlyReExports: boolean;
  hasParseError: boolean;
};

function extractImports(sourceFile: SourceFile): ExtractResult {
  const rawEdges: RawEdge[] = [];
  let hasNonReExport = false;
  let hasParseError = false;

  try {
    // 1. ES static imports: import X from '...'
    for (const decl of sourceFile.getImportDeclarations()) {
      const specifier = decl.getModuleSpecifierValue();
      rawEdges.push({ specifier, edgeType: 'import' });
      hasNonReExport = true; // imports are not re-exports
    }

    // 2. Export declarations with a module specifier: export { X } from '...' / export * from '...'
    for (const decl of sourceFile.getExportDeclarations()) {
      const specifier = decl.getModuleSpecifierValue();
      if (specifier !== undefined) {
        rawEdges.push({ specifier, edgeType: 'import' });
        // Re-export — does not count as non-re-export content
      } else {
        // `export { localThing }` — no module specifier → not a re-export
        hasNonReExport = true;
      }
    }

    // 3. CommonJS require() and dynamic import() via call expressions
    sourceFile.forEachDescendant((node) => {
      if (node.getKind() === SyntaxKind.CallExpression) {
        const call = node.asKindOrThrow(SyntaxKind.CallExpression);
        const expr = call.getExpression();
        const args = call.getArguments();
        const firstArg = args[0];

        // require('...')
        if (
          expr.getKind() === SyntaxKind.Identifier &&
          expr.getText() === 'require' &&
          firstArg !== undefined &&
          firstArg.getKind() === SyntaxKind.StringLiteral
        ) {
          const specifier = firstArg
            .asKindOrThrow(SyntaxKind.StringLiteral)
            .getLiteralValue();
          rawEdges.push({ specifier, edgeType: 'import' });
          hasNonReExport = true;
        }

        // import('...')
        if (
          expr.getKind() === SyntaxKind.ImportKeyword &&
          firstArg !== undefined &&
          firstArg.getKind() === SyntaxKind.StringLiteral
        ) {
          const specifier = firstArg
            .asKindOrThrow(SyntaxKind.StringLiteral)
            .getLiteralValue();
          rawEdges.push({ specifier, edgeType: 'dynamic' });
          hasNonReExport = true;
        }
      }
    });

    // Check for any other top-level non-export statements
    for (const stmt of sourceFile.getStatements()) {
      const kind = stmt.getKind();
      if (
        kind !== SyntaxKind.ImportDeclaration &&
        kind !== SyntaxKind.ExportDeclaration &&
        kind !== SyntaxKind.ExportAssignment
      ) {
        hasNonReExport = true;
        break;
      }
    }
  } catch {
    hasParseError = true;
  }

  // A barrel has only re-exports (no import declarations, no non-export statements)
  // We define hasOnlyReExports = no imports and no non-reexport content,
  // but the file must have at least one export
  const hasOnlyReExports = !hasNonReExport && rawEdges.length > 0;

  return { rawEdges, hasOnlyReExports, hasParseError };
}

/**
 * Main entry point.
 * Walks `dirPath`, parses every source file, and returns a ParserResult.
 */
export async function parseRepository(dirPath: string): Promise<ParserResult> {
  const absRoot = path.resolve(dirPath);

  // Coverage counters
  const skipReasons = new Map<string, number>();
  let parsedCount = 0;

  // 1. Walk the directory
  const absolutePaths = await walkDirectory(absRoot, skipReasons);

  // 2. Load tsconfig path aliases
  let aliases: PathAliases;
  try {
    aliases = await loadPathAliases(absRoot);
  } catch {
    aliases = new Map();
  }

  // 3. Set up ts-morph project (skipAddingFilesFromTsConfig to stay standalone)
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: {
      allowJs: true,
      jsx: 2, // react
      strict: false,
    },
  });

  // Add all found files
  for (const absPath of absolutePaths) {
    try {
      project.addSourceFileAtPath(absPath);
    } catch {
      // File couldn't be added — count as parse error
      skipReasons.set('parse-error', (skipReasons.get('parse-error') ?? 0) + 1);
    }
  }

  const repoFiles: RepoFile[] = [];
  const edges: Edge[] = [];

  // 4. Parse each file
  for (const absPath of absolutePaths) {
    const sourceFile: SourceFile | undefined = project.getSourceFile(absPath);
    if (sourceFile === undefined) {
      // Was skipped during add
      continue;
    }

    const relPath = path.relative(absRoot, absPath);
    const ext = path.extname(absPath).toLowerCase();
    const language = SUPPORTED_EXTENSIONS[ext] ?? 'ts';

    // Extract imports
    const { rawEdges, hasOnlyReExports, hasParseError } =
      extractImports(sourceFile);

    if (hasParseError) {
      skipReasons.set('parse-error', (skipReasons.get('parse-error') ?? 0) + 1);
      // Still include the file in results, but with empty edges
    }

    parsedCount++;

    const isBarrel = detectBarrel(path.basename(absPath), hasOnlyReExports);

    repoFiles.push({
      path: relPath,
      kind: 'other', // Phase 2 Task 3 adapter will override
      language,
      isBarrel,
    });

    // 5. Resolve each raw edge
    for (const { specifier, edgeType } of rawEdges) {
      const result = await resolveImport(specifier, absPath, absRoot, aliases);

      switch (result.kind) {
        case 'resolved': {
          const toRel = path.relative(absRoot, result.absPath);
          edges.push({
            from: relPath,
            to: toRel,
            type: edgeType,
          });
          break;
        }
        case 'external': {
          edges.push({
            from: relPath,
            to: null,
            type: 'unresolved',
            reason: 'external',
          });
          break;
        }
        case 'not-found': {
          edges.push({
            from: relPath,
            to: null,
            type: 'unresolved',
            reason: 'not-found',
          });
          break;
        }
      }
    }
  }

  // 6. Count total skipped files (each skip-dir entry = 1 skipped item,
  //    unsupported-lang and parse-error are already file counts)
  let skippedCount = 0;
  for (const count of skipReasons.values()) {
    skippedCount += count;
  }

  const coverage: Coverage = {
    parsed: parsedCount,
    skipped: skippedCount,
    reasons: skipReasons,
  };

  return { files: repoFiles, edges, coverage };
}
