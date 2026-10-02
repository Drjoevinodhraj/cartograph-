/**
 * TypeScript types for Cartograph database schema.
 * These types match the Supabase schema exactly, including column names and types.
 * Database types, not application models. Use these in server code that queries the database.
 */

/**
 * Organization: a team or workspace.
 * Every row in other tables belongs to an organization via organization_id.
 */
export interface Organization {
  id: string; // UUID
  name: string;
  created_at: string; // ISO 8601 timestamp
}

/**
 * OrganizationMember: user membership in an organization with role-based access.
 * The RLS policy checks organization_members to determine if a user can read organization data.
 */
export interface OrganizationMember {
  id: string; // UUID
  organization_id: string; // UUID, foreign key to organizations(id)
  user_id: string; // Clerk user ID
  role: "owner" | "admin" | "member"; // Enum: enforced by database check constraint
  created_at: string; // ISO 8601 timestamp
}

/**
 * Repository: a GitHub repository analyzed within an organization.
 * Belongs to exactly one organization via organization_id.
 */
export interface Repository {
  id: string; // UUID
  organization_id: string; // UUID, foreign key to organizations(id)
  url: string; // GitHub repository URL
  last_analyzed: string | null; // ISO 8601 timestamp, nullable
  created_at: string; // ISO 8601 timestamp
}

/**
 * AnalysisResult: parsed file structure, imports, and edges from a repository analysis.
 * Belongs to exactly one repository via repository_id.
 */
export interface AnalysisResult {
  id: string; // UUID
  repository_id: string; // UUID, foreign key to repositories(id)
  file_list: object; // JSONB: array or object representing parsed files
  edge_list: object; // JSONB: array or object representing import edges
  coverage: number | null; // Numeric: percentage or ratio, nullable
  created_at: string; // ISO 8601 timestamp
}

/**
 * CacheHit: OpenAI API cache for explanations, shared within an organization.
 * Belongs to exactly one organization via organization_id.
 */
export interface CacheHit {
  id: string; // UUID
  organization_id: string; // UUID, foreign key to organizations(id)
  query_hash: string; // Hash of the query for cache lookup
  response: object; // JSONB: cached API response
  created_at: string; // ISO 8601 timestamp
}

/**
 * AuditLog: immutable record of mutations (append-only).
 * Records every create, update, delete, and analyze action for accountability.
 * Belongs to exactly one organization via organization_id.
 */
export interface AuditLog {
  id: string; // UUID
  organization_id: string; // UUID, foreign key to organizations(id)
  action: "create" | "update" | "delete" | "analyze"; // Enum: enforced by database check constraint
  resource_type: string; // Type of resource modified (e.g., "repository", "analysis_result")
  resource_id: string; // UUID of the modified resource
  user_id: string; // Clerk user ID who performed the action
  created_at: string; // ISO 8601 timestamp
}
