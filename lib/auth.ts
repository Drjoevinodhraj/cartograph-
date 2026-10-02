import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Auth helpers for Cartograph.
 *
 * These functions extract authentication state from Clerk and enforce access rules.
 * They are server-side only and should only be called from API routes or server components.
 *
 * Decision: Use Clerk's auth() to get the current session, not a database lookup.
 * - Clerk is the source of truth for the user's identity.
 * - The database stores membership data (which orgs a user belongs to) via RLS policies.
 * - Server code asks "who am I?" (Clerk) and then queries data they can see (RLS).
 */

/**
 * Get the current Clerk user ID from the session.
 *
 * Returns the userId if authenticated, or null if no session.
 */
export async function getCurrentUser(): Promise<string | null> {
  const session = await auth();
  return session.userId ?? null;
}

/**
 * Require the current user to be authenticated.
 *
 * Returns the Clerk user ID if authenticated.
 * Throws an error with status 401 if not authenticated.
 *
 * Use this in API routes that require a logged-in user.
 * Example:
 *   const userId = await requireAuth();
 *   // userId is guaranteed to be non-null
 */
export async function requireAuth(): Promise<string> {
  const userId = await getCurrentUser();

  if (!userId) {
    const error = new Error("Unauthorized");
    // This error should be caught by the API route and returned as a 401 response.
    Object.assign(error, { status: 401 });
    throw error;
  }

  return userId;
}

/**
 * Verify that the current user belongs to an organization.
 *
 * Returns the Clerk user ID if the user is a member of the organization.
 * Throws an error with status 403 if the user is not a member.
 *
 * Decision: Query the database to verify membership, not trust Clerk alone.
 * - Why: Clerk's organization ID is in the JWT, but we need to confirm the user is actually a member
 *   in our database (organization_members table). The database is the source of truth for membership.
 * - The RLS policy will prevent querying data from other organizations, but an API route
 *   might need explicit verification that the user can mutate a specific org's data.
 * - This is a secondary check; the primary security is RLS at the database layer.
 *
 * Use this in API routes that mutate organization-scoped resources:
 *   const userId = await requireOrganization(orgId);
 *   // User is confirmed to belong to orgId
 *
 * @param orgId - The organization ID to verify membership in.
 * @returns The user ID if membership is confirmed.
 * @throws 403 Forbidden if the user is not a member of the organization.
 */
export async function requireOrganization(
  orgId: string
): Promise<string> {
  const userId = await requireAuth();

  // Create a server Supabase client using the service role key.
  // The service role key is read from the environment and should be kept secure.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );

  // Query the organization_members table to check if the user belongs to this organization.
  // We use the service role key, which bypasses RLS, so we can check membership explicitly.
  const { data, error } = await supabase
    .from("organization_members")
    .select("*")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .single();

  // If the query errors or returns no data, the user is not a member.
  if (error || !data) {
    const forbiddenError = new Error(
      `Forbidden: user ${userId} is not a member of organization ${orgId}`
    );
    Object.assign(forbiddenError, { status: 403 });
    throw forbiddenError;
  }

  return userId;
}
