-- ============================================================================
-- HackSync Demo & Local Development Seed Data
-- Run only in development/demo environments, NOT during production schema migration.
-- ============================================================================

DO $$
DECLARE
  v_demo_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  -- Insert Demo Project
  INSERT INTO public.projects (
    id,
    name,
    description,
    repo_url,
    default_branch,
    schema_version,
    invite_code,
    is_open_demo,
    demo_mode
  ) VALUES (
    v_demo_id,
    'HackSync Live Demo Platform',
    'High-velocity synchronization and single-truth control center for distributed hackathon teams',
    'https://github.com/shreybhuva123-cyber/hacksync',
    'main',
    '2.1.0',
    'DEMO2026',
    true,
    true
  ) ON CONFLICT (id) DO NOTHING;

  -- Insert Demo Members
  INSERT INTO public.project_members (project_id, display_name, email, role, branch_name, working_area, online)
  VALUES 
    (v_demo_id, 'Arjun Patel', 'arjun@hacksync.dev', 'lead', 'main', 'src/routes/dashboard', true),
    (v_demo_id, 'Priya Sharma', 'priya@hacksync.dev', 'frontend', 'feat/event-list', 'src/components/Events.tsx', true),
    (v_demo_id, 'Rahul Verma', 'rahul@hacksync.dev', 'backend', 'feat/rsvp-api', 'src/routes/events.ts', true),
    (v_demo_id, 'Meera Nair', 'meera@hacksync.dev', 'database', 'feat/rsvp-schema', 'database/migrations', false)
  ON CONFLICT DO NOTHING;

  -- Insert Demo Contracts
  INSERT INTO public.api_contracts (project_id, route, method, version, summary, status, locked, auth_required, owner_role, response_schema, test_status)
  VALUES 
    (v_demo_id, '/api/events', 'GET', 'v1', 'List upcoming hackathon events', 'live', true, false, 'backend', '{"events":[{"id":"e1","title":"Kickoff"}]}', 'passing'),
    (v_demo_id, '/api/events/:id/rsvp', 'POST', 'v1', 'RSVP attendee for a specific event', 'live', true, true, 'backend', '{"success":true,"rsvpId":"rsvp-123"}', 'passing')
  ON CONFLICT DO NOTHING;

  -- Insert Demo Tables
  INSERT INTO public.db_tables (project_id, name, owner_role, schema_version, migration_status, description)
  VALUES 
    (v_demo_id, 'events', 'database', '2.1.0', 'applied', 'Scheduled hackathon events and locations'),
    (v_demo_id, 'event_rsvps', 'database', '2.1.0', 'applied', 'Attendee RSVPs linked to events')
  ON CONFLICT DO NOTHING;

  -- Insert Demo Tasks
  INSERT INTO public.tasks (project_id, title, area, priority, status, assignee_role)
  VALUES 
    (v_demo_id, 'Lock events GET contract', 'backend', 'high', 'done', 'backend'),
    (v_demo_id, 'Connect Frontend EventList component', 'frontend', 'high', 'in_progress', 'frontend')
  ON CONFLICT DO NOTHING;
END $$;
