/**
 * lib/parser/adapters/next.ts
 *
 * Framework adapter for Next.js that identifies file kinds based on
 * Next.js directory and file naming conventions.
 *
 * This adapter uses Next.js-specific knowledge to classify files as:
 * - route: pages, layouts, API routes, special files in app directory
 * - component: files in components/ directory or uppercase filenames
 * - util: files in lib/ or utils/ directories
 * - config: configuration files
 * - other: everything else
 */

export type FileKind = 'component' | 'route' | 'util' | 'config' | 'other';

export interface FrameworkAdapter {
  identifyKind(filePath: string): FileKind;
}

/**
 * Creates a Next.js framework adapter.
 *
 * Applies Next.js-specific rules to identify file kinds based on paths and filenames.
 */
export function createNextJsAdapter(): FrameworkAdapter {
  return {
    identifyKind(filePath: string): FileKind {
      return identifyFileKind(filePath);
    },
  };
}

/**
 * Identifies the kind of a file based on Next.js conventions.
 *
 * Rules applied in order:
 * 1. Route files: app/pages.tsx, app/layout.tsx, app/route.ts,
 *    app/error.tsx, app/loading.tsx, app/not-found.tsx
 * 2. Component files: components files or uppercase filenames
 * 3. Util files: lib or utils directories
 * 4. Config files: tsconfig.json, next.config.ts, tailwind.config.ts, eslint.config
 * 5. Other: everything else
 *
 * param filePath - The relative file path from repository root
 * returns The identified FileKind
 */
function identifyFileKind(filePath: string): FileKind {
  const normalized = filePath.replace(/\\/g, '/');

  if (isRoute(normalized)) {
    return 'route';
  }

  if (isComponent(normalized)) {
    return 'component';
  }

  if (isUtil(normalized)) {
    return 'util';
  }

  if (isConfig(normalized)) {
    return 'config';
  }

  return 'other';
}

/**
 * Checks if a file path represents a Next.js route.
 *
 * Routes include:
 * - app/page.ts(x) - page files at any nesting level
 * - app/layout.ts(x) - layout files
 * - app/route.ts - API route handlers
 * - app/error.tsx - error boundary files
 * - app/loading.tsx - loading UI files
 * - app/not-found.tsx - not found pages
 */
function isRoute(normalized: string): boolean {
  if (!normalized.startsWith('app/')) {
    return false;
  }

  const fileName = getFileName(normalized);

  const routeFileNames = [
    'page.ts',
    'page.tsx',
    'layout.ts',
    'layout.tsx',
    'route.ts',
    'error.tsx',
    'loading.tsx',
    'not-found.tsx',
  ];

  return routeFileNames.includes(fileName);
}

/**
 * Checks if a file path represents a React component.
 *
 * Components include:
 * - Any file in components directory
 * - Files with uppercase first letter
 */
function isComponent(normalized: string): boolean {
  if (normalized.includes('/components/') || normalized.startsWith('components/')) {
    return true;
  }

  const fileName = getFileName(normalized);
  if (fileName.length > 0 && isUppercase(fileName[0])) {
    return true;
  }

  return false;
}

/**
 * Checks if a file path represents a utility or helper file.
 *
 * Utilities include:
 * - Any file in lib directory
 * - Any file in utils directory
 */
function isUtil(normalized: string): boolean {
  return (
    normalized.startsWith('lib/') ||
    normalized.includes('/lib/') ||
    normalized.startsWith('utils/') ||
    normalized.includes('/utils/')
  );
}

/**
 * Checks if a file path represents a configuration file.
 *
 * Config files include:
 * - tsconfig.json
 * - next.config.ts
 * - tailwind.config.ts
 * - eslint.config with any extension
 */
function isConfig(normalized: string): boolean {
  const fileName = getFileName(normalized);

  if (
    fileName === 'tsconfig.json' ||
    fileName === 'next.config.ts' ||
    fileName === 'tailwind.config.ts'
  ) {
    return true;
  }

  if (fileName.startsWith('eslint.config.')) {
    return true;
  }

  return false;
}

/**
 * Extracts the filename (with extension) from a file path.
 *
 * param filePath - The file path (forward slashes)
 * returns The filename with extension
 */
function getFileName(filePath: string): string {
  const parts = filePath.split('/');
  return parts[parts.length - 1];
}

/**
 * Checks if a character is uppercase.
 *
 * param char - A single character
 * returns True if the character is uppercase
 */
function isUppercase(char: string): boolean {
  return char === char.toUpperCase() && char !== char.toLowerCase();
}
