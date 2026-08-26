-- ============================================================================
-- HackSync Rollback Script for Migration 20260826180000
-- Reverts constraints, helper functions, and RPC endpoints cleanly.
-- ============================================================================

-- 1. Drop RPC functions
DROP FUNCTION IF EXISTS public.change_member_role(uuid, text);
DROP FUNCTION IF EXISTS public.remove_member_from_project(uuid);
DROP FUNCTION IF EXISTS public.update_my_presence(uuid, text, text);

-- 2. Drop Helper functions
DROP FUNCTION IF EXISTS public.can_view_project(uuid);
DROP FUNCTION IF EXISTS public.can_edit_project(uuid);
DROP FUNCTION IF EXISTS public.can_manage_members(uuid);
DROP FUNCTION IF EXISTS public.can_manage_contracts(uuid);
DROP FUNCTION IF EXISTS public.can_manage_schema(uuid);
DROP FUNCTION IF EXISTS public.can_delete_project(uuid);

-- 3. Drop Added Constraints
ALTER TABLE public.project_members DROP CONSTRAINT IF EXISTS unique_project_member_user;
ALTER TABLE public.api_contracts DROP CONSTRAINT IF EXISTS unique_project_contract_route;
ALTER TABLE public.db_tables DROP CONSTRAINT IF EXISTS unique_project_db_table;
ALTER TABLE public.db_columns DROP CONSTRAINT IF EXISTS unique_table_column_name;
