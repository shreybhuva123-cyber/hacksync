import { describe, it, expect } from "bun:test";
import { codeSyncService } from "@/lib/services/codesync.service";
import type { CodeNode, Member, MemberFile } from "@/lib/hacksync/types";

describe("CodeSync Engine & Conflict Radar", () => {
  const mockMembers: Member[] = [
    {
      id: "mem-1",
      project_id: "proj-1",
      user_id: "user-1",
      display_name: "Alice (Frontend)",
      email: "alice@team.dev",
      role: "frontend",
      branch_name: "feature/frontend",
      working_area: "frontend",
      online: true,
      last_seen_at: new Date().toISOString(),
    },
    {
      id: "mem-2",
      project_id: "proj-1",
      user_id: "user-2",
      display_name: "Bob (Backend)",
      email: "bob@team.dev",
      role: "backend",
      branch_name: "feature/backend",
      working_area: "backend",
      online: true,
      last_seen_at: new Date().toISOString(),
    },
    {
      id: "mem-3",
      project_id: "proj-1",
      user_id: "user-3",
      display_name: "Charlie (Database)",
      email: "charlie@team.dev",
      role: "database",
      branch_name: "feature/database",
      working_area: "database",
      online: true,
      last_seen_at: new Date().toISOString(),
    },
  ];

  const mockSharedNodes: CodeNode[] = [
    {
      id: "node-1",
      project_id: "proj-1",
      path: "src/App.tsx",
      parent_path: "src",
      kind: "file",
      area: "frontend",
      owner_role: "frontend",
      status: "done",
      language: "typescript",
      content: "export function App() { return <h1>Original App</h1>; }",
      updated_at: new Date().toISOString(),
    },
  ];

  it("should accurately detect added, modified, and unchanged member files", () => {
    const memberFiles: MemberFile[] = [
      // Modified file (differs from shared node-1)
      {
        id: "mf-1",
        project_id: "proj-1",
        user_id: "user-1",
        member_id: "mem-1",
        owner_role: "frontend",
        file_name: "App.tsx",
        relative_path: "src/App.tsx",
        file_type: "text/plain",
        language: "typescript",
        content: "export function App() { return <h1>Updated App by Alice</h1>; }",
        sync_status: "local_modified",
        last_modified: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      // Added file
      {
        id: "mf-2",
        project_id: "proj-1",
        user_id: "user-2",
        member_id: "mem-2",
        owner_role: "backend",
        file_name: "server.ts",
        relative_path: "server/server.ts",
        file_type: "text/plain",
        language: "typescript",
        content: "export const app = express();",
        sync_status: "local_modified",
        last_modified: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      // Added database file
      {
        id: "mf-3",
        project_id: "proj-1",
        user_id: "user-3",
        member_id: "mem-3",
        owner_role: "database",
        file_name: "schema.sql",
        relative_path: "db/schema.sql",
        file_type: "text/plain",
        language: "sql",
        content: "CREATE TABLE users (id serial primary key);",
        sync_status: "local_modified",
        last_modified: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const preview = codeSyncService.buildCodeSyncPreview(
      "proj-1",
      memberFiles,
      mockSharedNodes,
      mockMembers,
    );

    expect(preview.stats.totalFiles).toBe(3);
    expect(preview.stats.addedCount).toBe(2);
    expect(preview.stats.modifiedCount).toBe(1);
    expect(preview.stats.conflictCount).toBe(0);

    expect(preview.trackBreakdown.frontend.length).toBe(1);
    expect(preview.trackBreakdown.backend.length).toBe(1);
    expect(preview.trackBreakdown.database.length).toBe(1);
  });

  it("should detect path collision conflicts when two members modify the same path", () => {
    const conflictingFiles: MemberFile[] = [
      // Alice modified src/App.tsx
      {
        id: "mf-alice",
        project_id: "proj-1",
        user_id: "user-1",
        member_id: "mem-1",
        owner_role: "frontend",
        file_name: "App.tsx",
        relative_path: "src/App.tsx",
        file_type: "text/plain",
        language: "typescript",
        content: "export function App() { return <h1>Alice Version</h1>; }",
        sync_status: "local_modified",
        last_modified: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      // Bob ALSO modified src/App.tsx
      {
        id: "mf-bob",
        project_id: "proj-1",
        user_id: "user-2",
        member_id: "mem-2",
        owner_role: "backend",
        file_name: "App.tsx",
        relative_path: "src/App.tsx",
        file_type: "text/plain",
        language: "typescript",
        content: "export function App() { return <h1>Bob Version</h1>; }",
        sync_status: "local_modified",
        last_modified: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const preview = codeSyncService.buildCodeSyncPreview(
      "proj-1",
      conflictingFiles,
      mockSharedNodes,
      mockMembers,
    );

    expect(preview.stats.conflictCount).toBe(1);
    expect(preview.conflicts.length).toBe(1);
    expect(preview.conflicts[0].path).toBe("src/App.tsx");
    expect(preview.conflicts[0].fileA.user_id).toBe("user-1");
    expect(preview.conflicts[0].fileB.user_id).toBe("user-2");
  });

  it("should execute code sync and return a valid sync session object", async () => {
    const resolvedItems = [
      {
        path: "src/index.ts",
        content: "console.log('Synchronized Code');",
        area: "frontend" as const,
        ownerRole: "frontend" as const,
        language: "typescript",
      },
      {
        path: "src/routes.ts",
        content: "export const routes = [];",
        area: "backend" as const,
        ownerRole: "backend" as const,
        language: "typescript",
      },
    ];

    const session = await codeSyncService.executeCodeSync(
      "proj-test",
      resolvedItems,
      "Alice Lead",
      "lead",
    );

    expect(session).toBeDefined();
    expect(session.actor_name).toBe("Alice Lead");
    expect(session.files_count).toBe(2);
    expect(session.summary.paths).toContain("src/index.ts");
  });
});
