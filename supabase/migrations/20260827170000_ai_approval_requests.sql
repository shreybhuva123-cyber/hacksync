-- HackSync Enterprise AI Approval Gate Persistence & Multi-Tenant Isolation
-- Tracks all human-in-the-loop approvals for code mutations, patches, and executions.

CREATE TABLE IF NOT EXISTS public.ai_approval_requests (
  id text PRIMARY KEY,
  request_id text NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  tool_name text NOT NULL,
  operation text NOT NULL,
  summary text NOT NULL,
  rationale text NOT NULL,
  files_affected jsonb DEFAULT '[]'::jsonb,
  diff_preview text,
  diff_hash text,
  status text NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected' | 'expired'
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  resolved_at timestamptz,
  resolved_by uuid
);

-- Indexes for fast lookup by project, status, and request correlation
CREATE INDEX IF NOT EXISTS idx_ai_approval_project_status
  ON public.ai_approval_requests (project_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_approval_request_id
  ON public.ai_approval_requests (request_id);

-- Enable Row-Level Security
ALTER TABLE public.ai_approval_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Project members can view pending approvals in their project
CREATE POLICY "ai_approval_select_project_members"
  ON public.ai_approval_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = ai_approval_requests.project_id
        AND project_members.user_id = auth.uid()
    )
  );

-- Policy: Authenticated project members can submit AI approval requests for their project
CREATE POLICY "ai_approval_insert_project_members"
  ON public.ai_approval_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = ai_approval_requests.project_id
        AND project_members.user_id = auth.uid()
    )
  );

-- Policy: Only Project Leads or Owners can resolve approvals in their project
CREATE POLICY "ai_approval_update_lead_or_owner"
  ON public.ai_approval_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = ai_approval_requests.project_id
        AND project_members.user_id = auth.uid()
        AND project_members.role IN ('owner', 'lead')
    )
  );
