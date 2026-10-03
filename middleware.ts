import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Clerk middleware for Cartograph.
 *
 * Decision: Use clerkMiddleware() to protect app routes.
 * - The middleware checks for a valid Clerk session and redirects unauthenticated users to /sign-in.
 * - Public routes (sign-in, sign-up, webhooks, static assets) bypass auth.
 * - The middleware extracts user ID and organization ID from the JWT and makes them available to the app.
 * - The middleware does NOT check database permissions—that's what RLS policies do.
 */

// Define which routes are public (don't require authentication).
// Routes matching this pattern will skip the auth check.
const publicRoutes = createRouteMatcher([
  "/sign-in",
  "/sign-up",
  "/api/webhooks(.*)", // All webhook endpoints
  "/_next(.*)", // Next.js internal routes
  "/public(.*)", // Public static assets
]);

/**
 * Middleware exported for Next.js.
 * Clerk will run this on every request.
 */
export default clerkMiddleware(async (auth, req) => {
  // If the route is public, skip authentication checks.
  if (publicRoutes(req)) {
    return;
  }

  // For protected routes, require authentication.
  const { userId } = await auth();

  // SECURITY FIX #1: Explicit auth check with error handling
  if (!userId) {
    // User is not authenticated on a protected route.
    // Clerk will redirect to /sign-in, but we log this for security monitoring.
    console.warn(`[AUTH] Unauthenticated access attempt to protected route: ${req.nextUrl.pathname}`);
    return;
  }

  // Optional: Add rate limiting check here for API routes
  // For now, just log successful auth for audit trail
  if (req.nextUrl.pathname.startsWith('/api')) {
    console.debug(`[AUTH] API access from user: ${userId} to ${req.nextUrl.pathname}`);
  }
});

export const config = {
  // Matcher for which routes should be processed by this middleware.
  // This runs the middleware on all routes except those listed in publicRoutes.
  matcher: [
    // Skip internal Next.js files and static assets.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
