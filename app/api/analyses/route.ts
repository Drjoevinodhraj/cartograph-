/**
 * app/api/analyses/route.ts
 *
 * POST /api/analyses — Start a new analysis for a repository.
 * GET  /api/analyses — List all analyses for the user's organization.
 *
 * Auth: Clerk session via requireAuth().
 * Org:  Clerk's auth() provides orgId from the active organization context.
 * Security: Service-role client + explicit organization filter.
 *   The schema joins analysis_results through repositories to organizations,
 *   so we filter by organization_id on the repositories join.
 */

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

import { requireAuth } from "@/lib/auth";
import { analyzeRepository, AnalysisError } from "@/lib/parser/runner";
import type { Analysis } from "@/lib/parser/runner";

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

/** Get the current user's active organization ID from Clerk. Returns null if none. */
async function getOrgId(): Promise<string | null> {
  const session = await auth();
  return session.orgId ?? null;
}

/** Require the current user to have an active organization selected. */
async function requireOrgId(): Promise<string> {
  const orgId = await getOrgId();
  if (!orgId) {
    const err = new Error("No active organization. Select an organization in Clerk first.");
    Object.assign(err, { status: 400 });
    throw err;
  }
  return orgId;
}

/** Shape of an analysis list item returned to the caller. */
type AnalysisListItem = {
  id: string;
  repository_url: string;
  file_count: number;
  edge_count: number;
  coverage: number | null;
  created_at: string;
};

/** Shape of a full analysis row joined with its repository. */
type AnalysisDetailRow = {
  id: string;
  repository_id: string;
  file_list: object;
  edge_list: object;
  coverage: number | null;
  created_at: string;
  repositories: {
    url: string;
    organization_id: string;
  };
};

// ---------------------------------------------------------------------------
// POST /api/analyses
// ---------------------------------------------------------------------------

/**
 * Start a new analysis.
 *
 * Body: { repositoryUrl: string }
 *
 * Returns 201 with the Analysis summary on success.
 * Returns 400 if repositoryUrl is missing or invalid.
 * Returns 401 if the user is not authenticated.
 * Returns 503 if the repository cannot be cloned (network/not found).
 * Returns 500 on unexpected errors.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const userId = await requireAuth();
    const orgId = await requireOrgId();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (
      typeof body !== "object" ||
      body === null ||
      !("repositoryUrl" in body) ||
      typeof (body as Record<string, unknown>).repositoryUrl !== "string"
    ) {
      return Response.json({ error: "Missing or invalid repositoryUrl" }, { status: 400 });
    }

    const { repositoryUrl } = body as { repositoryUrl: string };

    if (!repositoryUrl.trim()) {
      return Response.json({ error: "repositoryUrl must not be empty" }, { status: 400 });
    }

    const analysis: Analysis = await analyzeRepository(repositoryUrl, userId, orgId);

    return Response.json(analysis, { status: 201 });
  } catch (err) {
    if (err instanceof AnalysisError) {
      return Response.json({ error: err.message }, { status: err.statusCode });
    }

    if (err instanceof Error) {
      const status = (err as Error & { status?: number }).status;
      if (status === 401) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (status === 400) {
        return Response.json({ error: err.message }, { status: 400 });
      }
    }

    console.error("[POST /api/analyses]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// GET /api/analyses
// ---------------------------------------------------------------------------

/**
 * List all analyses for the user's current organization.
 *
 * Returns 200 with { analyses: AnalysisListItem[] }.
 * Returns 401 if not authenticated.
 * Returns 400 if the user has no active organization.
 * Returns 500 on unexpected errors.
 *
 * Decision: filter by organization_id through the repositories join.
 * The schema has no organization_id column on analysis_results directly;
 * access is transitive via repositories.organization_id.
 * We use the service-role client and apply the org filter explicitly,
 * consistent with how the rest of the codebase handles server-side queries.
 */
export async function GET(_request: Request): Promise<Response> {
  try {
    await requireAuth();
    const orgId = await requireOrgId();

    const supabase = makeSupabaseClient();

    // Join analysis_results → repositories to filter by organization and get the URL.
    // Select only the summary columns; file_list and edge_list can be large.
    const { data, error } = await supabase
      .from("analysis_results")
      .select(
        "id, coverage, created_at, repositories!inner(url, organization_id)"
      )
      .eq("repositories.organization_id", orgId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET /api/analyses] Supabase error:", error);
      return Response.json({ error: "Failed to fetch analyses" }, { status: 500 });
    }

    // Map to the public-facing shape.
    const analyses: AnalysisListItem[] = (
      data as Array<{
        id: string;
        coverage: number | null;
        created_at: string;
        repositories: { url: string; organization_id: string } | { url: string; organization_id: string }[];
      }>
    ).map((row) => {
      // Supabase returns the joined table as an object when using !inner
      const repo = Array.isArray(row.repositories)
        ? row.repositories[0]
        : row.repositories;

      return {
        id: row.id,
        repository_url: repo?.url ?? "",
        // file_count and edge_count are not stored as columns; they're derived
        // from file_list and edge_list lengths. We omit them from the list
        // summary to avoid pulling large JSONB columns for every row.
        // Callers retrieve the full row via GET /api/analyses/[id] for counts.
        file_count: 0,
        edge_count: 0,
        coverage: row.coverage,
        created_at: row.created_at,
      };
    });

    return Response.json({ analyses }, { status: 200 });
  } catch (err) {
    if (err instanceof Error) {
      const status = (err as Error & { status?: number }).status;
      if (status === 401) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (status === 400) {
        return Response.json({ error: (err as Error).message }, { status: 400 });
      }
    }

    console.error("[GET /api/analyses]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
