-- Phase 5: CodeRabbit Integration
-- Migration 002: Add coderabbit_reviews table and RLS policies

-- 1. Add coderabbit_api_key column to organizations table
ALTER TABLE organizations
ADD COLUMN coderabbit_api_key TEXT;

-- 2. Create coderabbit_reviews table
CREATE TABLE coderabbit_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  repository_id UUID NOT NULL REFERENCES repositories(id),
  file_path TEXT NOT NULL,
  review_status TEXT NOT NULL CHECK (review_status IN ('approved', 'needs-review', 'issues', 'not-reviewed')),
  comment_count INTEGER DEFAULT 0,
  summary TEXT,
  external_review_url TEXT,
  fetched_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(repository_id, file_path)
);

-- 3. Create indexes for performance
CREATE INDEX idx_coderabbit_reviews_org_repo
  ON coderabbit_reviews(organization_id, repository_id);

CREATE INDEX idx_coderabbit_reviews_file_path
  ON coderabbit_reviews(repository_id, file_path);

-- 4. Enable RLS and create policies
ALTER TABLE coderabbit_reviews ENABLE ROW LEVEL SECURITY;

-- Users can read reviews only from their organization
CREATE POLICY "Users can read reviews from their org"
  ON coderabbit_reviews
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Service role can insert (backend server operations)
CREATE POLICY "Service can insert reviews"
  ON coderabbit_reviews
  FOR INSERT
  WITH CHECK (TRUE);

-- Service role can update reviews (refresh operations)
CREATE POLICY "Service can update reviews"
  ON coderabbit_reviews
  FOR UPDATE
  USING (TRUE)
  WITH CHECK (TRUE);
