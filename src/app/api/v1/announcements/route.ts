import { requireApproved } from "@/modules/auth/guard";
import { listAnnouncements, createAnnouncement } from "@/modules/notifications/notifications.service";
import { errorResponse, jsonResponse } from "@/lib/errors/api-error";
import { z } from "zod";

const createAnnouncementSchema = z.object({
  courseId: z.string().uuid().optional(),
  title: z.string().min(3).max(255),
  content: z.string().min(5),
});

export async function GET(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    const context = await requireApproved(req);
    const url = new URL(req.url);
    const courseId = url.searchParams.get("courseId") || undefined;
    const limit = url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!, 10) : undefined;
    const offset = url.searchParams.get("offset") ? parseInt(url.searchParams.get("offset")!, 10) : undefined;

    const result = await listAnnouncements(context, { courseId, limit, offset });
    return jsonResponse(result, 200, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    const context = await requireApproved(req);

    const body = await req.json();
    const parsed = createAnnouncementSchema.parse(body);

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    const userAgent = req.headers.get("user-agent");

    const announcement = await createAnnouncement(parsed, context, {
      requestId,
      ipAddress,
      userAgent,
    });

    return jsonResponse(announcement, 201, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
