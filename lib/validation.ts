/**
 * Input validation utilities for API endpoints
 *
 * SECURITY FIX #5: Validate all user input
 */

/**
 * Validate file path format
 *
 * Rules:
 * - Non-empty
 * - Max 500 characters
 * - No null bytes or control characters
 * - No path traversal (..)
 * - Only alphanumeric, dots, slashes, brackets, @, hyphens
 *
 * Valid examples:
 * - src/components/Button.tsx
 * - lib/utils.ts
 * - @/hooks/useAnalysis.ts
 * - app/[id]/page.tsx
 *
 * Invalid examples:
 * - ../../../etc/passwd (path traversal)
 * - src/button\x00.tsx (null byte)
 * - very/long/path/repeated/many/times/...
 */
export function isValidFilePath(path: string): {
  valid: boolean;
  error?: string;
} {
  // Check length
  if (!path || path.length === 0) {
    return { valid: false, error: 'File path is required' };
  }

  if (path.length > 500) {
    return { valid: false, error: 'File path exceeds maximum length (500 characters)' };
  }

  // Check for null bytes
  if (path.includes('\0')) {
    return { valid: false, error: 'File path contains null bytes' };
  }

  // Check for path traversal
  if (path.includes('..') || path.includes('\\..')) {
    return { valid: false, error: 'File path contains path traversal' };
  }

  // Check for control characters
  for (let i = 0; i < path.length; i++) {
    const code = path.charCodeAt(i);
    if (code < 32 && code !== 9) { // Allow tab, disallow other control chars
      return { valid: false, error: 'File path contains invalid characters' };
    }
  }

  // Check for valid characters (alphanumeric, dots, slashes, brackets, @, hyphen)
  // Regex: allow common file path patterns including dynamic routes and path aliases
  const validPathRegex = /^[\w\-./\[\]@]+\.[\w]+$/;
  if (!validPathRegex.test(path)) {
    return { valid: false, error: 'File path contains invalid characters' };
  }

  return { valid: true };
}

/**
 * Validate analysis ID format (UUID)
 */
export function isValidUUID(id: string): {
  valid: boolean;
  error?: string;
} {
  if (!id || id.length === 0) {
    return { valid: false, error: 'ID is required' };
  }

  // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(id)) {
    return { valid: false, error: 'Invalid UUID format' };
  }

  return { valid: true };
}

/**
 * Validate repository URL format
 */
export function isValidRepoUrl(url: string): {
  valid: boolean;
  error?: string;
} {
  if (!url || url.length === 0) {
    return { valid: false, error: 'Repository URL is required' };
  }

  try {
    const parsed = new URL(url);

    // Check if it's a valid GitHub/GitLab URL
    const hostname = parsed.hostname;
    const validHosts = ['github.com', 'gitlab.com', 'bitbucket.org'];
    const isValidHost = validHosts.some((host) => hostname.includes(host));

    if (!isValidHost && !hostname.startsWith('github.') && !hostname.startsWith('gitlab.')) {
      return { valid: false, error: 'Repository must be from GitHub, GitLab, or Bitbucket' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}
