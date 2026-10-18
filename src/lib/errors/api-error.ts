import { NextResponse } from "next/server";

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, code = "INTERNAL_SERVER_ERROR", details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Invalid request payload or parameters", details?: unknown) {
    super(message, 400, "BAD_REQUEST", details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required or session expired") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Requested resource not found") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict with current resource state") {
    super(message, 409, "CONFLICT");
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(message = "Validation failed", details?: unknown) {
    super(message, 422, "UNPROCESSABLE_ENTITY", details);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = "Uploaded file exceeds maximum allowed size") {
    super(message, 413, "PAYLOAD_TOO_LARGE");
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = "Rate limit exceeded. Please try again later.") {
    super(message, 429, "TOO_MANY_REQUESTS");
  }
}

export function jsonResponse<T>(data: T, status = 200, requestId?: string) {
  const reqId = requestId || crypto.randomUUID();
  return NextResponse.json(
    {
      data,
      requestId: reqId,
    },
    { status }
  );
}

export function errorResponse(error: unknown, requestId?: string) {
  const reqId = requestId || crypto.randomUUID();

  if (error instanceof AppError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
        requestId: reqId,
      },
      { status: error.statusCode }
    );
  }

  // Fallback for unhandled unexpected exceptions
  const isDev = process.env.NODE_ENV !== "production";
  const message = isDev && error instanceof Error ? error.message : "An unexpected server error occurred";

  console.error(`[UnhandledError:${reqId}]`, error);

  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message,
      },
      requestId: reqId,
    },
    { status: 500 }
  );
}
