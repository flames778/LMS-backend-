const REDACTED_KEYS = new Set([
  "password",
  "secret",
  "token",
  "authorization",
  "cookie",
  "client_secret",
  "session",
  "answers",
  "correctanswers",
  "correct_answers",
]);

function sanitize(obj: unknown, depth = 0): unknown {
  if (depth > 6) return "[Truncated]";
  if (!obj || typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitize(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (REDACTED_KEYS.has(key.toLowerCase())) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = sanitize(value, depth + 1);
    }
  }
  return result;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export const logger = {
  log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(meta ? { meta: sanitize(meta) } : {}),
    };
    const serialized = JSON.stringify(logEntry);
    if (level === "error") {
      console.error(serialized);
    } else if (level === "warn") {
      console.warn(serialized);
    } else {
      console.log(serialized);
    }
  },

  info(message: string, meta?: Record<string, unknown>) {
    this.log("info", message, meta);
  },

  warn(message: string, meta?: Record<string, unknown>) {
    this.log("warn", message, meta);
  },

  error(message: string, meta?: Record<string, unknown>) {
    this.log("error", message, meta);
  },

  debug(message: string, meta?: Record<string, unknown>) {
    if (process.env.LOG_LEVEL === "debug" || process.env.NODE_ENV === "development") {
      this.log("debug", message, meta);
    }
  },
};
