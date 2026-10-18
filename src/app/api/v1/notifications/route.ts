import { requireApproved } from "@/modules/auth/guard";
import { listUserNotifications } from "@/modules/notifications/notifications.service";
import { errorResponse, jsonResponse } from "@/lib/errors/api-error";

export async function GET(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    const context = await requireApproved(req);
    const url = new URL(req.url);
    const limit = url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!, 10) : undefined;
    const offset = url.searchParams.get("offset") ? parseInt(url.searchParams.get("offset")!, 10) : undefined;

    const result = await listUserNotifications(context, { limit, offset });
    return jsonResponse(result, 200, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
