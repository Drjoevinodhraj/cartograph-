/**
 * app/api/analyses/[id]/explain/route.ts
 *
 * POST /api/analyses/[id]/explain — Request an AI-generated explanation for a file.
 *
 * Auth: Clerk session via requireAuth().
 * Security: Service-role client with explicit org membership check (same as GET /api/analyses/[id]).
 *
 * The route:
 *   1. Authenticates the user.
 *   2. Parses the request body for { filePath: string }.
 *   3. Fetches the analysis row from Supabase (joined to repositories for org check).
 *   4. Verifies org membership — 403 if the user doesn't belong to this analysis's org.
 *   5. Checks the cache_hits table so we don't re-call OpenAI for the same file.
 *   6. Extracts neighbors (fan-in / fan-out) from the edge_list.
 *   7. Resolves the file kind from the file_list.
 *   8. Calls OpenAI with a structured prompt.
 *   9. Caches the explanation in cache_hits.
 *  10. Returns { file, explanation }.
 *
 * Decision: One place constructs the AI client (as required by CLAUDE.md). No singleton is
 * exported; the client is created inside the handler. Tracing (LangSmith) can be layered in
 * later without changing this file's surface area.
 */

import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";
import OpenAI from "openai";
import crypto from "crypto";

import { requireAuth } from "@/lib/auth";
import type { Edge, File as ParsedFile, FileKind } from "@/lib/parser/index";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface AnalysisRow {
  id: string;
  file_list: unknown;
  edge_list: unknown;
  repositories: { organization_id: string } | Array<{ organization_id: string }>;
}

interface Neighbors {
  imports: string[];      // files this file imports (fan-out)
  importedBy: string[];   // files that import this file (fan-in)
}

interface ExplainResponse {
  file: string;
  explanation: string;
}

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
      "Supabase environment variables are not configured " +
        "(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)"
    );
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

/** Get the current user's active organization ID from Clerk. */
async function getOrgId(): Promise<string | null> {
  const session = await auth();
  return session.orgId ?? null;
}

/**
 * Extract neighbors for a file from the edge list.
 * Fan-out: edges where from === filePath (what this file imports).
 * Fan-in:  edges where to   === filePath (what imports this file).
 * Limits each direction to 10 entries to keep the prompt focused.
 */
export function extractNeighbors(edges: Edge[], filePath: string): Neighbors {
  const MAX = 10;

  const imports: string[] = [];
  const importedBy: string[] = [];

  for (const edge of edges) {
    if (edge.from === filePath && edge.to !== null) {
      if (imports.length < MAX) imports.push(edge.to);
    } else if (edge.to === filePath) {
      if (importedBy.length < MAX) importedBy.push(edge.from);
    }
  }

  return {
    imports: [...new Set(imports)],
    importedBy: [...new Set(importedBy)],
  };
}

/**
 * Resolve the file kind for a given path from the file list.
 * Returns 'other' if the file is not found.
 */
function resolveFileKind(files: ParsedFile[], filePath: string): FileKind {
  const entry = files.find((f) => f.path === filePath);
  return entry?.kind ?? "other";
}

/**
 * Hash a file path for use as a cache key.
 * SHA-256 hex, truncated to 64 chars (more than enough uniqueness for a path).
 */
export function hashFilePath(path: string): string {
  return crypto.createHash("sha256").update(path).digest("hex");
}

/**
 * Build the prompt sent to OpenAI.
 * Keeps the prompt factual: we describe what the parser found, not what we think the code does.
 */
function buildPrompt(
  filePath: string,
  neighbors: Neighbors,
  kind: FileKind
): string {
  const importsList =
    neighbors.imports.length > 0
      ? neighbors.imports.map((p) => `  - ${p}`).join("\n")
      : "  (none)";

  const importedByList =
    neighbors.importedBy.length > 0
      ? neighbors.importedBy.map((p) => `  - ${p}`).join("\n")
      : "  (none)";

  return [
    `File: ${filePath}`,
    `Kind: ${kind}`,
    "",
    "Imports (this file depends on):",
    importsList,
    "",
    "Imported by (other files depend on this):",
    importedByList,
    "",
    "Based solely on the information above, explain what this file does and",
    "describe its role in the codebase. Be concise and specific. Do not invent",
    "details that are not derivable from the file path and its import relationships.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// POST /api/analyses/[id]/explain
// ---------------------------------------------------------------------------

/**
 * Request an AI-generated explanation for a file in the given analysis.
 *
 * Body: { filePath: string }
 *
 * Returns 200 with { file: string, explanation: string }.
 * Returns 400 if filePath is missing or the file is not in the analysis.
 * Returns 401 if not authenticated.
 * Returns 403 if the user does not belong to the analysis's organization.
 * Returns 404 if the analysis does not exist.
 * Returns 500 on unexpected errors (including OpenAI failures).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    // 1. Authenticate
    await requireAuth();

    // 2. Parse request body
    let filePath: string;
    try {
      const body = (await request.json()) as Record<string, unknown>;
      if (typeof body.filePath !== "string" || body.filePath.trim() === "") {
        return Response.json(
          { error: "Missing or empty filePath in request body" },
          { status: 400 }
        );
      }
      filePath = body.filePath.trim();
    } catch {
      return Response.json(
        { error: "Request body must be valid JSON with a filePath field" },
        { status: 400 }
      );
    }

    // 3. Fetch the analysis
    const { id } = await params;

    const supabase = makeSupabaseClient();

    const { data: analysisData, error: fetchError } = await supabase
      .from("analysis_results")
      .select(
        "id, file_list, edge_list, repositories!inner(organization_id)"
      )
      .eq("id", id)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return Response.json({ error: "Analysis not found" }, { status: 404 });
      }
      console.error("[POST /explain] Supabase fetch error:", fetchError);
      return Response.json({ error: "Failed to fetch analysis" }, { status: 500 });
    }

    if (!analysisData) {
      return Response.json({ error: "Analysis not found" }, { status: 404 });
    }

    const analysis = analysisData as unknown as AnalysisRow;

    // 4. Verify org membership (same pattern as GET /api/analyses/[id])
    const repoData = Array.isArray(analysis.repositories)
      ? analysis.repositories[0]
      : analysis.repositories;
    const analysisOrgId = repoData?.organization_id;

    const userOrgId = await getOrgId();

    if (!userOrgId || userOrgId !== analysisOrgId) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    // 5. Parse file_list and edge_list
    const rawFiles = Array.isArray(analysis.file_list) ? analysis.file_list : [];
    const rawEdges = Array.isArray(analysis.edge_list) ? analysis.edge_list : [];

    const files = rawFiles as ParsedFile[];
    const edges = rawEdges as Edge[];

    // 6. Verify the file exists in the analysis
    const fileExists = files.some((f) => f.path === filePath);
    if (!fileExists) {
      return Response.json(
        { error: `File not found in analysis: ${filePath}` },
        { status: 400 }
      );
    }

    // 7. Check the cache before calling OpenAI
    const queryHash = hashFilePath(filePath);

    const { data: cachedRow } = await supabase
      .from("cache_hits")
      .select("response")
      .eq("organization_id", analysisOrgId)
      .eq("query_hash", queryHash)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (cachedRow) {
      const cached = cachedRow.response as Record<string, unknown>;
      if (
        typeof cached.file === "string" &&
        typeof cached.explanation === "string"
      ) {
        return Response.json(
          { file: cached.file, explanation: cached.explanation } satisfies ExplainResponse,
          { status: 200 }
        );
      }
    }

    // 8. Extract neighbors and file kind
    const neighbors = extractNeighbors(edges, filePath);
    const kind = resolveFileKind(files, filePath);

    // 9. Call OpenAI
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      console.error("[POST /explain] OPENAI_API_KEY is not configured");
      return Response.json(
        { error: "OpenAI API key is not configured" },
        { status: 500 }
      );
    }

    const openai = new OpenAI({ apiKey: openaiApiKey });

    let explanation: string;
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "user",
            content: buildPrompt(filePath, neighbors, kind),
          },
        ],
        temperature: 0.7,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error("OpenAI returned an empty response");
      }
      explanation = content;
    } catch (err) {
      console.error("[POST /explain] OpenAI API error:", err);
      return Response.json(
        { error: "Failed to generate explanation" },
        { status: 500 }
      );
    }

    // 10. Cache the result
    const { error: cacheError } = await supabase.from("cache_hits").insert({
      organization_id: analysisOrgId,
      query_hash: queryHash,
      response: { file: filePath, explanation },
    });

    if (cacheError) {
      // Cache write failure is non-fatal — log and continue.
      console.warn("[POST /explain] Cache write failed:", cacheError);
    }

    // 11. Return the explanation
    return Response.json(
      { file: filePath, explanation } satisfies ExplainResponse,
      { status: 200 }
    );
  } catch (err) {
    if (err instanceof Error) {
      const status = (err as Error & { status?: number }).status;
      if (status === 401) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    console.error("[POST /api/analyses/[id]/explain]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
