/**
 * HackSync Phase 8: Production Validation Fixtures
 * Generates deterministic, multi-language, realistic software repositories:
 * - Small: 25-40 files, ~150-200 symbols (TypeScript, TSX, Python, SQL, JSON, tests)
 * - Medium: 120-180 files, ~800-1,200 symbols (multi-tier API, services, models, workers)
 * - Large: 500+ files, 2,000+ symbols (enterprise monolith, multi-domain, deep dependency graph)
 */

import { ProjectKnowledgeGraph } from "@/lib/hacksync/intelligence/knowledge-graph";

export interface SyntheticFile {
  path: string;
  content: string;
}

export interface RepoBenchmarkMetadata {
  name: string;
  tier: "small" | "medium" | "large";
  fileCount: number;
  symbolCount: number;
  languages: string[];
}

export class RepositoryFixtures {
  /**
   * Generates a Small Repository: 30 files, ~150 symbols.
   * Covers: TypeScript, TSX, Python worker, SQL schema, package.json, tsconfig.json, Vitest unit tests.
   */
  static generateSmallRepo(prefix = "small-app"): SyntheticFile[] {
    const files: SyntheticFile[] = [];

    // Manifests & Configs
    files.push({
      path: "package.json",
      content: JSON.stringify(
        {
          name: prefix,
          version: "1.0.0",
          dependencies: {
            express: "^4.19.2",
            zod: "^3.23.8",
            jsonwebtoken: "^9.0.2",
          },
          devDependencies: {
            vitest: "^1.6.0",
            typescript: "^5.4.0",
          },
        },
        null,
        2
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
          },
        },
        null,
        2
      ),
    });

    // Database schema (SQL)
    files.push({
      path: "schema.sql",
      content: `
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'member',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE api_keys (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  key_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  action VARCHAR(100) NOT NULL,
  actor_id UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
`,
    });

    // Auth & Utilities (TypeScript)
    files.push({
      path: "src/auth/jwt.ts",
      content: `
import jwt from "jsonwebtoken";

export interface TokenPayload {
  userId: string;
  role: "admin" | "member";
}

export function signToken(payload: TokenPayload, secret: string): string {
  return jwt.sign(payload, secret, { expiresIn: "1h" });
}

export function verifyToken(token: string, secret: string): TokenPayload {
  return jwt.verify(token, secret) as TokenPayload;
}
`,
    });

    files.push({
      path: "src/auth/permissions.ts",
      content: `
export type Role = "admin" | "lead" | "member";

export interface PermissionCheck {
  role: Role;
  action: "read" | "write" | "delete";
}

export function canPerformAction(check: PermissionCheck): boolean {
  if (check.role === "admin") return true;
  if (check.role === "lead" && check.action !== "delete") return true;
  return check.action === "read";
}
`,
    });

    // Models & Entities (TypeScript)
    const entities = ["user", "project", "membership", "task", "comment", "invoice", "notification", "audit"];
    for (const entity of entities) {
      const Pascal = entity.charAt(0).toUpperCase() + entity.slice(1);
      files.push({
        path: `src/models/${entity}.ts`,
        content: `
export type ${Pascal}Id = string;
export type ${Pascal}Status = "active" | "archived" | "pending";

export interface ${Pascal}Model {
  id: ${Pascal}Id;
  name: string;
  status: ${Pascal}Status;
  createdAt: Date;
}

export interface ${Pascal}Filter {
  status?: ${Pascal}Status;
  search?: string;
}

export function format${Pascal}(model: ${Pascal}Model): string {
  return model.name + " (" + model.status + ")";
}

export class ${Pascal}Repository {
  async findById(id: ${Pascal}Id): Promise<${Pascal}Model | null> {
    return { id, name: "${entity}", status: "active", createdAt: new Date() };
  }

  async save(model: ${Pascal}Model): Promise<${Pascal}Model> {
    return model;
  }
}
`,
      });

      files.push({
        path: `src/services/${entity}.service.ts`,
        content: `
import { ${Pascal}Repository, ${Pascal}Model } from "../models/${entity}";

export class ${Pascal}Service {
  constructor(private readonly repo: ${Pascal}Repository) {}

  async get${Pascal}(id: string): Promise<${Pascal}Model | null> {
    return this.repo.findById(id);
  }

  async create${Pascal}(name: string): Promise<${Pascal}Model> {
    return this.repo.save({ id: "gen-id", name, status: "active", createdAt: new Date() });
  }
}
`,
      });

      files.push({
        path: `src/tests/${entity}.test.ts`,
        content: `
import { describe, it, expect } from "vitest";
import { ${Pascal}Repository } from "../models/${entity}";
import { ${Pascal}Service } from "../services/${entity}.service";

describe("${Pascal}Service", () => {
  it("should fetch ${entity} by id", async () => {
    const repo = new ${Pascal}Repository();
    const service = new ${Pascal}Service(repo);
    const res = await service.get${Pascal}("test-1");
    expect(res?.id).toBe("test-1");
  });
});
`,
      });
    }

    // UI Components (TSX)
    files.push({
      path: "src/components/UserCard.tsx",
      content: `
import React from "react";
import type { UserModel } from "../models/user";

export interface UserCardProps {
  user: UserModel;
  onSelect?: (id: string) => void;
}

export const UserCard: React.FC<UserCardProps> = ({ user, onSelect }) => {
  return (
    <div className="card" onClick={() => onSelect?.(user.id)}>
      <h4>{user.name}</h4>
      <span>{user.status}</span>
    </div>
  );
};
`,
    });

    files.push({
      path: "src/components/ProjectList.tsx",
      content: `
import React from "react";
import type { ProjectModel } from "../models/project";

export interface ProjectListProps {
  projects: ProjectModel[];
}

export function ProjectList({ projects }: ProjectListProps) {
  return (
    <ul>
      {projects.map(p => (
        <li key={p.id}>{p.name}</li>
      ))}
    </ul>
  );
}
`,
    });

    // Python Background Worker
    files.push({
      path: "workers/metrics_collector.py",
      content: `
import json
import time

class MetricsCollector:
    def __init__(self, prefix: str):
        self.prefix = prefix
        self.samples = []

    def record_sample(self, metric_name: str, value: float):
        timestamp = time.time()
        self.samples.append({"name": f"{self.prefix}.{metric_name}", "value": value, "ts": timestamp})

    def flush(self) -> str:
        data = json.dumps(self.samples)
        self.samples = []
        return data

def run_collector():
    collector = MetricsCollector("app")
    collector.record_sample("cpu", 12.5)
    return collector.flush()
`,
    });

    return files;
  }

  /**
   * Generates a Medium Repository: ~150 files, ~900 symbols.
   * Multi-tier architecture: Config, DB models, Repositories, Domain Services, REST Controllers,
   * Auth middleware, Rate limiters, Python ETL worker, TSX Views, and Test Suites.
   */
  static generateMediumRepo(prefix = "medium-saas"): SyntheticFile[] {
    const files: SyntheticFile[] = [];

    // Core configs
    files.push({
      path: "package.json",
      content: JSON.stringify(
        {
          name: prefix,
          version: "2.1.0",
          dependencies: {
            express: "^4.19.2",
            pg: "^8.11.5",
            zod: "^3.23.8",
            jsonwebtoken: "^9.0.2",
          },
          devDependencies: {
            vitest: "^1.6.0",
            typescript: "^5.4.0",
          },
        },
        null,
        2
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
          },
        },
        null,
        2
      ),
    });

    // Database migrations (SQL)
    files.push({
      path: "migrations/001_initial.sql",
      content: `
CREATE TABLE tenants (id UUID PRIMARY KEY, name VARCHAR(100) NOT NULL);
CREATE TABLE users (id UUID PRIMARY KEY, tenant_id UUID REFERENCES tenants(id), email VARCHAR(255) NOT NULL);
CREATE TABLE api_keys (id UUID PRIMARY KEY, tenant_id UUID REFERENCES tenants(id), hash VARCHAR(255) NOT NULL);
CREATE TABLE audit_records (id UUID PRIMARY KEY, tenant_id UUID, action VARCHAR(100), created_at TIMESTAMP);
`,
    });

    // 25 Domain Entities x 5 files each = 125 files (~750 symbols)
    const domainEntities = [
      "user", "tenant", "organization", "membership", "role",
      "project", "repository", "branch", "commit", "diff",
      "pull_request", "review", "comment", "label", "milestone",
      "issue", "workflow", "job", "step", "artifact",
      "audit_event", "subscription", "invoice", "payment", "webhook"
    ];

    for (const entity of domainEntities) {
      const Pascal = entity.split("_").map(s => s.charAt(0).toUpperCase() + s.slice(1)).join("");

      // 1. Model
      files.push({
        path: `src/models/${entity}.model.ts`,
        content: `
export type ${Pascal}Id = string;
export type ${Pascal}Status = "active" | "suspended" | "deleted";

export interface ${Pascal}Entity {
  id: ${Pascal}Id;
  tenantId: string;
  name: string;
  status: ${Pascal}Status;
  metadata: Record<string, string>;
  createdAt: Date;
}

export type Create${Pascal}Input = Omit<${Pascal}Entity, "id" | "createdAt">;
export type Update${Pascal}Input = Partial<Create${Pascal}Input>;

export interface ${Pascal}Filter {
  status?: ${Pascal}Status;
  search?: string;
}

export function validate${Pascal}Name(name: string): boolean {
  return name.length > 0;
}
`,
      });

      // 2. Repository
      files.push({
        path: `src/repositories/${entity}.repository.ts`,
        content: `
import { ${Pascal}Entity, Create${Pascal}Input, Update${Pascal}Input } from "../models/${entity}.model";

export class ${Pascal}Repository {
  async getById(tenantId: string, id: string): Promise<${Pascal}Entity | null> {
    return { id, tenantId, name: "${entity}", status: "active", metadata: {}, createdAt: new Date() };
  }

  async list(tenantId: string): Promise<${Pascal}Entity[]> {
    return [];
  }

  async create(input: Create${Pascal}Input): Promise<${Pascal}Entity> {
    return { ...input, id: "uuid-auto", createdAt: new Date() };
  }

  async update(id: string, input: Update${Pascal}Input): Promise<${Pascal}Entity> {
    return { id, tenantId: "t1", name: "${entity}", status: "active", metadata: {}, createdAt: new Date(), ...input };
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    return true;
  }
}
`,
      });

      // 3. Service
      files.push({
        path: `src/services/${entity}.service.ts`,
        content: `
import { ${Pascal}Repository } from "../repositories/${entity}.repository";
import { ${Pascal}Entity, Create${Pascal}Input } from "../models/${entity}.model";

export class ${Pascal}Service {
  constructor(private readonly repo: ${Pascal}Repository) {}

  async fetch(tenantId: string, id: string): Promise<${Pascal}Entity | null> {
    return this.repo.getById(tenantId, id);
  }

  async register(input: Create${Pascal}Input): Promise<${Pascal}Entity> {
    if (!input.name) throw new Error("Name is required");
    return this.repo.create(input);
  }
}
`,
      });

      // 4. Controller
      files.push({
        path: `src/controllers/${entity}.controller.ts`,
        content: `
import { ${Pascal}Service } from "../services/${entity}.service";

export class ${Pascal}Controller {
  constructor(private readonly service: ${Pascal}Service) {}

  async handleGet(req: { tenantId: string; id: string }) {
    return this.service.fetch(req.tenantId, req.id);
  }
}
`,
      });

      // 5. Test
      files.push({
        path: `src/tests/${entity}.test.ts`,
        content: `
import { describe, it, expect } from "vitest";
import { ${Pascal}Repository } from "../repositories/${entity}.repository";
import { ${Pascal}Service } from "../services/${entity}.service";

describe("${Pascal}Service Tests", () => {
  it("should create and fetch ${entity}", async () => {
    const repo = new ${Pascal}Repository();
    const service = new ${Pascal}Service(repo);
    const created = await service.register({ tenantId: "t1", name: "Sample", status: "active", metadata: {} });
    expect(created.name).toBe("Sample");
  });
});
`,
      });
    }

    // TSX UI Views
    files.push({
      path: "src/views/DashboardView.tsx",
      content: `
import React from "react";

export interface DashboardViewProps {
  tenantName: string;
  activeUsers: number;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ tenantName, activeUsers }) => {
  return (
    <div className="dashboard-root">
      <h1>{tenantName}</h1>
      <p>Active Users: {activeUsers}</p>
    </div>
  );
};
`,
    });

    files.push({
      path: "src/views/SettingsView.tsx",
      content: `
import React from "react";

export function SettingsView() {
  return <div className="settings-panel"><h2>Settings</h2></div>;
}
`,
    });

    // Python Analytics Worker
    files.push({
      path: "workers/analytics_processor.py",
      content: `
import json
import typing

class AnalyticsProcessor:
    def __init__(self, tenant_id: str):
        self.tenant_id = tenant_id

    def process_batch(self, events: typing.List[typing.Dict[str, typing.Any]]) -> int:
        count = len(events)
        return count

def run_etl(events_json: str) -> int:
    events = json.loads(events_json)
    processor = AnalyticsProcessor("default-tenant")
    return processor.process_batch(events)
`,
    });

    return files;
  }

  /**
   * Generates a Large Repository: 520+ files, 2,100+ symbols.
   * Enterprise monolithic platform across 10 business domains, with multi-language
   * files (TypeScript, TSX, Python, SQL, JSON) and deep cross-file dependency graph.
   */
  static generateLargeRepo(prefix = "large-enterprise-platform"): SyntheticFile[] {
    const files: SyntheticFile[] = [];

    // Core configs
    files.push({
      path: "package.json",
      content: JSON.stringify(
        {
          name: prefix,
          version: "4.0.0",
          workspaces: ["packages/*"],
          dependencies: {
            express: "^4.19.2",
            pg: "^8.11.5",
            zod: "^3.23.8",
            jsonwebtoken: "^9.0.2",
            react: "^18.3.1",
          },
          devDependencies: {
            vitest: "^1.6.0",
            typescript: "^5.4.0",
          },
        },
        null,
        2
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
            moduleResolution: "NodeNext",
          },
        },
        null,
        2
      ),
    });

    const domains = [
      "identity", "billing", "projects", "notifications", "analytics",
      "integrations", "storage", "governance", "security", "reporting"
    ];

    for (const domain of domains) {
      // Domain SQL Schema
      files.push({
        path: `migrations/${domain}_schema.sql`,
        content: `
CREATE TABLE ${domain}_audit (
  id UUID PRIMARY KEY,
  action VARCHAR(100) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
`,
      });

      // Domain Python ETL Script
      files.push({
        path: `scripts/${domain}_worker.py`,
        content: `
class ${domain.toUpperCase()}_Worker:
    def __init__(self):
        self.domain = "${domain}"

    def execute_job(self, payload: dict) -> bool:
        return True

def run_${domain}():
    worker = ${domain.toUpperCase()}_Worker()
    return worker.execute_job({})
`,
      });

      for (let i = 1; i <= 10; i++) {
        const entityName = `${domain}_item_${i}`;
        const Pascal = `${domain.charAt(0).toUpperCase() + domain.slice(1)}Item${i}`;

        // Model
        files.push({
          path: `src/domains/${domain}/models/${entityName}.ts`,
          content: `
export type ${Pascal}Id = string;
export type ${Pascal}Status = "pending" | "ready" | "failed";

export interface ${Pascal}Entity {
  id: ${Pascal}Id;
  domain: "${domain}";
  index: number;
  active: boolean;
  timestamp: Date;
}

export interface Create${Pascal}Dto {
  index: number;
  active?: boolean;
}

export interface ${Pascal}Summary {
  id: ${Pascal}Id;
  status: ${Pascal}Status;
}

export function is${Pascal}Valid(dto: Create${Pascal}Dto): boolean {
  return dto.index >= 0;
}

export class ${Pascal}Validator {
  static validate(dto: Create${Pascal}Dto): boolean {
    return is${Pascal}Valid(dto);
  }
}
`,
        });

        // Repository
        files.push({
          path: `src/domains/${domain}/repos/${entityName}.repo.ts`,
          content: `
import { ${Pascal}Entity, Create${Pascal}Dto } from "../models/${entityName}";

export class ${Pascal}Repository {
  private readonly items = new Map<string, ${Pascal}Entity>();

  async find(id: string): Promise<${Pascal}Entity | null> {
    return this.items.get(id) || null;
  }

  async insert(dto: Create${Pascal}Dto): Promise<${Pascal}Entity> {
    const item: ${Pascal}Entity = {
      id: "id-" + dto.index,
      domain: "${domain}",
      index: dto.index,
      active: dto.active ?? true,
      timestamp: new Date(),
    };
    this.items.set(item.id, item);
    return item;
  }
}
`,
        });

        // Service
        files.push({
          path: `src/domains/${domain}/services/${entityName}.service.ts`,
          content: `
import { ${Pascal}Repository } from "../repos/${entityName}.repo";
import { ${Pascal}Entity, Create${Pascal}Dto, ${Pascal}Validator } from "../models/${entityName}";

export class ${Pascal}Service {
  constructor(private readonly repo: ${Pascal}Repository) {}

  async process(dto: Create${Pascal}Dto): Promise<${Pascal}Entity> {
    if (!${Pascal}Validator.validate(dto)) {
      throw new Error("Validation failed");
    }
    return this.repo.insert(dto);
  }

  async retrieve(id: string): Promise<${Pascal}Entity | null> {
    return this.repo.find(id);
  }
}
`,
        });

        // Controller
        files.push({
          path: `src/domains/${domain}/controllers/${entityName}.ctrl.ts`,
          content: `
import { ${Pascal}Service } from "../services/${entityName}.service";
import { Create${Pascal}Dto } from "../models/${entityName}";

export class ${Pascal}Controller {
  constructor(private readonly service: ${Pascal}Service) {}

  async handlePost(dto: Create${Pascal}Dto) {
    return this.service.process(dto);
  }
}
`,
        });

        // Test
        files.push({
          path: `src/domains/${domain}/tests/${entityName}.test.ts`,
          content: `
import { describe, it, expect } from "vitest";
import { ${Pascal}Repository } from "../repos/${entityName}.repo";
import { ${Pascal}Service } from "../services/${entityName}.service";

describe("${Pascal} Tests", () => {
  it("should process item correctly", async () => {
    const repo = new ${Pascal}Repository();
    const service = new ${Pascal}Service(repo);
    const res = await service.process({ index: ${i} });
    expect(res.index).toBe(${i});
  });
});
`,
        });
      }
    }

    // Shared React TSX Components (10 files)
    for (const domain of domains) {
      const PascalDomain = domain.charAt(0).toUpperCase() + domain.slice(1);
      files.push({
        path: `src/ui/${domain}Card.tsx`,
        content: `
import React from "react";

export interface ${PascalDomain}CardProps {
  title: string;
  count: number;
}

export const ${PascalDomain}Card: React.FC<${PascalDomain}CardProps> = ({ title, count }) => {
  return (
    <div className="domain-card">
      <h3>{title}</h3>
      <span>Total: {count}</span>
    </div>
  );
};
`,
      });
    }

    return files;
  }

  /**
   * Helper to index a list of SyntheticFiles into a ProjectKnowledgeGraph
   * and measure performance timings.
   */
  static indexFiles(
    graph: ProjectKnowledgeGraph,
    files: SyntheticFile[]
  ): { fileCount: number; symbolCount: number; durationMs: number } {
    const start = performance.now();
    for (const file of files) {
      graph.indexFile(file.path, file.content);
    }
    const durationMs = Math.round(performance.now() - start);
    const symbolCount = graph.getSymbolIndex().size();

    return {
      fileCount: files.length,
      symbolCount,
      durationMs,
    };
  }
}
