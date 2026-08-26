/**
 * Enterprise Structured JSON Logger
 * Formats all application logs with correlation IDs, timestamps,
 * log levels, and sanitized metadata for centralized ingestion.
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "security";

export interface LogContext {
  correlationId?: string;
  userId?: string | null;
  projectId?: string | null;
  route?: string;
  durationMs?: number;
  [key: string]: unknown;
}

export interface StructuredLogRecord {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext | undefined;
  error?: {
    name: string;
    message: string;
    stack?: string | undefined;
  } | undefined;
}

class StructuredLogger {
  private generateCorrelationId(): string {
    return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  private write(level: LogLevel, message: string, context?: LogContext, err?: unknown): void {
    const record: StructuredLogRecord = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: {
        correlationId: context?.correlationId ?? this.generateCorrelationId(),
        ...context,
      },
    };

    if (err instanceof Error) {
      record.error = {
        name: err.name,
        message: err.message,
        stack: err.stack ?? undefined,
      };
    } else if (err) {
      record.error = {
        name: "UnknownError",
        message: String(err),
      };
    }

    if (process.env["NODE_ENV"] !== "test") {
      const output = JSON.stringify(record);
      switch (level) {
        case "error":
        case "security":
          console.error(output);
          break;
        case "warn":
          console.warn(output);
          break;
        default:
          console.log(output);
          break;
      }
    }
  }

  debug(message: string, context?: LogContext): void {
    this.write("debug", message, context);
  }

  info(message: string, context?: LogContext): void {
    this.write("info", message, context);
  }

  warn(message: string, context?: LogContext, err?: unknown): void {
    this.write("warn", message, context, err);
  }

  error(message: string, err?: unknown, context?: LogContext): void {
    this.write("error", message, context, err);
  }

  security(message: string, context?: LogContext): void {
    this.write("security", message, context);
  }
}

export const logger = new StructuredLogger();
