
-- profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT 'Developer',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "own profile write" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- projects
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  repo_url text,
  default_branch text NOT NULL DEFAULT 'main',
  schema_version text NOT NULL DEFAULT 'v1',
  invite_code text NOT NULL UNIQUE DEFAULT upper(substr(md5(random()::text),1,6)),
  is_open_demo boolean NOT NULL DEFAULT false,
  demo_mode boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid,
  display_name text NOT NULL,
  email text,
  role text NOT NULL CHECK (role IN ('frontend','backend','database','lead')),
  branch_name text,
  working_area text,
  online boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.can_access_project(pid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = pid AND p.is_open_demo)
      OR EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_id = pid AND m.user_id = auth.uid());
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read accessible projects" ON public.projects FOR SELECT TO authenticated USING (public.can_access_project(id));
CREATE POLICY "create projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "update accessible projects" ON public.projects FOR UPDATE TO authenticated USING (public.can_access_project(id));
CREATE POLICY "delete own projects" ON public.projects FOR DELETE TO authenticated USING (auth.uid() = created_by);
CREATE TRIGGER projects_touch BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT ALL ON public.project_members TO service_role;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members readable" ON public.project_members FOR SELECT TO authenticated USING (public.can_access_project(project_id));
CREATE POLICY "members insert" ON public.project_members FOR INSERT TO authenticated WITH CHECK (public.can_access_project(project_id) OR auth.uid() = user_id);
CREATE POLICY "members update" ON public.project_members FOR UPDATE TO authenticated USING (public.can_access_project(project_id));
CREATE POLICY "members delete" ON public.project_members FOR DELETE TO authenticated USING (public.can_access_project(project_id));

-- generic helper to create project-scoped tables' policies is repeated inline below

CREATE TABLE public.code_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  path text NOT NULL,
  parent_path text,
  kind text NOT NULL DEFAULT 'file' CHECK (kind IN ('file','folder')),
  area text NOT NULL DEFAULT 'shared' CHECK (area IN ('frontend','backend','database','shared')),
  owner_role text CHECK (owner_role IN ('frontend','backend','database','lead')),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','done','blocked')),
  language text,
  content text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.api_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  method text NOT NULL DEFAULT 'GET',
  route text NOT NULL,
  summary text,
  request_schema text,
  response_schema text,
  auth_required boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','live','broken','deprecated')),
  owner_role text NOT NULL DEFAULT 'backend',
  version text NOT NULL DEFAULT 'v1',
  test_status text NOT NULL DEFAULT 'untested' CHECK (test_status IN ('passing','failing','untested')),
  locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER api_touch BEFORE UPDATE ON public.api_contracts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.db_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  owner_role text NOT NULL DEFAULT 'database',
  schema_version text NOT NULL DEFAULT 'v1',
  migration_status text NOT NULL DEFAULT 'pending' CHECK (migration_status IN ('applied','pending','drifted')),
  sql_definition text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.db_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES public.db_tables(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  data_type text NOT NULL,
  is_nullable boolean NOT NULL DEFAULT true,
  is_primary boolean NOT NULL DEFAULT false,
  is_indexed boolean NOT NULL DEFAULT false,
  references_table text,
  ordinal int NOT NULL DEFAULT 0
);

CREATE TABLE public.integration_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  feature_name text NOT NULL,
  frontend_path text,
  contract_id uuid REFERENCES public.api_contracts(id) ON DELETE SET NULL,
  tables text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('healthy','broken','pending')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER links_touch BEFORE UPDATE ON public.integration_links FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.git_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  owner_role text NOT NULL DEFAULT 'frontend',
  owner_name text,
  last_commit_sha text,
  last_commit_message text,
  last_commit_at timestamptz DEFAULT now(),
  ahead int NOT NULL DEFAULT 0,
  behind int NOT NULL DEFAULT 0,
  merge_status text NOT NULL DEFAULT 'clean' CHECK (merge_status IN ('clean','conflict','review','merged')),
  integration_ready boolean NOT NULL DEFAULT false
);

CREATE TABLE public.env_vars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  key_name text NOT NULL,
  scope text NOT NULL DEFAULT 'backend' CHECK (scope IN ('frontend','backend','database')),
  required boolean NOT NULL DEFAULT true,
  configured boolean NOT NULL DEFAULT false,
  used_in text,
  description text,
  example_value text
);

CREATE TABLE public.health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'api',
  status text NOT NULL DEFAULT 'warn' CHECK (status IN ('pass','fail','warn')),
  detail text,
  critical boolean NOT NULL DEFAULT true,
  last_run_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  area text NOT NULL DEFAULT 'frontend' CHECK (area IN ('frontend','backend','database','shared')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','review','done')),
  assignee_role text,
  depends_on text,
  blocker text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER tasks_touch BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'info',
  actor text,
  actor_role text,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  author_role text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER notes_touch BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  author_role text NOT NULL DEFAULT 'frontend',
  author_name text,
  summary text,
  files_affected text,
  api_changes text,
  schema_changes text,
  env_required text,
  test_instructions text,
  known_issues text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.contract_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES public.api_contracts(id) ON DELETE CASCADE,
  author_role text,
  author_name text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['code_nodes','api_contracts','db_tables','db_columns','integration_links','git_branches','env_vars','health_checks','tasks','activity_events','notes','handoffs','contract_comments']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated;', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role;', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('CREATE POLICY "%s_read" ON public.%I FOR SELECT TO authenticated USING (public.can_access_project(project_id));', t, t);
    EXECUTE format('CREATE POLICY "%s_insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_access_project(project_id));', t, t);
    EXECUTE format('CREATE POLICY "%s_update" ON public.%I FOR UPDATE TO authenticated USING (public.can_access_project(project_id));', t, t);
    EXECUTE format('CREATE POLICY "%s_delete" ON public.%I FOR DELETE TO authenticated USING (public.can_access_project(project_id));', t, t);
  END LOOP;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.api_contracts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.health_checks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.integration_links;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_members;

-- ============ SEED DEMO PROJECT ============
INSERT INTO public.projects (id, name, description, repo_url, default_branch, schema_version, invite_code, is_open_demo)
VALUES ('11111111-1111-4111-8111-111111111111','Hackathon Project — CampusMesh','Final-round hackathon build: a campus event mesh with React frontend, Node/Express API and PostgreSQL.','https://github.com/hacksync-demo/campusmesh','main','v3','HSDEMO', true);

INSERT INTO public.project_members (project_id, display_name, email, role, branch_name, working_area, online) VALUES
('11111111-1111-4111-8111-111111111111','Aarav Mehta','aarav@campusmesh.dev','lead','main','Integration Map', true),
('11111111-1111-4111-8111-111111111111','Priya Nair','priya@campusmesh.dev','frontend','feat/frontend-events','/frontend/src/pages/Events.tsx', true),
('11111111-1111-4111-8111-111111111111','Rohan Das','rohan@campusmesh.dev','backend','feat/api-events','/backend/src/routes/events.ts', true),
('11111111-1111-4111-8111-111111111111','Sneha Iyer','sneha@campusmesh.dev','database','feat/db-schema','/database/migrations/0004_rsvp.sql', false);

INSERT INTO public.code_nodes (project_id, path, parent_path, kind, area, owner_role, status, language, content) VALUES
('11111111-1111-4111-8111-111111111111','/frontend',NULL,'folder','frontend','frontend','in_progress',NULL,NULL),
('11111111-1111-4111-8111-111111111111','/frontend/src/pages/Events.tsx','/frontend','file','frontend','frontend','in_progress','tsx','import { useEvents } from "@/api/events";\n\nexport function EventsPage() {\n  const { data, isLoading } = useEvents();\n  if (isLoading) return <Spinner />;\n  return (\n    <ul>\n      {data.map((e) => (\n        <li key={e.id}>{e.title}</li>\n      ))}\n    </ul>\n  );\n}\n'),
('11111111-1111-4111-8111-111111111111','/frontend/src/api/events.ts','/frontend','file','frontend','frontend','done','ts','export async function listEvents() {\n  const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/events`);\n  if (!res.ok) throw new Error("Failed to load events");\n  return res.json();\n}\n'),
('11111111-1111-4111-8111-111111111111','/backend',NULL,'folder','backend','backend','in_progress',NULL,NULL),
('11111111-1111-4111-8111-111111111111','/backend/src/routes/events.ts','/backend','file','backend','backend','in_progress','ts','router.get("/api/events", async (_req, res) => {\n  const rows = await db.query("select * from events order by starts_at");\n  res.json(rows);\n});\n\nrouter.post("/api/events/:id/rsvp", requireAuth, async (req, res) => {\n  // TODO: rsvps table column mismatch (attendee_id vs user_id)\n  res.status(500).json({ error: "not implemented" });\n});\n'),
('11111111-1111-4111-8111-111111111111','/backend/src/db.ts','/backend','file','backend','backend','done','ts','export const db = new Pool({ connectionString: process.env.DATABASE_URL });\n'),
('11111111-1111-4111-8111-111111111111','/database',NULL,'folder','database','database','in_progress',NULL,NULL),
('11111111-1111-4111-8111-111111111111','/database/migrations/0004_rsvp.sql','/database','file','database','database','blocked','sql','create table rsvps (\n  id uuid primary key default gen_random_uuid(),\n  event_id uuid references events(id),\n  attendee_id uuid references users(id),\n  created_at timestamptz default now()\n);\n'),
('11111111-1111-4111-8111-111111111111','/shared',NULL,'folder','shared','lead','in_progress',NULL,NULL),
('11111111-1111-4111-8111-111111111111','/shared/contracts/api.d.ts','/shared','file','shared','lead','in_progress','ts','export interface EventDTO {\n  id: string;\n  title: string;\n  startsAt: string;\n  venue: string;\n  rsvpCount: number;\n}\n'),
('11111111-1111-4111-8111-111111111111','/shared/.env.example','/shared','file','shared','lead','done','bash','VITE_API_BASE_URL=\nDATABASE_URL=\nJWT_SECRET=\nCORS_ORIGIN=\n');

INSERT INTO public.api_contracts (id, project_id, method, route, summary, request_schema, response_schema, auth_required, status, owner_role, version, test_status, locked) VALUES
('22222222-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','GET','/api/events','List all upcoming campus events','{ "query": { "limit?": "number" } }','[{ "id": "uuid", "title": "string", "startsAt": "iso", "venue": "string", "rsvpCount": "number" }]',false,'live','backend','v1','passing',true),
('22222222-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','GET','/api/events/:id','Fetch a single event with venue detail','{ "params": { "id": "uuid" } }','{ "id": "uuid", "title": "string", "startsAt": "iso", "venue": "string" }',false,'live','backend','v1','passing',true),
('22222222-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','POST','/api/events/:id/rsvp','RSVP the signed-in user to an event','{ "params": { "id": "uuid" }, "body": { "note?": "string" } }','{ "ok": true, "rsvpId": "uuid" }',true,'broken','backend','v2','failing',false),
('22222222-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','POST','/api/auth/login','Email + password login, returns JWT','{ "body": { "email": "string", "password": "string" } }','{ "token": "string", "user": { "id": "uuid", "name": "string" } }',false,'live','backend','v1','passing',true),
('22222222-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','GET','/api/me/rsvps','List the signed-in user''s RSVPs','{}','[{ "eventId": "uuid", "status": "string" }]',true,'in_progress','backend','v1','untested',false),
('22222222-0000-4000-8000-000000000006','11111111-1111-4111-8111-111111111111','GET','/api/venues','List venues with capacity','{}','[{ "id": "uuid", "name": "string", "capacity": "number" }]',false,'planned','backend','v1','untested',false);

INSERT INTO public.db_tables (id, project_id, name, description, owner_role, schema_version, migration_status, sql_definition) VALUES
('33333333-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','users','Campus accounts','database','v3','applied','create table users (\n  id uuid primary key default gen_random_uuid(),\n  email text unique not null,\n  name text not null,\n  created_at timestamptz default now()\n);'),
('33333333-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','events','Events published by clubs','database','v3','applied','create table events (\n  id uuid primary key default gen_random_uuid(),\n  title text not null,\n  starts_at timestamptz not null,\n  venue_id uuid references venues(id),\n  created_by uuid references users(id)\n);\ncreate index events_starts_at_idx on events(starts_at);'),
('33333333-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','venues','Physical venues and capacity','database','v3','applied','create table venues (\n  id uuid primary key default gen_random_uuid(),\n  name text not null,\n  capacity int not null default 0\n);'),
('33333333-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','rsvps','Attendance records — column renamed in v3, API still on v2','database','v2','drifted','create table rsvps (\n  id uuid primary key default gen_random_uuid(),\n  event_id uuid references events(id),\n  attendee_id uuid references users(id), -- was user_id in v2\n  created_at timestamptz default now()\n);');

INSERT INTO public.db_columns (table_id, project_id, name, data_type, is_nullable, is_primary, is_indexed, references_table, ordinal) VALUES
('33333333-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','id','uuid',false,true,true,NULL,1),
('33333333-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','email','text',false,false,true,NULL,2),
('33333333-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','name','text',false,false,false,NULL,3),
('33333333-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','created_at','timestamptz',false,false,false,NULL,4),
('33333333-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','id','uuid',false,true,true,NULL,1),
('33333333-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','title','text',false,false,false,NULL,2),
('33333333-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','starts_at','timestamptz',false,false,true,NULL,3),
('33333333-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','venue_id','uuid',true,false,true,'venues',4),
('33333333-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','created_by','uuid',true,false,false,'users',5),
('33333333-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','id','uuid',false,true,true,NULL,1),
('33333333-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','name','text',false,false,false,NULL,2),
('33333333-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','capacity','int',false,false,false,NULL,3),
('33333333-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','id','uuid',false,true,true,NULL,1),
('33333333-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','event_id','uuid',true,false,true,'events',2),
('33333333-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','attendee_id','uuid',true,false,true,'users',3),
('33333333-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','created_at','timestamptz',false,false,false,NULL,4);

INSERT INTO public.integration_links (project_id, feature_name, frontend_path, contract_id, tables, status, notes) VALUES
('11111111-1111-4111-8111-111111111111','Events list','/frontend/src/pages/Events.tsx','22222222-0000-4000-8000-000000000001','{events,venues}','healthy','Rendering live data from staging API.'),
('11111111-1111-4111-8111-111111111111','Event detail','/frontend/src/pages/EventDetail.tsx','22222222-0000-4000-8000-000000000002','{events,venues}','healthy',NULL),
('11111111-1111-4111-8111-111111111111','RSVP button','/frontend/src/components/RsvpButton.tsx','22222222-0000-4000-8000-000000000003','{rsvps,events}','broken','500 from API. Schema v3 renamed rsvps.user_id -> attendee_id; handler still writes user_id.'),
('11111111-1111-4111-8111-111111111111','Login form','/frontend/src/pages/Login.tsx','22222222-0000-4000-8000-000000000004','{users}','healthy',NULL),
('11111111-1111-4111-8111-111111111111','My RSVPs panel','/frontend/src/pages/Profile.tsx','22222222-0000-4000-8000-000000000005','{rsvps,events}','pending','Backend endpoint in progress, frontend stubbed with mock.'),
('11111111-1111-4111-8111-111111111111','Venue picker','/frontend/src/components/VenuePicker.tsx',NULL,'{venues}','pending','No contract defined yet — frontend is assuming GET /api/venues.');

INSERT INTO public.git_branches (project_id, name, owner_role, owner_name, last_commit_sha, last_commit_message, ahead, behind, merge_status, integration_ready) VALUES
('11111111-1111-4111-8111-111111111111','main','lead','Aarav Mehta','a91f3c2','chore: wire CI + health endpoint',0,0,'clean',true),
('11111111-1111-4111-8111-111111111111','feat/frontend-events','frontend','Priya Nair','5c81de0','feat(events): list + detail pages with loading states',6,1,'clean',true),
('11111111-1111-4111-8111-111111111111','feat/api-events','backend','Rohan Das','7bb2094','fix(events): pagination; rsvp handler still failing',9,3,'review',false),
('11111111-1111-4111-8111-111111111111','feat/db-schema','database','Sneha Iyer','1d40aa7','migration 0004: rename rsvps.user_id -> attendee_id',4,0,'conflict',false);

INSERT INTO public.env_vars (project_id, key_name, scope, required, configured, used_in, description, example_value) VALUES
('11111111-1111-4111-8111-111111111111','VITE_API_BASE_URL','frontend',true,true,'/frontend/src/api/*','Base URL of the Express API','http://localhost:4000'),
('11111111-1111-4111-8111-111111111111','VITE_MAPS_KEY','frontend',false,false,'/frontend/src/components/VenueMap.tsx','Optional map tiles for venue view',''),
('11111111-1111-4111-8111-111111111111','DATABASE_URL','backend',true,true,'/backend/src/db.ts','Postgres connection string','postgres://user:pass@localhost:5432/campusmesh'),
('11111111-1111-4111-8111-111111111111','JWT_SECRET','backend',true,false,'/backend/src/auth.ts','Signing secret for session tokens',''),
('11111111-1111-4111-8111-111111111111','CORS_ORIGIN','backend',true,false,'/backend/src/server.ts','Allowed frontend origin','http://localhost:5173'),
('11111111-1111-4111-8111-111111111111','PGSSLMODE','database',false,true,'/database/scripts/migrate.sh','SSL mode for hosted Postgres','require');

INSERT INTO public.health_checks (project_id, name, category, status, detail, critical) VALUES
('11111111-1111-4111-8111-111111111111','API reachable (/health)','api','pass','200 OK in 84ms',true),
('11111111-1111-4111-8111-111111111111','All frontend routes resolve','frontend','pass','7/7 routes matched',true),
('11111111-1111-4111-8111-111111111111','Database connectivity','database','pass','Pool connected, 4 tables discovered',true),
('11111111-1111-4111-8111-111111111111','Schema version matches contracts','database','fail','API expects rsvps.user_id (v2); database is at v3 (attendee_id)',true),
('11111111-1111-4111-8111-111111111111','No broken API contracts','api','fail','POST /api/events/:id/rsvp returns 500',true),
('11111111-1111-4111-8111-111111111111','CORS configured','config','warn','CORS_ORIGIN not set on backend',true),
('11111111-1111-4111-8111-111111111111','Required env vars configured','config','warn','2 of 5 required variables missing',true),
('11111111-1111-4111-8111-111111111111','Every route has a frontend consumer','api','warn','GET /api/venues has no registered consumer',false);

INSERT INTO public.tasks (project_id, title, area, priority, status, assignee_role, depends_on, blocker) VALUES
('11111111-1111-4111-8111-111111111111','Fix RSVP handler to use attendee_id','backend','critical','in_progress','backend','Migration 0004','Schema drift v2 -> v3'),
('11111111-1111-4111-8111-111111111111','Define GET /api/venues contract','backend','high','todo','backend',NULL,NULL),
('11111111-1111-4111-8111-111111111111','Set CORS_ORIGIN + JWT_SECRET on backend','shared','high','todo','lead',NULL,NULL),
('11111111-1111-4111-8111-111111111111','Wire VenuePicker to real endpoint','frontend','medium','todo','frontend','GET /api/venues',NULL),
('11111111-1111-4111-8111-111111111111','Apply migration 0004 to shared database','database','critical','review','database',NULL,NULL),
('11111111-1111-4111-8111-111111111111','Events list loading + empty states','frontend','medium','done','frontend',NULL,NULL),
('11111111-1111-4111-8111-111111111111','Index events.starts_at','database','low','done','database',NULL,NULL);

INSERT INTO public.activity_events (project_id, kind, actor, actor_role, message, created_at) VALUES
('11111111-1111-4111-8111-111111111111','commit','Sneha Iyer','database','1d40aa7 migration 0004: rename rsvps.user_id -> attendee_id', now() - interval '9 minutes'),
('11111111-1111-4111-8111-111111111111','schema','Sneha Iyer','database','Schema version bumped to v3 — rsvps table marked drifted', now() - interval '8 minutes'),
('11111111-1111-4111-8111-111111111111','integration','HackSync','lead','Conflict Radar: POST /api/events/:id/rsvp depends on rsvps schema that just changed', now() - interval '8 minutes'),
('11111111-1111-4111-8111-111111111111','api','Rohan Das','backend','Marked POST /api/events/:id/rsvp as broken (500)', now() - interval '6 minutes'),
('11111111-1111-4111-8111-111111111111','commit','Priya Nair','frontend','5c81de0 feat(events): list + detail pages with loading states', now() - interval '4 minutes'),
('11111111-1111-4111-8111-111111111111','contract','Aarav Mehta','lead','Locked contract GET /api/events v1', now() - interval '3 minutes'),
('11111111-1111-4111-8111-111111111111','task','Priya Nair','frontend','Completed task: Events list loading + empty states', now() - interval '1 minute');

INSERT INTO public.notes (project_id, title, body, author_role) VALUES
('11111111-1111-4111-8111-111111111111','Architecture decisions','## Stack\n- Frontend: React + Vite, deployed on Netlify\n- Backend: Node/Express on Render, base path `/api`\n- Database: Postgres (Neon), migrations in `/database/migrations`\n\n## Rules\n1. No frontend calls a route that is not a **locked** contract.\n2. Any schema change bumps `schema_version` and posts a Handoff Card.\n3. Merge into `main` only when Integration Readiness >= 90%.','lead'),
('11111111-1111-4111-8111-111111111111','Naming conventions','- API routes are plural and kebab-free: `/api/events`, `/api/venues`\n- DTO fields are camelCase; database columns are snake_case\n- Mapping happens in the backend serializer, never in the frontend.','backend');

INSERT INTO public.handoffs (project_id, title, author_role, author_name, summary, files_affected, api_changes, schema_changes, env_required, test_instructions, known_issues) VALUES
('11111111-1111-4111-8111-111111111111','Migration 0004 — rsvps column rename','database','Sneha Iyer','Renamed rsvps.user_id to attendee_id for consistency with events.created_by.','/database/migrations/0004_rsvp.sql','None directly, but POST /api/events/:id/rsvp must be updated','rsvps.user_id -> rsvps.attendee_id; schema_version v2 -> v3','DATABASE_URL','psql $DATABASE_URL -f database/migrations/0004_rsvp.sql then \\d rsvps','Backend RSVP handler still writes user_id and returns 500.'),
('11111111-1111-4111-8111-111111111111','Events pages ready for integration','frontend','Priya Nair','Events list and detail pages complete with loading, empty and error states.','/frontend/src/pages/Events.tsx, /frontend/src/api/events.ts','Consumes GET /api/events and GET /api/events/:id (v1, locked)','None','VITE_API_BASE_URL','npm run dev in /frontend, open /events with the API running on :4000','VenuePicker still uses mock data.');

INSERT INTO public.contract_comments (project_id, contract_id, author_role, author_name, body) VALUES
('11111111-1111-4111-8111-111111111111','22222222-0000-4000-8000-000000000003','frontend','Priya Nair','RSVP button is getting a 500 — is the body shape still { note }?'),
('11111111-1111-4111-8111-111111111111','22222222-0000-4000-8000-000000000003','backend','Rohan Das','Body is fine. Insert fails because the column got renamed. Fixing on feat/api-events.'),
('11111111-1111-4111-8111-111111111111','22222222-0000-4000-8000-000000000001','lead','Aarav Mehta','Locked at v1. Ping me before changing the response shape.');
