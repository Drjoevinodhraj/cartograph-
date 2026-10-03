# Task 3: Database Migration — Requirements Brief

## Context
Phase 5 CodeRabbit integration. This task creates the database schema: coderabbit_reviews table, RLS policies, and coderabbit_api_key column on organizations. Task 3 depends on Task 1-2 design and is upstream of Task 4-5 (which use the table).

**Your job:** Write Supabase PostgreSQL migration that creates the table and RLS policies.

## File to Create
- `supabase/migrations/002_add_coderabbit_reviews.sql` — Database migration

## Exact Requirements

### Migration Must Contain

**1. Add coderabbit_api_key column to organizations table**
```sql
ALTER TABLE organizations
ADD COLUMN coderabbit_api_key TEXT;
```

**2. Create coderabbit_reviews table**
```sql
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
```

**3. Create indexes for performance**
```sql
CREATE INDEX idx_coderabbit_reviews_org_repo
  ON coderabbit_reviews(organization_id, repository_id);

CREATE INDEX idx_coderabbit_reviews_file_path
  ON coderabbit_reviews(repository_id, file_path);
```

**4. Enable RLS and create policies**
```sql
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
```

### Schema Details
- **id**: UUID, primary key, auto-generated
- **organization_id**: UUID, not null, foreign key to organizations.id (enables RLS)
- **repository_id**: UUID, not null, foreign key to repositories.id
- **file_path**: TEXT, not null (normalized file path)
- **review_status**: TEXT, not null, CHECK constraint with 4 enum values
- **comment_count**: INTEGER, default 0 (non-negative)
- **summary**: TEXT, nullable (review summary)
- **external_review_url**: TEXT, nullable (link to CodeRabbit)
- **fetched_at**: TIMESTAMP, default NOW() (when review was fetched from API)
- **created_at**: TIMESTAMP, default NOW() (when row created)
- **UNIQUE(repository_id, file_path)**: Prevents duplicate file paths within a repository

### RLS Policies
- **SELECT policy**: User can read reviews if they are a member of the organization that owns those reviews (checked via organization_members table)
- **INSERT policy**: Always allow (WITH CHECK TRUE) — service role will enforce authorization at application level
- **UPDATE policy**: Always allow (WITH CHECK TRUE) — service role will enforce authorization at application level
- No DELETE policy (reviews persist once created)

### Testing/Verification
The migration should:
- Run without errors on Supabase (local or staging)
- Create table with all columns
- Create indexes visible in database
- RLS policies visible in Supabase dashboard
- UNIQUE constraint enforced (duplicate file_path in same repo rejected)
- CHECK constraint enforced (invalid review_status rejected)

## Global Constraints
- PostgreSQL/Supabase dialect (not generic SQL)
- Follow Supabase convention: `002_add_coderabbit_reviews.sql` (sequential numbering)
- No breaking changes to existing tables
- Idempotent where possible (CREATE IF NOT EXISTS for policies, but standard CREATE for table)
- Comments in SQL for clarity

## Code Quality
- Clear comments explaining what each section does
- Proper spacing and indentation
- Policy names are descriptive ("Users can read...", "Service can insert...")

## Verification Steps
1. Create the migration file with exact SQL above
2. Verify syntax (no typos in keywords, column names, constraint syntax)
3. Commit to git
4. Run migration on Supabase:
   - Via Supabase CLI: `supabase migration list` then apply via dashboard
   - Or paste SQL into Supabase SQL editor and run
5. Verify in Supabase:
   - Table exists with all columns
   - Indexes created
   - RLS enabled on table
   - Policies visible in security section
6. Test UNIQUE constraint: insert same (repo_id, file_path) twice → second fails
7. Test CHECK constraint: insert review_status='invalid' → fails

## Report File
Write your report to: `.superpowers/sdd/phase-5-coderabbit/task-3-report.md`

Format:
```
## Status
DONE or NEEDS_CONTEXT (if Supabase environment not available)

## Migration File
supabase/migrations/002_add_coderabbit_reviews.sql

## Verification
[Describe how you verified the migration works]
- Table created: YES
- Indexes created: YES
- RLS enabled: YES
- Policies created: YES
- Constraints enforced: YES

## Concerns
[if any]
```

Done when:
- Migration file created at exact path
- All SQL syntax correct
- Committed to git
- Report written with verification steps
