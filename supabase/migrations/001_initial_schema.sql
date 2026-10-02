-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Organizations table: top-level teams/workspaces
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Organization members: user membership with role-based access
CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

-- Repositories: GitHub repos analyzed within an organization
CREATE TABLE repositories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  last_analyzed TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Analysis results: parsed file structure, imports, and edges
CREATE TABLE analysis_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  file_list JSONB NOT NULL,
  edge_list JSONB NOT NULL,
  coverage NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Cache hits: OpenAI API cache for explanations
CREATE TABLE cache_hits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  query_hash TEXT NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Audit logs: immutable record of mutations (append-only)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'analyze')),
  resource_type TEXT NOT NULL,
  resource_id UUID NOT NULL,
  user_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for query performance
-- organization_id is present on all org-scoped tables
CREATE INDEX idx_organization_members_org_id ON organization_members(organization_id);
CREATE INDEX idx_organization_members_user_id ON organization_members(user_id);
CREATE INDEX idx_repositories_org_id ON repositories(organization_id);
CREATE INDEX idx_analysis_results_repo_id ON analysis_results(repository_id);
CREATE INDEX idx_cache_hits_org_id ON cache_hits(organization_id);
CREATE INDEX idx_audit_logs_org_id ON audit_logs(organization_id);

-- Enable Row Level Security on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE cache_hits ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: users can read organizations they belong to
-- Decision: Join through organization_members to enforce organization-level isolation.
-- If a user is not a member, they cannot read the organization.
CREATE POLICY organizations_read ON organizations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organizations.id
      AND organization_members.user_id = auth.uid()::text
    )
  );

-- Policy: users cannot insert/update/delete organizations (handled via service role only)
CREATE POLICY organizations_prevent_write ON organizations
  FOR INSERT WITH CHECK (false);

CREATE POLICY organizations_prevent_update ON organizations
  FOR UPDATE USING (false);

CREATE POLICY organizations_prevent_delete ON organizations
  FOR DELETE USING (false);

-- Policy: users can read members of organizations they belong to
-- Decision: Users can only see the member list of organizations they're members of.
-- This allows viewing team composition without exposing organization membership to outsiders.
CREATE POLICY organization_members_read ON organization_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members AS om
      WHERE om.organization_id = organization_members.organization_id
      AND om.user_id = auth.uid()::text
    )
  );

-- Policy: users cannot modify organization members (handled via service role only)
CREATE POLICY organization_members_prevent_write ON organization_members
  FOR INSERT WITH CHECK (false);

CREATE POLICY organization_members_prevent_update ON organization_members
  FOR UPDATE USING (false);

CREATE POLICY organization_members_prevent_delete ON organization_members
  FOR DELETE USING (false);

-- Policy: users can read repositories in their organizations
-- Decision: A user can read a repository only if they belong to the organization
-- that owns the repository. This is enforced by checking organization_members.
-- No additional WHERE clause is added by application code.
CREATE POLICY repositories_read ON repositories
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = repositories.organization_id
      AND organization_members.user_id = auth.uid()::text
    )
  );

-- Policy: users cannot insert/update/delete repositories (handled via service role only)
CREATE POLICY repositories_prevent_write ON repositories
  FOR INSERT WITH CHECK (false);

CREATE POLICY repositories_prevent_update ON repositories
  FOR UPDATE USING (false);

CREATE POLICY repositories_prevent_delete ON repositories
  FOR DELETE USING (false);

-- Policy: users can read analysis results from repositories they have access to
-- Decision: A user can read analysis results only if they belong to the organization
-- that owns the repository. Access is transitive: user -> organization_members -> repository -> analysis_results.
CREATE POLICY analysis_results_read ON analysis_results
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM repositories
      INNER JOIN organization_members ON repositories.organization_id = organization_members.organization_id
      WHERE analysis_results.repository_id = repositories.id
      AND organization_members.user_id = auth.uid()::text
    )
  );

-- Policy: users cannot insert/update/delete analysis results (handled via service role only)
CREATE POLICY analysis_results_prevent_write ON analysis_results
  FOR INSERT WITH CHECK (false);

CREATE POLICY analysis_results_prevent_update ON analysis_results
  FOR UPDATE USING (false);

CREATE POLICY analysis_results_prevent_delete ON analysis_results
  FOR DELETE USING (false);

-- Policy: users can read cache hits from their organizations
-- Decision: A user can read cache hits only if they belong to the organization.
-- Cache is org-scoped so users in the same organization share cache entries.
CREATE POLICY cache_hits_read ON cache_hits
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = cache_hits.organization_id
      AND organization_members.user_id = auth.uid()::text
    )
  );

-- Policy: users cannot modify cache hits (handled via service role only)
CREATE POLICY cache_hits_prevent_write ON cache_hits
  FOR INSERT WITH CHECK (false);

CREATE POLICY cache_hits_prevent_update ON cache_hits
  FOR UPDATE USING (false);

CREATE POLICY cache_hits_prevent_delete ON cache_hits
  FOR DELETE USING (false);

-- Policy: users can read audit logs from their organizations (read-only append-only behavior)
-- Decision: Users can only read audit logs from organizations they belong to.
-- This provides a transparent record of all mutations. Actual audit_log inserts are done via service role only.
CREATE POLICY audit_logs_read ON audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = audit_logs.organization_id
      AND organization_members.user_id = auth.uid()::text
    )
  );

-- Policy: users cannot insert/update/delete audit logs (service role only, append-only)
CREATE POLICY audit_logs_prevent_write ON audit_logs
  FOR INSERT WITH CHECK (false);

CREATE POLICY audit_logs_prevent_update ON audit_logs
  FOR UPDATE USING (false);

CREATE POLICY audit_logs_prevent_delete ON audit_logs
  FOR DELETE USING (false);
