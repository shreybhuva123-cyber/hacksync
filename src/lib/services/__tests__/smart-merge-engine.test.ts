import { describe, it, expect } from "bun:test";
import {
  threeWayMerge,
  multiPartyMerge,
  reconcileFileCreation,
  computeFastHash,
  computeLineDiff,
} from "@/lib/hacksync/merge-engine";
import { codeSyncService } from "@/lib/services/codesync.service";
import type { CodeNode, Member, MemberFile } from "@/lib/hacksync/types";

describe("HackSync Smart 3-Way Merge Engine", () => {
  const baseLoginCode = `function Login() {
  return (
    <div>
      <LoginForm />
    </div>
  );
}`;

  it("Case 1 & 2: should automatically merge non-overlapping changes from Member A and Member B against a common base", () => {
    // Member A adds navigate at top
    const memberACode = `function Login() {
  const navigate = useNavigate();

  return (
    <div>
      <LoginForm />
    </div>
  );
}`;

    // Member B adds ForgotPassword at bottom
    const memberBCode = `function Login() {
  return (
    <div>
      <LoginForm />
      <ForgotPassword />
    </div>
  );
}`;

    const result = threeWayMerge(baseLoginCode, memberACode, memberBCode, {
      labelA: "Member A (frontend)",
      labelB: "Member B (frontend)",
    });

    expect(result.hasConflict).toBe(false);
    expect(result.mergedContent).toContain("const navigate = useNavigate();");
    expect(result.mergedContent).toContain("<ForgotPassword />");
    expect(result.mergedContent).toContain("<LoginForm />");
    expect(result.autoMergedHunksCount).toBeGreaterThan(0);
  });

  it("Case 3: should detect true conflict when Member A and Member B modify the same section incompatibly", () => {
    const baseTimeout = `const timeout = 5000;
console.log("ready");`;

    const timeoutA = `const timeout = 10000;
console.log("ready");`;

    const timeoutB = `const timeout = 15000;
console.log("ready");`;

    const result = threeWayMerge(baseTimeout, timeoutA, timeoutB, {
      labelA: "Member A",
      labelB: "Member B",
    });

    expect(result.hasConflict).toBe(true);
    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.mergedContent).toContain("<<<<<<< Member A");
    expect(result.mergedContent).toContain("timeout = 10000;");
    expect(result.mergedContent).toContain("=======");
    expect(result.mergedContent).toContain("timeout = 15000;");
    expect(result.mergedContent).toContain(">>>>>>> Member B");
  });

  it("Case 5: should support 3, 4, 5+ developers working on the same file without conflict if modifications are independent", () => {
    const baseApp = `import React from "react";

// SECTION 1: ROUTING
const routes = [];

// SECTION 2: AUTH
const authState = null;

// SECTION 3: UI
export function App() {
  return <div>App</div>;
}

// SECTION 4: API
export const api = {};`;

    const contribA = {
      fileId: "f-1",
      userId: "u-1",
      memberId: "m-1",
      memberName: "Alice (Routing)",
      role: "frontend" as const,
      content: baseApp.replace("const routes = [];", 'const routes = ["/home", "/login"];'),
    };

    const contribB = {
      fileId: "f-2",
      userId: "u-2",
      memberId: "m-2",
      memberName: "Bob (Auth)",
      role: "backend" as const,
      content: baseApp.replace("const authState = null;", 'const authState = { user: "logged_in" };'),
    };

    const contribC = {
      fileId: "f-3",
      userId: "u-3",
      memberId: "m-3",
      memberName: "Charlie (UI)",
      role: "frontend" as const,
      content: baseApp.replace("<div>App</div>", "<div><Header /><App /><Footer /></div>"),
    };

    const contribD = {
      fileId: "f-4",
      userId: "u-4",
      memberId: "m-4",
      memberName: "Diana (API)",
      role: "lead" as const,
      content: baseApp.replace("export const api = {};", "export const api = { v: 2, endpoint: '/api/v2' };"),
    };

    const multiResult = multiPartyMerge(baseApp, [contribA, contribB, contribC, contribD]);

    expect(multiResult.hasConflict).toBe(false);
    expect(multiResult.contributors.length).toBe(4);
    expect(multiResult.mergedContent).toContain('const routes = ["/home", "/login"];');
    expect(multiResult.mergedContent).toContain('const authState = { user: "logged_in" };');
    expect(multiResult.mergedContent).toContain("<div><Header /><App /><Footer /></div>");
    expect(multiResult.mergedContent).toContain("export const api = { v: 2, endpoint: '/api/v2' };");
  });

  it("Case 6: should automatically resolve when two members produce identical changes", () => {
    const change = `function Login() { return <div>Shared Identical Fix</div>; }`;
    const result = threeWayMerge(baseLoginCode, change, change, {
      labelA: "Member A",
      labelB: "Member B",
    });

    expect(result.hasConflict).toBe(false);
    expect(result.mergedContent).toBe(change);
  });

  it("Case 7: should auto-resolve identical file creations and flag conflicting creations", () => {
    // 7a: Identical creation
    const codeNew = `export const config = { port: 3000 };`;
    const identicalResult = reconcileFileCreation([
      { memberName: "Dev A", role: "backend", content: codeNew },
      { memberName: "Dev B", role: "lead", content: codeNew },
    ]);
    expect(identicalResult.hasConflict).toBe(false);
    expect(identicalResult.mergedContent).toBe(codeNew);

    // 7b: Conflicting creation
    const conflictResult = reconcileFileCreation([
      { memberName: "Dev A", role: "backend", content: `export const port = 3000;` },
      { memberName: "Dev B", role: "frontend", content: `export const port = 8080;` },
    ]);
    expect(conflictResult.hasConflict).toBe(true);
  });

  it("Case 4 & CodeSync Preview: should detect Deletion vs Modification conflict", () => {
    const mockMembers: Member[] = [
      {
        id: "m-1",
        project_id: "p-1",
        user_id: "u-1",
        display_name: "Alice",
        email: "a@test.com",
        role: "frontend",
        branch_name: "main",
        working_area: "frontend",
        online: true,
        last_seen_at: new Date().toISOString(),
      },
      {
        id: "m-2",
        project_id: "p-1",
        user_id: "u-2",
        display_name: "Bob",
        email: "b@test.com",
        role: "frontend",
        branch_name: "main",
        working_area: "frontend",
        online: true,
        last_seen_at: new Date().toISOString(),
      },
    ];

    const mockSharedNodes: CodeNode[] = [
      {
        id: "node-login",
        project_id: "p-1",
        path: "frontend/src/Login.jsx",
        parent_path: "frontend/src",
        kind: "file",
        area: "frontend",
        owner_role: "frontend",
        status: "done",
        language: "javascript",
        content: baseLoginCode,
        updated_at: new Date().toISOString(),
        current_version_number: 1,
      },
    ];

    const memberFiles: MemberFile[] = [
      {
        id: "mf-del",
        project_id: "p-1",
        user_id: "u-1",
        member_id: "m-1",
        owner_role: "frontend",
        file_name: "Login.jsx",
        relative_path: "frontend/src/Login.jsx",
        file_type: "text/plain",
        language: "javascript",
        content: "",
        sync_status: "local_modified",
        last_modified: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_deleted: true,
      },
      {
        id: "mf-mod",
        project_id: "p-1",
        user_id: "u-2",
        member_id: "m-2",
        owner_role: "frontend",
        file_name: "Login.jsx",
        relative_path: "frontend/src/Login.jsx",
        file_type: "text/plain",
        language: "javascript",
        content: baseLoginCode + "\n// Bob added comment",
        sync_status: "local_modified",
        last_modified: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_deleted: false,
      },
    ];

    const preview = codeSyncService.buildCodeSyncPreview(
      "p-1",
      memberFiles,
      mockSharedNodes,
      mockMembers,
    );

    expect(preview.conflicts.length).toBe(1);
    expect(preview.conflicts[0].conflictType).toBe("deletion_vs_modification");
  });

  it("should calculate line diffs with correct additions, removals, and unchanged lines", () => {
    const oldCode = `line 1\nline 2\nline 3`;
    const newCode = `line 1\nline 2 modified\nline 3\nline 4 added`;

    const diff = computeLineDiff(oldCode, newCode);
    expect(diff.length).toBeGreaterThan(0);
    expect(diff.some((d) => d.type === "added")).toBe(true);
    expect(diff.some((d) => d.type === "unchanged")).toBe(true);
  });

  it("should compute consistent and deterministic content hashes", () => {
    const text1 = "const a = 1;";
    const text2 = "const a = 1;";
    const text3 = "const a = 2;";

    const hash1 = computeFastHash(text1);
    const hash2 = computeFastHash(text2);
    const hash3 = computeFastHash(text3);

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
  });

  it("Version History & Non-destructive Rollback: should create new version on rollback", async () => {
    const projectId = "proj-rollback-test";
    const filePath = "src/config.ts";

    // Simulate V1 and V2 CodeSync
    await codeSyncService.executeCodeSync(
      projectId,
      [
        {
          path: filePath,
          content: "export const env = 'dev';",
          area: "shared",
          ownerRole: "lead",
          language: "typescript",
        },
      ],
      "Alice Lead",
      "lead",
    );

    await codeSyncService.executeCodeSync(
      projectId,
      [
        {
          path: filePath,
          content: "export const env = 'prod';",
          area: "shared",
          ownerRole: "lead",
          language: "typescript",
        },
      ],
      "Bob Developer",
      "lead",
    );

    const history = await codeSyncService.getFileVersionHistory(projectId, filePath);
    expect(history.length).toBeGreaterThanOrEqual(2);

    // Rollback to V1
    const rollbackResult = await codeSyncService.rollbackFileVersion(
      projectId,
      filePath,
      1,
      "Alice Lead",
      "lead",
    );

    expect(rollbackResult.version_number).toBeGreaterThan(2);
    expect(rollbackResult.content).toBe("export const env = 'dev';");
    expect(rollbackResult.change_type).toBe("rollback");

    // Ensure all versions are still preserved in history
    const updatedHistory = await codeSyncService.getFileVersionHistory(projectId, filePath);
    expect(updatedHistory.some((v) => v.version_number === 1)).toBe(true);
    expect(updatedHistory.some((v) => v.version_number === 2)).toBe(true);
    expect(updatedHistory.some((v) => v.version_number === rollbackResult.version_number)).toBe(true);
  });

  it("Edge Case: Section Deletion vs. Modification Conflict should not silently delete or overwrite", () => {
    const baseCode = `const timeout = 5000;\nconsole.log("ready");`;
    const modifiedA = `const timeout = 10000;\nconsole.log("ready");`;
    const deletedB = `console.log("ready");`;

    const res = threeWayMerge(baseCode, modifiedA, deletedB, {
      labelA: "Member A (Modified)",
      labelB: "Member B (Deleted)",
    });

    expect(res.hasConflict).toBe(true);
    expect(res.conflicts.length).toBeGreaterThan(0);
    expect(res.mergedContent).toContain("<<<<<<< Member A (Modified)");
    expect(res.mergedContent).toContain("timeout = 10000;");
    expect(res.mergedContent).toContain("||||||| BASE VERSION");
    expect(res.mergedContent).toContain("timeout = 5000;");
    expect(res.mergedContent).toContain(">>>>>>> Member B (Deleted)");
  });

  it("Edge Case: Concurrent End-of-File Appends should trigger conflict", () => {
    const base = `line 1\nline 2`;
    const appendA = `line 1\nline 2\nline 3 (A)`;
    const appendB = `line 1\nline 2\nline 3 (B)`;

    const res = threeWayMerge(base, appendA, appendB, {
      labelA: "Member A",
      labelB: "Member B",
    });

    expect(res.hasConflict).toBe(true);
    expect(res.mergedContent).toContain("<<<<<<< Member A");
    expect(res.mergedContent).toContain("line 3 (A)");
    expect(res.mergedContent).toContain("line 3 (B)");
  });

  it("Edge Case: Null/undefined safety and polymorphic reconcileFileCreation", () => {
    // Null safety
    const resNull = threeWayMerge(null as any, null as any, null as any);
    expect(resNull.hasConflict).toBe(false);
    expect(resNull.mergedContent).toBe("");

    // Polymorphic reconcileFileCreation
    const resCreation1 = reconcileFileCreation([
      { memberName: "A", role: "frontend", content: "same code" },
      { memberName: "B", role: "frontend", content: "same code" },
    ]);
    expect(resCreation1.hasConflict).toBe(false);
    expect(resCreation1.mergedContent).toBe("same code");

    const resCreation2 = reconcileFileCreation("src/new.ts", [
      { memberName: "A", role: "frontend", content: "code A" },
      { memberName: "B", role: "frontend", content: "code B" },
    ]);
    expect(resCreation2.hasConflict).toBe(true);
    expect(resCreation2.mergedContent).toContain("code A");
  });
});
