# Phase 1: Database Schema, Authentication, and Organization Setup

## Goal
Establish the data foundation and user authentication layer for Cartograph. Users will be able to sign in via Clerk and have their analyses organized by team/organization. Database access is controlled by row-level security policies, not application code.

## Acceptance Criteria
1. Clerk authentication is integrated and working
2. Supabase database is initialized with schema and RLS policies
3. Signing in from a different organization hides the first organization's data at the query level (not just UI)
4. All tables have RLS enabled by default with explicit policies
5. The app builds with zero TypeScript errors
6. Database migrations are committed and documented

## Architecture

### Database Layer
The schema enforces organization-level data isolation through RLS policies. Every table belongs to an organization, and access decisions are made by Postgres policies, not application code.

**Tables:**
- `organizations` - teams/workspaces
- `organization_members` - user membership with roles (owner, admin, member)
- `repositories` - GitHub repositories analyzed (belongs to organization)
- `analysis_results` - parsed file structure, imports, edges (belongs to repository)
- `cache_hits` - OpenAI API cache for explanations
- `audit_logs` - immutable record of all mutations

**Constraints:**
- Every row has an `organization_id` foreign key
- RLS policies enforce organization isolation: users see only data from organizations they belong to
- `audit_logs` is append-only (no UPDATE/DELETE policies)
- Clerk user IDs (UUID format) are synced to the database, never transformed

### Authentication Layer
- Clerk handles sign-in (GitHub, Google, email)
- User organization membership comes from Clerk's organization feature
- The database trusts the organization claim in the JWT token
- No runtime queries to Clerk; the token is the source of truth

### API Layer (later)
- Server-side routes for mutations (create analysis, update cache, etc.)
- Client-side code queries through RLS - no additional permission checks needed
- Every mutation is logged to audit_logs with action and timestamp

## Tech Decisions

**Clerk + Supabase RLS instead of role-based auth in code:**
- Why: A policy at the database layer is enforced everywhere. Application code can't accidentally expose data.
- Trade-off: Queries must be written to trust the RLS policy. We don't add WHERE clauses for security; we add them for performance.

**One organization per Clerk organization, not multiple:**
- Why: Simpler mental model. A Cartograph "team" = a Clerk organization.
- Trade-off: If a user wants analyses across multiple teams, they switch organizations in Clerk, not within Cartograph.

**Clerk webhooks to sync users (later phase):**
- Why: The database keeps a denormalized copy of user identity (name, email, avatar) so we can show it in the UI without querying Clerk at runtime.
- This happens in a separate phase after auth is confirmed working.

## Files to Create

- `supabase/migrations/001_initial_schema.sql` - tables, RLS policies, indexes
- `lib/supabase/schema-types.ts` - TypeScript types matching the schema
- `lib/auth.ts` - helpers: `getCurrentUser()`, `requireAuth()`, `verifyOrganization()`
- `middleware.ts` - Clerk middleware to protect routes
- `.env.local` - Clerk and Supabase credentials (not committed)

## Steps

### Step 1: Install Dependencies and Connect Supabase
- [ ] Install `@supabase/supabase-js` and `@supabase/ssr` (client and server clients)
- [ ] Install `@clerk/nextjs` and `@clerk/backend` (authentication)
- [ ] Create/configure a Supabase project (or reuse existing)
- [ ] Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` to `.env.local`
- [ ] Verify both services are reachable from the app

### Step 2: Write Database Schema with RLS Policies
- [ ] Create `supabase/migrations/001_initial_schema.sql`
  - `organizations` table (id, name, created_at)
  - `organization_members` table (id, organization_id, user_id, role, created_at)
  - `repositories` table (id, organization_id, url, last_analyzed, created_at)
  - `analysis_results` table (id, repository_id, file_list, edge_list, coverage, created_at)
  - `cache_hits` table (id, organization_id, query_hash, response, created_at) - for OpenAI cache
  - `audit_logs` table (id, organization_id, action, resource_type, resource_id, user_id, created_at)
- [ ] Enable RLS on all tables
- [ ] Write policies:
  - Users can read `organizations` they belong to
  - Users can read members of their organizations
  - Users can read `repositories` owned by their organizations
  - Users can read `analysis_results` from their repositories
  - Users can read `cache_hits` from their organizations
  - `audit_logs` is read-only for users in the organization (append-only, no mutations)
- [ ] Create indexes on `organization_id`, `repository_id`, `user_id` for query performance
- [ ] Add constraints: `organization_members.role` is 'owner'|'admin'|'member', `audit_logs.action` is 'create'|'update'|'delete'|'analyze'

### Step 3: Create TypeScript Types
- [ ] Create `lib/supabase/schema-types.ts`
  - Export types for each table: `Organization`, `OrganizationMember`, `Repository`, `AnalysisResult`, `CacheHit`, `AuditLog`
  - Types match the schema exactly (column names, types, constraints)

### Step 4: Set Up Clerk Middleware
- [ ] Create `middleware.ts` in project root
  - Protect all app routes (except public sign-in/sign-up)
  - Use Clerk's `authMiddleware` or equivalent
- [ ] Verify that accessing protected routes without auth redirects to sign-in

### Step 5: Create Auth Helpers
- [ ] Create `lib/auth.ts`
  - `getCurrentUser()` - returns Clerk userId or null
  - `requireAuth()` - throws if not authenticated
  - `verifyOrganization(orgId)` - throws if user doesn't belong to the organization
  - These helpers are used in API routes to enforce ownership

### Step 6: Push Schema to Supabase and Verify
- [ ] Run `supabase db push` to apply migrations to the Supabase project
- [ ] In Supabase SQL editor, manually verify:
  - Tables exist with correct columns
  - RLS is enabled on all tables
  - Policies are defined and correct
  - A test insert into `organizations` succeeds
  - Querying as a different user returns empty results (RLS enforced)

### Step 7: Build and Commit
- [ ] `npm run build` or `pnpm build` - must complete with zero TypeScript errors
- [ ] `git add . && git commit -m "feat: database schema with RLS policies and auth setup"`

## Notes

- The Supabase project referenced in .env.local can be new or reused from the agent engine project. This phase doesn't care which; it just needs credentials.
- Clerk can be new or reused. Same principle.
- Don't build API routes yet. This phase is only the schema and auth foundation.
- The migration file is source truth for the schema. If changes are needed later, create a new migration file, never edit the first one.
- RLS policy syntax is Postgres SQL. Test them in the Supabase SQL editor before considering them done.
