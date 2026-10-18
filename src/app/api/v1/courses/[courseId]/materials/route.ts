import { requireApproved } from "@/modules/auth/guard";
import { listCourseMaterials, uploadMaterial } from "@/modules/materials/materials.service";
import { errorResponse, jsonResponse, BadRequestError } from "@/lib/errors/api-error";

export async function GET(req: Request, props: { params: Promise<{ courseId: string }> }) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requireApproved(req);
    const materials = await listCourseMaterials(params.courseId, context);
    return jsonResponse(materials, 200, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function POST(req: Request, props: { params: Promise<{ courseId: string }> }) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requireApproved(req);

    // Support multipart/form-data upload or JSON payload with base64 buffer
    const contentTypeHeader = req.headers.get("content-type") || "";
    let title: string;
    let description: string | undefined;
    let fileName: string;
    let contentType: string;
    let fileBuffer: Buffer;

    if (contentTypeHeader.includes("multipart/form-data")) {
      const formData = await req.formData();
      title = (formData.get("title") as string) || "";
      description = (formData.get("description") as string) || undefined;
      const file = formData.get("file") as File | null;
      if (!file || !title) {
        throw new BadRequestError("Missing required file or title in form data");
      }
      fileName = file.name;
      contentType = file.type || "application/octet-stream";
      fileBuffer = Buffer.from(await file.arrayBuffer());
    } else {
      const body = await req.json();
      if (!body.title || !body.fileName || !body.fileContentBase64) {
        throw new BadRequestError("Missing title, fileName, or fileContentBase64 in JSON payload");
      }
      title = body.title;
      description = body.description;
      fileName = body.fileName;
      contentType = body.contentType || "application/octet-stream";
      fileBuffer = Buffer.from(body.fileContentBase64, "base64");
    }

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    const userAgent = req.headers.get("user-agent");

    const material = await uploadMaterial({
      courseId: params.courseId,
      title,
      description,
      fileName,
      contentType,
      fileBuffer,
      context,
      requestId,
      ipAddress,
      userAgent,
    });

    return jsonResponse(
      {
        ...material,
        fileSizeBytes: Number(material.fileSizeBytes),
      },
      201,
      requestId
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
