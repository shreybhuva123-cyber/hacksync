# Database Architecture

HackSync relies on Supabase PostgreSQL for persistent data storage, leveraging Row Level Security (RLS) to enforce multi-tenant isolation at the database tier.

## Schema Overview

Key tables include:
- `projects`: Core tenant boundary.
- `project_members`: Associates users with projects (RBAC).
- `code_nodes`: Represents sync destinations/sources.
- `member_files`: Tracks file metadata per member.
- `file_versions`: History of file changes for sync and conflict resolution.
- `sync_sessions`: Tracks active and historical sync operations.
- `github_pushes`: Records integration events from GitHub.
- `activity_events`: Audit log for user and system actions.
- `ai_approval_requests`: Pending and resolved AI tool invocations.
- `security_audit_events`: Security-critical event logging.

## Security and RLS

Row Level Security (RLS) is paramount to HackSync's tenant isolation.
- All RLS policies strictly enforce context based on `auth.uid()` and verified project membership via helper functions like `can_view_project` and `can_manage_members`.
- We strictly avoid `USING (true)` or `WITH CHECK (true)` on any private data tables.

## Stored Procedures
Critical atomic operations are handled via stored procedures to guarantee consistency.
- `consume_approval_atomic`: Consumes an AI approval request atomically, preventing replay attacks or race conditions.

## Migration Strategy
Database schema changes are managed through sequential SQL files located in `supabase/migrations/`. This ensures repeatable, version-controlled deployments of database state.
