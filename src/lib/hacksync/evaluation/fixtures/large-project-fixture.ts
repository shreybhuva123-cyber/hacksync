/**
 * HackSync Phase 6: Large Project Synthetic Fixture Generator
 * Generates a deterministic synthetic software project fixture containing:
 * - 100+ files across routes, services, database models, utilities, and tests
 * - 500+ symbols (functions, classes, interfaces, types)
 * - Layered architecture: API -> Service -> Repository -> Database
 * - Deterministic Git diffs and unit test suites
 * Used for performance profiling, dependency traversal, blast radius impact, and indexing latency.
 */

import type { BenchmarkProjectFixture, FixtureFile } from "../benchmark-types";

export class LargeProjectFixtureGenerator {
  /**
   * Generates a deterministic synthetic 100+ file, 500+ symbol project fixture.
   */
  static generate(projectSuffix = "large-enterprise-app"): BenchmarkProjectFixture {
    const files: FixtureFile[] = [];

    // 1. Core Configuration & Manifests
    files.push({
      path: "package.json",
      content: JSON.stringify(
        {
          name: projectSuffix,
          version: "2.5.0",
          dependencies: {
            express: "^4.19.2",
            pg: "^8.11.5",
            jsonwebtoken: "^9.0.2",
            zod: "^3.23.8",
          },
          devDependencies: {
            "bun-types": "latest",
          },
          scripts: {
            test: "bun test",
          },
        },
        null,
        2,
      ),
    });

    files.push({
      path: "tsconfig.json",
      content: JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            strict: true,
            esModuleInterop: true,
          },
          include: ["src/**/*"],
        },
        null,
        2,
      ),
    });

    // 2. Database & Repository Layer (20 files, ~100 symbols)
    const dbEntities = [
      "user", "account", "organization", "team", "membership",
      "project", "document", "task", "milestone", "comment",
      "invoice", "payment", "subscription", "plan", "coupon",
      "audit_log", "api_key", "webhook", "notification", "setting"
    ];

    for (const entity of dbEntities) {
      const Pascal = entity.charAt(0).toUpperCase() + entity.slice(1);
      files.push({
        path: `src/db/models/${entity}.model.ts`,
        content: `export interface ${Pascal}Entity {
  id: string;
  name: string;
  status: "active" | "inactive" | "archived";
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Create${Pascal}Dto {
  name: string;
  status?: "active" | "inactive";
  metadata?: Record<string, unknown>;
}

export interface Update${Pascal}Dto {
  name?: string;
  status?: "active" | "inactive" | "archived";
  metadata?: Record<string, unknown>;
}

export type ${Pascal}Filter = Partial<${Pascal}Entity>;
`,
      });

      files.push({
        path: `src/db/repositories/${entity}.repository.ts`,
        content: `import type { ${Pascal}Entity, Create${Pascal}Dto, Update${Pascal}Dto } from "../models/${entity}.model";

export class ${Pascal}Repository {
  async findById(id: string): Promise<${Pascal}Entity | null> {
    return { id, name: "${entity}_sample", status: "active", metadata: {}, createdAt: new Date(), updatedAt: new Date() };
  }

  async findMany(limit = 20, offset = 0): Promise<${Pascal}Entity[]> {
    return [];
  }

  async create(dto: Create${Pascal}Dto): Promise<${Pascal}Entity> {
    return { id: "new_id", name: dto.name, status: dto.status || "active", metadata: dto.metadata || {}, createdAt: new Date(), updatedAt: new Date() };
  }

  async update(id: string, dto: Update${Pascal}Dto): Promise<${Pascal}Entity | null> {
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    return true;
  }
}
`,
      });
    }

    // 3. Domain Services Layer (20 files, ~120 symbols)
    for (const entity of dbEntities) {
      const Pascal = entity.charAt(0).toUpperCase() + entity.slice(1);
      files.push({
        path: `src/services/${entity}.service.ts`,
        content: `import { ${Pascal}Repository } from "../db/repositories/${entity}.repository";
import type { ${Pascal}Entity, Create${Pascal}Dto } from "../db/models/${entity}.model";

export class ${Pascal}Service {
  private repo = new ${Pascal}Repository();

  async get${Pascal}(id: string): Promise<${Pascal}Entity | null> {
    return await this.repo.findById(id);
  }

  async list${Pascal}s(page = 1, pageSize = 20): Promise<${Pascal}Entity[]> {
    const offset = (page - 1) * pageSize;
    return await this.repo.findMany(pageSize, offset);
  }

  async create${Pascal}(dto: Create${Pascal}Dto): Promise<${Pascal}Entity> {
    if (!dto.name || dto.name.trim() === "") {
      throw new Error("Invalid ${entity} name");
    }
    return await this.repo.create(dto);
  }

  async remove${Pascal}(id: string): Promise<boolean> {
    return await this.repo.delete(id);
  }
}
`,
      });
    }

    // 4. API Routes & Controllers (20 files, ~100 symbols)
    for (const entity of dbEntities) {
      const Pascal = entity.charAt(0).toUpperCase() + entity.slice(1);
      files.push({
        path: `src/routes/${entity}.routes.ts`,
        content: `import { ${Pascal}Service } from "../services/${entity}.service";

export function register${Pascal}Routes(app: any) {
  const service = new ${Pascal}Service();

  app.get("/api/v1/${entity}/:id", async (req: any, res: any) => {
    const item = await service.get${Pascal}(req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    return res.json({ data: item });
  });

  app.get("/api/v1/${entity}", async (req: any, res: any) => {
    const items = await service.list${Pascal}s(req.query.page, req.query.pageSize);
    return res.json({ data: items });
  });

  app.post("/api/v1/${entity}", async (req: any, res: any) => {
    const item = await service.create${Pascal}(req.body);
    return res.status(201).json({ data: item });
  });

  app.delete("/api/v1/${entity}/:id", async (req: any, res: any) => {
    await service.remove${Pascal}(req.params.id);
    return res.status(204).send();
  });
}
`,
      });
    }

    // 5. Utility & Security Layer (15 files, ~90 symbols)
    const utils = [
      "hash", "jwt", "crypto", "validator", "sanitizer",
      "logger", "metrics", "cache", "rate_limiter", "email",
      "sms", "storage", "queue", "lock", "format"
    ];

    for (const u of utils) {
      const Pascal = u.charAt(0).toUpperCase() + u.slice(1);
      files.push({
        path: `src/utils/${u}.ts`,
        content: `export function ${u}Process(input: string): string {
  return "proc_" + input;
}

export function ${u}Validate(value: unknown): boolean {
  return value !== null && value !== undefined;
}

export function ${u}Transform<T>(data: T): T {
  return data;
}

export interface ${Pascal}Config {
  enabled: boolean;
  ttlSeconds: number;
}
`,
      });
    }

    // 6. Unit Test Suites (15 files, ~60 symbols)
    for (let i = 0; i < 15; i++) {
      const entity = dbEntities[i]!;
      const Pascal = entity.charAt(0).toUpperCase() + entity.slice(1);
      files.push({
        path: `src/tests/${entity}.test.ts`,
        content: `import { describe, it, expect } from "bun:test";
import { ${Pascal}Service } from "../services/${entity}.service";

describe("${Pascal}Service", () => {
  it("should initialize ${entity} service properly", () => {
    const service = new ${Pascal}Service();
    expect(service).toBeDefined();
  });

  it("should reject invalid ${entity} creation", async () => {
    const service = new ${Pascal}Service();
    try {
      await service.create${Pascal}({ name: "" });
      expect(true).toBe(false);
    } catch {
      expect(true).toBe(true);
    }
  });
});
`,
      });
    }

    // Deterministic Git Diff representing a safe refactoring
    const gitDiff = `diff --git a/src/services/user.service.ts b/src/services/user.service.ts
--- a/src/services/user.service.ts
+++ b/src/services/user.service.ts
@@ -10,3 +10,4 @@
   async getUser(id: string): Promise<UserEntity | null> {
+    if (!id) return null;
     return await this.repo.findById(id);
   }
`;

    return {
      id: `fix-${projectSuffix}`,
      name: projectSuffix,
      files,
      gitDiff,
    };
  }
}
