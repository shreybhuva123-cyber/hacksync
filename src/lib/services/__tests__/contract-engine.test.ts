import { describe, it, expect } from "bun:test";
import { contractEngine } from "@/lib/contracts/contract-engine";
import type { ApiContract } from "@/lib/hacksync/types";

describe("Contract Engine (Single Source of Truth Verification)", () => {
  it("should validate valid request payloads against contract schema", () => {
    const schema = JSON.stringify({
      type: "object",
      properties: {
        eventId: { type: "string" },
        attendeeCount: { type: "number" },
      },
      required: ["eventId"],
    });

    const validPayload = { eventId: "ev-101", attendeeCount: 4 };
    const res = contractEngine.validate(schema, validPayload);
    expect(res.isValid).toBe(true);
    expect(res.errors.length).toBe(0);
  });

  it("should reject payloads with missing required schema fields", () => {
    const schema = JSON.stringify({
      type: "object",
      properties: {
        eventId: { type: "string" },
      },
      required: ["eventId"],
    });

    const invalidPayload = { wrongField: 123 };
    const res = contractEngine.validate(schema, invalidPayload);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.includes("eventId"))).toBe(true);
  });

  it("should parse contract schema into structured property list", () => {
    const schema = JSON.stringify({
      name: "string",
      age: "number",
      active: "boolean",
    });

    const props = contractEngine.parseProperties(schema);
    expect(props.length).toBe(3);
    expect(props.find((p) => p.name === "name")?.type).toBe("string");
    expect(props.find((p) => p.name === "age")?.type).toBe("number");
    expect(props.find((p) => p.name === "active")?.type).toBe("boolean");
  });

  it("should generate TypeScript type definition from schema", () => {
    const schema = JSON.stringify({
      userId: "string",
      score: "number",
    });

    const typeDef = contractEngine.generateTypeDefinition("UserScoreResponse", schema);
    expect(typeDef).toContain("export interface UserScoreResponse");
    expect(typeDef).toContain("userId: string;");
    expect(typeDef).toContain("score: number;");
  });

  it("should generate valid OpenAPI 3.0 specification from contract list", () => {
    const contracts: ApiContract[] = [
      {
        id: "c1",
        project_id: "p1",
        route: "/api/users",
        method: "GET",
        version: "v1",
        summary: "Get users",
        status: "live",
        locked: true,
        auth_required: true,
        owner_role: "backend",
        request_schema: null,
        response_schema: JSON.stringify({ type: "object" }),
        test_status: "passing",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const spec = contractEngine.generateOpenApiSpec(contracts);
    expect(spec.openapi).toBe("3.0.0");
    expect(spec.paths["/api/users"]).toBeDefined();
    expect(spec.paths["/api/users"].get.summary).toBe("Get users");
  });

  it("should synthesize realistic JSON mock data from array and object JSON schema", () => {
    const arraySchema = JSON.stringify({
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
        },
      },
    });

    const mockData = contractEngine.generateMockData(arraySchema) as any[];
    expect(Array.isArray(mockData)).toBe(true);
    expect(mockData.length).toBeGreaterThan(0);
    expect(typeof mockData[0].id).toBe("string");
    expect(typeof mockData[0].title).toBe("string");
    expect(mockData[0].title).not.toContain("type");
  });

  it("should synthesize realistic mock data from object JSON schema", () => {
    const objSchema = JSON.stringify({
      type: "object",
      properties: {
        success: { type: "boolean" },
        attendeeId: { type: "string" },
      },
    });

    const mockObj = contractEngine.generateMockData(objSchema) as any;
    expect(typeof mockObj).toBe("object");
    expect(mockObj.success).toBe(true);
    expect(typeof mockObj.attendeeId).toBe("string");
  });
});
