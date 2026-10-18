import { requireApproved } from "@/modules/auth/guard";
import { markNotificationAsRead } from "@/modules/notifications/notifications.service";
import { errorResponse, jsonResponse } from "@/lib/errors/api-error";

export async function PATCH(
  req: Request,
  props: { params: Promise<{ notificationId: string }> }
) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requireApproved(req);
    const updated = await markNotificationAsRead(params.notificationId, context);
    return jsonResponse(
      {
        message: "Notification marked as read.",
        notification: updated,
      },
      200,
      requestId
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
