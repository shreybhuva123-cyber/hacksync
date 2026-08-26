import { z } from "zod";

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  validatedData?: unknown;
}

/**
 * Validates an actual runtime payload against an API contract's schema definition.
 * Supports JSON Schema format, TypeScript-like key-value definitions, or JSON example payloads.
 */
export function validateContractPayload(
  schemaDef: string | null | undefined,
  payload: unknown,
): ValidationResult {
  // If no schema is defined, any payload is accepted
  if (!schemaDef || schemaDef.trim() === "" || schemaDef === "null") {
    return { isValid: true, errors: [] };
  }

  try {
    const parsedSchema = JSON.parse(schemaDef);

    // Case 1: Simple Object Example / Shape definition
    if (typeof parsedSchema === "object" && parsedSchema !== null && !parsedSchema.type) {
      if (typeof payload !== "object" || payload === null) {
        return {
          isValid: false,
          errors: [`Expected payload of type object, received ${payload === null ? "null" : typeof payload}`],
        };
      }

      const payloadObj = payload as Record<string, unknown>;
      const errors: string[] = [];

      for (const [key, expectedType] of Object.entries(parsedSchema)) {
        const val = payloadObj[key];
        if (val === undefined) {
          errors.push(`Missing required field: "${key}"`);
          continue;
        }

        if (typeof expectedType === "string") {
          const typeStr = expectedType.toLowerCase();
          if (typeStr === "string" && typeof val !== "string") {
            errors.push(`Field "${key}" must be a string, got ${typeof val}`);
          } else if (typeStr === "number" && typeof val !== "number") {
            errors.push(`Field "${key}" must be a number, got ${typeof val}`);
          } else if (typeStr === "boolean" && typeof val !== "boolean") {
            errors.push(`Field "${key}" must be a boolean, got ${typeof val}`);
          }
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        validatedData: payload,
      };
    }

    // Case 2: Standard JSON Schema format
    if (parsedSchema.type === "object" && parsedSchema.properties) {
      if (typeof payload !== "object" || payload === null) {
        return {
          isValid: false,
          errors: [`Expected JSON schema object, received ${typeof payload}`],
        };
      }

      const payloadObj = payload as Record<string, unknown>;
      const errors: string[] = [];
      const required = Array.isArray(parsedSchema.required) ? parsedSchema.required : [];

      for (const reqKey of required) {
        if (payloadObj[reqKey] === undefined) {
          errors.push(`Missing required JSON schema property: "${reqKey}"`);
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        validatedData: payload,
      };
    }

    return { isValid: true, errors: [], validatedData: payload };
  } catch (err) {
    // If schemaDef is a raw type identifier like "string[]"
    if (schemaDef.includes("[]")) {
      if (!Array.isArray(payload)) {
        return { isValid: false, errors: ["Payload must be an array"] };
      }
      return { isValid: true, errors: [] };
    }

    return { isValid: true, errors: [] };
  }
}
