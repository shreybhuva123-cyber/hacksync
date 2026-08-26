/**
 * HackSync Enterprise Error Architecture & Structured Logger
 * Provides strongly-typed domain errors with user-friendly messages and secure logging.
 */

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(message: string, code = "INTERNAL_ERROR", statusCode = 500, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "You must be authenticated to perform this operation.") {
    super(message, "UNAUTHENTICATED", 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "You do not have permission to perform this action in this project.") {
    super(message, "FORBIDDEN", 403);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, "VALIDATION_ERROR", 400, details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource", id?: string) {
    super(id ? `${resource} with ID "${id}" was not found.` : `${resource} was not found.`, "NOT_FOUND", 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "CONFLICT", 409);
  }
}

export class DatabaseError extends AppError {
  constructor(message = "A database operation failed.", details?: unknown) {
    super(message, "DATABASE_ERROR", 500, details);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Rate limit exceeded. Please wait a moment before trying again.") {
    super(message, "RATE_LIMITED", 429);
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string) {
    super(`${service} service error: ${message}`, "EXTERNAL_SERVICE_ERROR", 502);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Structured Production Logger (strips sensitive credentials/tokens)
// ─────────────────────────────────────────────────────────────────────────────

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogPayload {
  message: string;
  context?: Record<string, unknown> | undefined;
  error?: Error | unknown | undefined;
  projectId?: string | undefined;
  userId?: string | undefined;
}

const REDACTED_KEYS = new Set([
  "password",
  "token",
  "access_token",
  "refresh_token",
  "apiKey",
  "api_key",
  "secret",
  "jwt",
  "authorization",
]);

function sanitizeLogData(obj: unknown): unknown {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeLogData);

  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (REDACTED_KEYS.has(key.toLowerCase()) || key.toLowerCase().includes("secret") || key.toLowerCase().includes("token")) {
      clean[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      clean[key] = sanitizeLogData(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

function writeLog(level: LogLevel, payload: LogPayload) {
  const isDev = typeof process !== "undefined" && (process.env as Record<string, string | undefined>)?.["NODE_ENV"] === "development";
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    level: level.toUpperCase(),
    message: payload.message,
    projectId: payload.projectId,
    userId: payload.userId,
    context: payload.context ? sanitizeLogData(payload.context) : undefined,
    error:
      payload.error instanceof Error
        ? {
            name: payload.error.name,
            message: payload.error.message,
            stack: isDev ? payload.error.stack : undefined,
          }
        : payload.error,
  };

  const output = `[${entry.timestamp}] [${entry.level}] ${entry.message}`;
  if (level === "error") {
    console.error(output, entry.context || "", entry.error || "");
  } else if (level === "warn") {
    console.warn(output, entry.context || "");
  } else {
    console.log(output, entry.context || "");
  }
}

export const logger = {
  info: (message: string, context?: Record<string, unknown>, projectId?: string, userId?: string) =>
    writeLog("info", { message, context, projectId, userId }),
  warn: (message: string, context?: Record<string, unknown>, projectId?: string, userId?: string) =>
    writeLog("warn", { message, context, projectId, userId }),
  error: (message: string, error?: unknown, context?: Record<string, unknown>, projectId?: string, userId?: string) =>
    writeLog("error", { message, error, context, projectId, userId }),
  debug: (message: string, context?: Record<string, unknown>) => {
    const isDev = typeof process !== "undefined" && (process.env as Record<string, string | undefined>)?.["NODE_ENV"] === "development";
    if (isDev) {
      writeLog("debug", { message, context });
    }
  },
};
