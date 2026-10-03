/**
 * app/api/analyses/[id]/route.ts
 *
 * GET /api/analyses/[id] — Retrieve a specific analysis by its UUID.
 *
 * Auth: Clerk session via requireAuth().
 * Security: Service-role client with explicit org membership check.
 *   After loading the row we verify the user's org matches the repo's org.
 *   This is belt-and-suspenders; in production the RLS policy on a user-context
 *   client would enforce the same constraint at the database layer.
 */

import { createClient } from "@supabase/supabase-js";

import { requireAuth } from "@/lib/auth";
import { auth } from "@clerk/nextjs/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a service-role Supabase client. Server-side only. */
function makeSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase environment variables are not configured (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)"
    );
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

/** Get the current user's active organization ID from Clerk. */
async function getOrgId(): Promise<string | null> {
  const session = await auth();
  return session.orgId ?? null;
}

// ---------------------------------------------------------------------------
// GET /api/analyses/[id]
// ---------------------------------------------------------------------------

/**
 * Retrieve a single analysis by its UUID.
 *
 * Returns 200 with the full analysis row (including file_list and edge_list).
 * Returns 401 if the user is not authenticated.
 * Returns 403 if the user does not belong to the analysis's organization.
 * Returns 404 if no analysis with this ID exists.
 * Returns 500 on unexpected errors.
 *
 * Decision: Load the analysis joined with its repository, then compare
 * repository.organization_id against the user's Clerk orgId.
 * This matches the RLS access path (user → org_members → repository → analysis)
 * without requiring a user-context JWT to be threaded through Supabase.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const userId = await requireAuth();
    const { id } = await params;

    if (!id) {
      return Response.json({ error: "Missing analysis ID" }, { status: 400 });
    }

    const supabase = makeSupabaseClient();

    // Fetch the analysis row with its parent repository for org verification.
    const { data, error } = await supabase
      .from("analysis_results")
      .select(
        "id, repository_id, file_list, edge_list, coverage, created_at, repositories!inner(url, organization_id)"
      )
      .eq("id", id)
      .single();

    if (error) {
      // PGRST116 = "The result contains 0 rows" (PostgREST not-found code)
      if (error.code === "PGRST116") {
        return Response.json({ error: "Analysis not found" }, { status: 404 });
      }
      console.error("[GET /api/analyses/[id]] Supabase error:", error);
      return Response.json({ error: "Failed to fetch analysis" }, { status: 500 });
    }

    if (!data) {
      return Response.json({ error: "Analysis not found" }, { status: 404 });
    }

    // Verify the requesting user belongs to the analysis's organization.
    const repo = Array.isArray(data.repositories)
      ? data.repositories[0]
      : data.repositories;
    const analysisOrgId = (repo as { url: string; organization_id: string } | undefined)?.organization_id;

    const userOrgId = await getOrgId();

    if (!userOrgId || userOrgId !== analysisOrgId) {
      // Do not reveal whether the resource exists to unauthorized callers.
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    // Return the full row. Derive file_count and edge_count from the JSONB arrays.
    const fileList = data.file_list as unknown[];
    const edgeList = data.edge_list as unknown[];

    return Response.json(
      {
        id: data.id as string,
        repository_id: data.repository_id as string,
        repository_url: (repo as { url: string } | undefined)?.url ?? "",
        organization_id: analysisOrgId ?? "",
        file_list: data.file_list,
        edge_list: data.edge_list,
        file_count: Array.isArray(fileList) ? fileList.length : 0,
        edge_count: Array.isArray(edgeList) ? edgeList.length : 0,
        coverage: data.coverage as number | null,
        created_at: data.created_at as string,
      },
      { status: 200 }
    );
  } catch (err) {
    if (err instanceof Error) {
      const status = (err as Error & { status?: number }).status;
      if (status === 401) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    console.error("[GET /api/analyses/[id]]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
