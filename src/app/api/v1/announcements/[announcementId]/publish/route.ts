import { requireApproved } from "@/modules/auth/guard";
import { publishAnnouncement } from "@/modules/notifications/notifications.service";
import { errorResponse, jsonResponse } from "@/lib/errors/api-error";

export async function POST(req: Request, props: { params: Promise<{ announcementId: string }> }) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requireApproved(req);
    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    const userAgent = req.headers.get("user-agent");

    const updated = await publishAnnouncement(params.announcementId, context, {
      requestId,
      ipAddress,
      userAgent,
    });

    return jsonResponse(
      {
        message: "Announcement published successfully and member notifications sent.",
        announcement: updated,
      },
      200,
      requestId
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
