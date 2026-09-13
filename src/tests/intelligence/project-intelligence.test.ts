import { describe, it, expect, beforeEach } from "bun:test";
import { TypeScriptParser } from "@/lib/hacksync/intelligence/parsers/typescript-parser";
import { JavaScriptParser } from "@/lib/hacksync/intelligence/parsers/javascript-parser";
import { PythonParser } from "@/lib/hacksync/intelligence/parsers/python-parser";
import { SqlParser } from "@/lib/hacksync/intelligence/parsers/sql-parser";
import { JsonParser } from "@/lib/hacksync/intelligence/parsers/json-parser";
import { ModuleResolver } from "@/lib/hacksync/intelligence/module-resolver";
import { SymbolIndex } from "@/lib/hacksync/intelligence/symbol-index";
import { ProjectDependencyGraph } from "@/lib/hacksync/intelligence/dependency-graph";
import { ArchitectureDetector } from "@/lib/hacksync/intelligence/architecture-detector";
import { HybridRetrievalEngine } from "@/lib/hacksync/intelligence/retrieval-engine";
import { ProjectContextBuilder } from "@/lib/hacksync/intelligence/context-builder";
import { ProjectKnowledgeGraph } from "@/lib/hacksync/intelligence/knowledge-graph";
import { ProjectIndexManager } from "@/lib/hacksync/intelligence/project-index-manager";
import { AIOrchestrator } from "@/lib/hacksync/ai/orchestrator";

describe("Phase 1: Real Project Intelligence Engine", () => {
  // ───────────────────────────────────────────────────────────────────────────
  // 1. AST Parsers (TypeScript, TSX, JavaScript, JSX, Python, SQL, JSON)
  // ───────────────────────────────────────────────────────────────────────────
  describe("AST Code Parsers", () => {
    it("should parse TypeScript using real Compiler API and extract functions, classes, methods, and types", () => {
      const parser = new TypeScriptParser();
      const code = `
        import { useState } from "react";
        import axios from "axios";

        export interface UserDto {
          id: string;
          email: string;
        }

        export type Role = "admin" | "member";

        export enum Status {
          Active = "ACTIVE",
          Inactive = "INACTIVE",
        }

        export class AuthService {
          async login(credentials: { email: string; pass: string }): Promise<UserDto> {
            const res = await axios.post("/api/login", credentials);
            return res.data;
          }
        }

        export const useAuth = () => {
          return useState<UserDto | null>(null);
        };

        export function UserProfileCard({ user }: { user: UserDto }) {
          return <div>{user.email}</div>;
        }
      `;

      const summary = parser.parse("src/components/UserProfileCard.tsx", code);
      expect(summary.language).toBe("tsx");
      expect(summary.imports.length).toBe(2);

      // Verify symbols
      const symbols = summary.symbols;
      expect(symbols.some((s) => s.name === "UserDto" && s.kind === "interface")).toBe(true);
      expect(symbols.some((s) => s.name === "Role" && s.kind === "type")).toBe(true);
      expect(symbols.some((s) => s.name === "Status" && s.kind === "enum")).toBe(true);
      expect(symbols.some((s) => s.name === "AuthService" && s.kind === "class")).toBe(true);
      expect(symbols.some((s) => s.name === "login" && s.kind === "method" && s.parentSymbol === "AuthService")).toBe(true);
      expect(symbols.some((s) => s.name === "useAuth" && s.kind === "hook")).toBe(true);
      expect(symbols.some((s) => s.name === "UserProfileCard" && s.kind === "component")).toBe(true);

      // Line numbers must be exact and valid
      const loginMethod = symbols.find((s) => s.name === "login");
      expect(loginMethod).toBeDefined();
      expect(loginMethod!.lineStart).toBeGreaterThan(15);
      expect(loginMethod!.lineEnd).toBeGreaterThanOrEqual(loginMethod!.lineStart);
    });

    it("should parse JavaScript/JSX and extract React components", () => {
      const parser = new JavaScriptParser();
      const code = `
        import React from 'react';
        export function Header({ title }) {
          return <header><h1>{title}</h1></header>;
        }
      `;
      const summary = parser.parse("src/components/Header.jsx", code);
      expect(summary.language).toBe("jsx");
      expect(summary.symbols.some((s) => s.name === "Header" && s.kind === "component")).toBe(true);
      expect(summary.exports.some((e) => e.name === "Header")).toBe(true);
    });

    it("should parse Python files and extract functions, classes, decorators, and FastAPI routes", () => {
      const parser = new PythonParser();
      const code = `
from fastapi import FastAPI, Depends
from typing import List

app = FastAPI()

class DatabaseManager:
    def connect(self):
        pass

@app.get("/api/v1/users")
def list_users(limit: int = 10) -> List[dict]:
    return [{"id": 1}]
      `;
      const summary = parser.parse("backend/main.py", code);
      expect(summary.language).toBe("python");
      expect(summary.symbols.some((s) => s.name === "DatabaseManager" && s.kind === "class")).toBe(true);
      expect(summary.symbols.some((s) => s.name === "list_users" && s.kind === "function")).toBe(true);
      expect(summary.apiRoutes.length).toBe(1);
      expect(summary.apiRoutes[0]?.method).toBe("GET");
      expect(summary.apiRoutes[0]?.path).toBe("/api/v1/users");
    });

    it("should parse SQL schema files, extract table definitions and foreign key calls", () => {
      const parser = new SqlParser();
      const sql = `
        CREATE TABLE organizations (
          id UUID PRIMARY KEY,
          name TEXT NOT NULL
        );

        CREATE TABLE members (
          id UUID PRIMARY KEY,
          org_id UUID REFERENCES organizations(id),
          email TEXT NOT NULL
        );
      `;
      const summary = parser.parse("migrations/001_init.sql", sql);
      expect(summary.symbols.length).toBe(2);
      const membersTable = summary.symbols.find((s) => s.name === "members");
      expect(membersTable).toBeDefined();
      expect(membersTable?.calls).toContain("organizations");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Module Resolver
  // ───────────────────────────────────────────────────────────────────────────
  describe("ModuleResolver", () => {
    const knownFiles = [
      "src/index.ts",
      "src/utils/math.ts",
      "src/components/Button/index.tsx",
      "src/services/user-service.ts",
      "package.json",
    ];

    it("should resolve relative imports with various candidate extensions", () => {
      const resolved = ModuleResolver.resolve("src/services/user-service.ts", "../utils/math", knownFiles);
      expect(resolved.isExternal).toBe(false);
      expect(resolved.unresolved).toBe(false);
      expect(resolved.resolvedPath).toBe("src/utils/math.ts");
    });

    it("should resolve directory index files", () => {
      const resolved = ModuleResolver.resolve("src/index.ts", "./components/Button", knownFiles);
      expect(resolved.resolvedPath).toBe("src/components/Button/index.tsx");
      expect(resolved.unresolved).toBe(false);
    });

    it("should resolve '@/ ' path aliases", () => {
      const resolved = ModuleResolver.resolve("src/services/user-service.ts", "@/utils/math", knownFiles);
      expect(resolved.resolvedPath).toBe("src/utils/math.ts");
    });

    it("should identify external 3rd-party packages", () => {
      const resolved = ModuleResolver.resolve("src/index.ts", "react", knownFiles);
      expect(resolved.isExternal).toBe(true);
      expect(resolved.resolvedPath).toBeNull();
      expect(resolved.unresolved).toBe(false);
    });

    it("should explicitly flag internal imports that cannot be resolved", () => {
      const resolved = ModuleResolver.resolve("src/index.ts", "./missing-module", knownFiles);
      expect(resolved.isExternal).toBe(false);
      expect(resolved.resolvedPath).toBeNull();
      expect(resolved.unresolved).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Project Dependency Graph & Cycle Detection
  // ───────────────────────────────────────────────────────────────────────────
  describe("ProjectDependencyGraph", () => {
    it("should record typed dependency edges and compute transitive impact radius", () => {
      const graph = new ProjectDependencyGraph("proj-test-1");

      // C depends on B, B depends on A
      graph.addEdge({ source: "src/c.ts", target: "src/b.ts", type: "IMPORTS", confidence: 95, sourceLine: 1 });
      graph.addEdge({ source: "src/b.ts", target: "src/a.ts", type: "IMPORTS", confidence: 95, sourceLine: 1 });

      expect(graph.getDirectDependencies("src/c.ts")).toEqual(["src/b.ts"]);
      expect(graph.getDirectDependents("src/a.ts")).toEqual(["src/b.ts"]);

      // Blast radius: changing src/a.ts affects src/b.ts and transitively src/c.ts
      const blastRadius = graph.getTransitiveDependents("src/a.ts");
      expect(blastRadius).toContain("src/b.ts");
      expect(blastRadius).toContain("src/c.ts");
    });

    it("should detect circular dependencies", () => {
      const graph = new ProjectDependencyGraph("proj-cycle-test");
      graph.addEdge({ source: "fileA.ts", target: "fileB.ts", type: "IMPORTS", confidence: 90, sourceLine: 1 });
      graph.addEdge({ source: "fileB.ts", target: "fileC.ts", type: "IMPORTS", confidence: 90, sourceLine: 1 });
      graph.addEdge({ source: "fileC.ts", target: "fileA.ts", type: "IMPORTS", confidence: 90, sourceLine: 1 });

      const cycles = graph.detectCycles();
      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0]).toContain("fileA.ts");
      expect(cycles[0]).toContain("fileB.ts");
      expect(cycles[0]).toContain("fileC.ts");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Project-Scoped Symbol Index & Isolation
  // ───────────────────────────────────────────────────────────────────────────
  describe("SymbolIndex & Project Isolation", () => {
    it("should index symbols and support exact and fuzzy searches", () => {
      const index = new SymbolIndex("proj-symbols");
      index.addSymbol({
        name: "authenticateUser",
        kind: "function",
        lineStart: 10,
        lineEnd: 25,
        isExported: true,
        filePath: "src/auth.ts",
      });
      index.addSymbol({
        name: "authorizeRole",
        kind: "function",
        lineStart: 28,
        lineEnd: 40,
        isExported: true,
        filePath: "src/auth.ts",
      });

      const exact = index.findExact("authenticateUser");
      expect(exact).toBeDefined();
      expect(exact?.filePath).toBe("src/auth.ts");

      const searchHits = index.search("auth", 5);
      expect(searchHits.length).toBe(2);
    });

    it("should clean up symbols when a file is removed", () => {
      const index = new SymbolIndex("proj-removal");
      index.addSymbol({
        name: "tempHelper",
        kind: "function",
        lineStart: 1,
        lineEnd: 5,
        isExported: false,
        filePath: "src/temp.ts",
      });

      expect(index.size()).toBe(1);
      index.removeSymbolsForFile("src/temp.ts");
      expect(index.size()).toBe(0);
      expect(index.getSymbolsByName("tempHelper")).toEqual([]);
    });

    it("should strictly isolate Project A from Project B in ProjectIndexManager", () => {
      ProjectIndexManager.clear();

      const graphA = ProjectIndexManager.getGraph("proj-alpha");
      const graphB = ProjectIndexManager.getGraph("proj-beta");

      graphA.indexFile("secret-alpha.ts", "export function alphaSecret() { return 42; }");
      graphB.indexFile("secret-beta.ts", "export function betaSecret() { return 99; }");

      expect(graphA.findSymbol("alphaSecret").length).toBe(1);
      expect(graphA.findSymbol("betaSecret").length).toBe(0);

      expect(graphB.findSymbol("betaSecret").length).toBe(1);
      expect(graphB.findSymbol("alphaSecret").length).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Architecture Detector
  // ───────────────────────────────────────────────────────────────────────────
  describe("ArchitectureDetector", () => {
    it("should classify files into architectural layers accurately", () => {
      const parser = new TypeScriptParser();

      const compSummary = parser.parse("src/components/Modal.tsx", "export function Modal() { return <div/>; }");
      const routeSummary = parser.parse("src/api/users/route.ts", "export async function GET() { return new Response(); }");
      const serviceSummary = parser.parse("src/services/payment.service.ts", "export class PaymentService {}");
      const testSummary = parser.parse("src/services/__tests__/payment.test.ts", "describe('pay', () => {});");

      expect(ArchitectureDetector.detectFileRole(compSummary)).toBe("component");
      expect(ArchitectureDetector.detectFileRole(routeSummary)).toBe("route");
      expect(ArchitectureDetector.detectFileRole(serviceSummary)).toBe("service");
      expect(ArchitectureDetector.detectFileRole(testSummary)).toBe("test");
    });

    it("should generate a complete architectural profile for a project", () => {
      const graph = new ProjectKnowledgeGraph("proj-profile");
      graph.indexFile("src/components/App.tsx", "export function App() { return <div>App</div>; }");
      graph.indexFile("src/api/items/route.ts", "export async function GET() { return new Response(); }");
      graph.indexFile("src/services/item.service.ts", "export class ItemService {}");
      graph.indexFile("schema.sql", "CREATE TABLE items (id UUID PRIMARY KEY, name TEXT);");

      const profile = graph.getArchitectureProfile();
      expect(profile.totalFiles).toBe(4);
      expect(profile.layerCounts.component).toBe(1);
      expect(profile.layerCounts.route).toBe(1);
      expect(profile.layerCounts.service).toBe(1);
      expect(profile.layerCounts.database).toBe(1);
      expect(profile.summaryText).toContain("Architecture Profile:");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Hybrid Retrieval Engine & Context Builder
  // ───────────────────────────────────────────────────────────────────────────
  describe("Hybrid Retrieval & Context Builder", () => {
    it("should rank exact symbol hits highest with multi-signal scoring", () => {
      const graph = new ProjectKnowledgeGraph("proj-retrieval");
      graph.indexFile(
        "src/services/billing-service.ts",
        `export class BillingService {
          calculateInvoice(amount: number) {
            return amount * 1.2;
          }
        }`,
      );
      graph.indexFile(
        "src/components/InvoiceView.tsx",
        `import { BillingService } from "../services/billing-service";
        export function InvoiceView() {
          return <div>Invoice</div>;
        }`,
      );

      const result = HybridRetrievalEngine.retrieve({
        query: "calculateInvoice",
        graph,
      });

      expect(result.hits.length).toBeGreaterThan(0);
      expect(result.hits[0]?.filePath).toBe("src/services/billing-service.ts");
      expect(result.hits[0]?.score).toBeGreaterThan(40);
      expect(result.hits[0]?.snippet).toContain("calculateInvoice");
    });

    it("should enforce token/character budget limit in ContextBuilder", () => {
      const graph = new ProjectKnowledgeGraph("proj-budget");
      graph.indexFile("src/large-file.ts", "export function large() {}\n".repeat(200));

      const retrieval = HybridRetrievalEngine.retrieve({ query: "large", graph });
      const built = ProjectContextBuilder.build(retrieval, [], undefined, { maxCharacters: 500 });

      expect(built.totalCharacters).toBeLessThanOrEqual(600); // with headings
      expect(built.hasSufficientEvidence).toBe(true);
    });

    it("should automatically redact secrets in context builder snippets", () => {
      const graph = new ProjectKnowledgeGraph("proj-redact");
      graph.indexFile(
        "src/config/keys.ts",
        `export const API_KEY = "sk-proj-supersecret1234567890abcdef";`,
      );

      const retrieval = HybridRetrievalEngine.retrieve({ query: "API_KEY", graph });
      const built = ProjectContextBuilder.build(retrieval, []);

      expect(built.formattedContext).not.toContain("sk-proj-supersecret1234567890abcdef");
      expect(built.formattedContext).toContain("[REDACTED_SECRET]");
    });

    it("should provide an honest fallback when insufficient evidence is found", () => {
      const graph = new ProjectKnowledgeGraph("proj-empty");
      const retrieval = HybridRetrievalEngine.retrieve({ query: "nonexistentConcept12345", graph });
      const built = ProjectContextBuilder.build(retrieval, []);

      expect(built.hasSufficientEvidence).toBe(false);
      expect(built.formattedContext).toContain("Insufficient project evidence found for query 'nonexistentConcept12345'");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Incremental Indexing & Hash Caching
  // ───────────────────────────────────────────────────────────────────────────
  describe("Incremental Indexing", () => {
    it("should skip re-parsing when file content is unchanged", () => {
      const graph = new ProjectKnowledgeGraph("proj-incremental");
      const content = "export function stableFunction() { return true; }";

      const firstPass = graph.indexFile("src/stable.ts", content);
      const secondPass = graph.indexFile("src/stable.ts", content);

      expect(firstPass).toBe(secondPass); // Identical reference, skipped re-parsing
    });

    it("should update AST and symbols when content changes", () => {
      const graph = new ProjectKnowledgeGraph("proj-update");
      graph.indexFile("src/mod.ts", "export function versionOne() {}");
      expect(graph.findSymbol("versionOne").length).toBe(1);

      graph.updateFile("src/mod.ts", "export function versionTwo() {}");
      expect(graph.findSymbol("versionOne").length).toBe(0);
      expect(graph.findSymbol("versionTwo").length).toBe(1);
    });

    it("should cleanly remove file from all indices on deleteFile", () => {
      const graph = new ProjectKnowledgeGraph("proj-delete");
      graph.indexFile("src/to-delete.ts", "export function doomed() {}");
      expect(graph.getAllFilePaths()).toContain("src/to-delete.ts");

      graph.deleteFile("src/to-delete.ts");
      expect(graph.getAllFilePaths()).not.toContain("src/to-delete.ts");
      expect(graph.findSymbol("doomed").length).toBe(0);
      expect(graph.getFileContent("src/to-delete.ts")).toBeUndefined();
    });
  });
});
