/**
 * lib/parser/resolve.ts
 *
 * Import resolution: relative paths, tsconfig path aliases, index barrel files.
 * Standalone: no Next.js, no database, no React imports.
 */

import * as fs from 'fs';
import * as path from 'path';

/** Parsed tsconfig path aliases: e.g. "@/*" -> ["./"] */
export type PathAliases = Map<string, string[]>;

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const INDEX_FILES = ['index.ts', 'index.tsx', 'index.js', 'index.jsx'];

/**
 * Read the tsconfig.json in repoRoot and extract compilerOptions.paths.
 * Returns an empty map if no tsconfig found or no paths configured.
 */
export async function loadPathAliases(repoRoot: string): Promise<PathAliases> {
  const tsconfigPath = path.join(repoRoot, 'tsconfig.json');
  const aliases: PathAliases = new Map();

  let raw: string;
  try {
    raw = await fs.promises.readFile(tsconfigPath, 'utf-8');
  } catch {
    return aliases; // no tsconfig — fine
  }

  let parsed: unknown;
  try {
    // Strip single-line comments for lenient JSON parsing
    const stripped = raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    parsed = JSON.parse(stripped);
  } catch {
    return aliases; // malformed tsconfig — skip
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('compilerOptions' in parsed)
  ) {
    return aliases;
  }

  const compilerOptions = (parsed as Record<string, unknown>).compilerOptions;
  if (
    typeof compilerOptions !== 'object' ||
    compilerOptions === null ||
    !('paths' in compilerOptions)
  ) {
    return aliases;
  }

  const pathsRaw = (compilerOptions as Record<string, unknown>).paths;
  if (typeof pathsRaw !== 'object' || pathsRaw === null) {
    return aliases;
  }

  for (const [alias, targets] of Object.entries(pathsRaw as Record<string, unknown>)) {
    if (!Array.isArray(targets)) continue;
    const resolved = targets.filter((t): t is string => typeof t === 'string');
    if (resolved.length > 0) {
      aliases.set(alias, resolved);
    }
  }

  return aliases;
}

/**
 * Check whether a file exists (sync-via-async-wrapper kept async for consistency).
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Given a specifier (the string inside an import) and the importing file path,
 * resolve the specifier to an absolute file path within the repo.
 *
 * Returns:
 *   { resolved: string }   — absolute path to the target file
 *   { external: true }     — node module / external package
 *   { notFound: true }     — could not resolve within the repo
 */
export type ResolveResult =
  | { kind: 'resolved'; absPath: string }
  | { kind: 'external' }
  | { kind: 'not-found' };

export async function resolveImport(
  specifier: string,
  importingFile: string,
  repoRoot: string,
  aliases: PathAliases,
): Promise<ResolveResult> {
  // 1. External (node module) — doesn't start with . or /
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
    // Check if it's a path alias
    const aliasMatch = matchPathAlias(specifier, aliases);
    if (aliasMatch === null) {
      return { kind: 'external' };
    }
    // Resolved via path alias
    const resolved = await tryResolveFilePath(
      path.join(repoRoot, aliasMatch),
      repoRoot,
    );
    if (resolved !== null) return { kind: 'resolved', absPath: resolved };
    return { kind: 'not-found' };
  }

  // 2. Relative import
  const base = path.resolve(path.dirname(importingFile), specifier);
  const resolved = await tryResolveFilePath(base, repoRoot);
  if (resolved !== null) return { kind: 'resolved', absPath: resolved };
  return { kind: 'not-found' };
}

/**
 * Try to find an actual file given a base path (which may or may not have an extension,
 * and may point to a directory with an index file).
 */
async function tryResolveFilePath(base: string, _repoRoot: string): Promise<string | null> {
  // 1. Already has a known extension and the file exists
  for (const ext of EXTENSIONS) {
    if (base.endsWith(ext) && (await fileExists(base))) {
      return base;
    }
  }

  // 2. Try appending known extensions
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (await fileExists(candidate)) return candidate;
  }

  // 3. Try as a directory with an index file
  for (const idx of INDEX_FILES) {
    const candidate = path.join(base, idx);
    if (await fileExists(candidate)) return candidate;
  }

  return null;
}

/**
 * Match a specifier against tsconfig path aliases.
 * Returns the first target path (with the glob wildcard replaced) or null.
 *
 * Example: alias "@/*" -> ["./*"], specifier "@/lib/foo"
 * → returns "./lib/foo"
 */
function matchPathAlias(specifier: string, aliases: PathAliases): string | null {
  for (const [pattern, targets] of aliases) {
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2); // strip /*
      if (specifier.startsWith(prefix + '/')) {
        const rest = specifier.slice(prefix.length + 1);
        const firstTarget = targets[0];
        if (firstTarget === undefined) continue;
        const targetBase = firstTarget.endsWith('/*')
          ? firstTarget.slice(0, -2)
          : firstTarget;
        return targetBase + '/' + rest;
      }
    } else if (pattern === specifier) {
      return targets[0] ?? null;
    }
  }
  return null;
}

/**
 * Determine if a file is a barrel file: an index file whose top-level statements
 * are exclusively `export { ... } from '...'` or `export * from '...'`.
 * Accepts a list of raw import/export specifiers collected by the parser.
 */
export function detectBarrel(
  fileName: string,
  hasOnlyReExports: boolean,
): boolean {
  const base = path.basename(fileName);
  const isIndex = INDEX_FILES.includes(base);
  return isIndex && hasOnlyReExports;
}
