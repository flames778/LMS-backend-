import { requireApproved } from "@/modules/auth/guard";
import { publishMaterial } from "@/modules/materials/materials.service";
import { errorResponse, jsonResponse } from "@/lib/errors/api-error";

export async function POST(req: Request, props: { params: Promise<{ materialId: string }> }) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requireApproved(req);
    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    const userAgent = req.headers.get("user-agent");

    const updated = await publishMaterial(params.materialId, context, {
      requestId,
      ipAddress,
      userAgent,
    });

    return jsonResponse(
      {
        message: "Material published successfully.",
        material: {
          ...updated,
          fileSizeBytes: Number(updated.fileSizeBytes),
        },
      },
      200,
      requestId
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
