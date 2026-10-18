import { authenticateRequest } from "@/modules/auth/guard";
import { errorResponse, jsonResponse } from "@/lib/errors/api-error";

export async function GET(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    const context = await authenticateRequest(req);
    return jsonResponse(
      {
        user: context.user,
      },
      200,
      requestId
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
