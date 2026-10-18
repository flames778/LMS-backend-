import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/prisma";

export async function GET() {
  try {
    // Verify database connectivity safely with a lightweight query
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      status: "ready",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "unhealthy",
        database: "disconnected",
        timestamp: new Date().toISOString(),
        error: "Database connectivity check failed",
      },
      { status: 503 }
    );
  }
}
