-- ============================================================================
-- RLS Policy State Verification Script
-- Run after all migrations to verify the final policy state is secure.
-- Usage: psql -f supabase/tests/verify_rls_policies.sql
-- ============================================================================

-- 1. List all policies on project_members
\echo '=== project_members policies ==='
SELECT policyname, cmd, permissive, qual, with_check
FROM pg_policies
WHERE tablename = 'project_members'
ORDER BY cmd, policyname;

-- 2. CRITICAL CHECK: No INSERT policy should contain auth.uid() = user_id
\echo ''
\echo '=== SECURITY CHECK: Self-insert policies (MUST BE EMPTY) ==='
SELECT policyname, cmd, with_check
FROM pg_policies
WHERE tablename = 'project_members'
  AND cmd = 'INSERT'
  AND with_check LIKE '%auth.uid()%user_id%';

-- 3. CRITICAL CHECK: No UPDATE policy should contain auth.uid() = user_id
\echo ''
\echo '=== SECURITY CHECK: Self-update policies (MUST BE EMPTY) ==='
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'project_members'
  AND cmd = 'UPDATE'
  AND qual LIKE '%auth.uid()%user_id%';

-- 4. CRITICAL CHECK: No DELETE policy should contain auth.uid() = user_id
\echo ''
\echo '=== SECURITY CHECK: Self-delete policies (MUST BE EMPTY) ==='
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'project_members'
  AND cmd = 'DELETE'
  AND qual LIKE '%auth.uid()%user_id%';

-- 5. Verify expected policy count
\echo ''
\echo '=== Expected: 4 policies total (SELECT, INSERT, UPDATE, DELETE) ==='
SELECT count(*) as total_policies
FROM pg_policies
WHERE tablename = 'project_members';
