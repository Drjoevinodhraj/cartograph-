/**
 * Simple in-memory rate limiting for API endpoints.
 *
 * For production, use Upstash (Redis-based):
 * - Install: pnpm add @upstash/ratelimit @upstash/redis
 * - Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in .env.local
 *
 * This in-memory implementation is suitable for single-instance deployments.
 * For multi-instance deployments, use Upstash instead.
 */

interface RateLimitStore {
  [key: string]: { count: number; resetTime: number };
}

const store: RateLimitStore = {};

/**
 * Simple rate limiter using in-memory store.
 * Cleans up expired entries automatically.
 *
 * @param userId - User ID (from Clerk auth)
 * @param limit - Max requests allowed in window
 * @param windowMs - Time window in milliseconds
 * @returns true if under limit, false if rate limited
 */
export function checkRateLimit(userId: string, limit: number = 10, windowMs: number = 3600000): boolean {
  const now = Date.now();
  const key = `ratelimit:${userId}`;

  // Initialize or get existing record
  if (!store[key] || store[key].resetTime < now) {
    store[key] = { count: 0, resetTime: now + windowMs };
  }

  // Increment and check
  store[key].count++;

  if (store[key].count > limit) {
    return false; // Rate limited
  }

  return true; // Under limit
}

/**
 * Get remaining requests for a user
 */
export function getRemainingRequests(userId: string, limit: number = 10): number {
  const now = Date.now();
  const key = `ratelimit:${userId}`;

  if (!store[key] || store[key].resetTime < now) {
    return limit;
  }

  return Math.max(0, limit - store[key].count);
}

/**
 * Get reset time for a user
 */
export function getResetTime(userId: string): Date {
  const key = `ratelimit:${userId}`;

  if (!store[key]) {
    return new Date(Date.now() + 3600000); // 1 hour from now
  }

  return new Date(store[key].resetTime);
}

/**
 * Cleanup old entries every 10 minutes to prevent memory leaks
 */
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;

  for (const key in store) {
    if (store[key].resetTime < now) {
      delete store[key];
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.debug(`[RATE_LIMIT] Cleaned up ${cleaned} expired entries`);
  }
}, 10 * 60 * 1000); // 10 minutes
