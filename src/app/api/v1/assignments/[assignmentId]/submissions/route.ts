import { requireApproved } from "@/modules/auth/guard";
import {
  submitAssignment,
  listAssignmentSubmissions,
} from "@/modules/assignments/assignments.service";
import { errorResponse, jsonResponse, BadRequestError } from "@/lib/errors/api-error";

export async function GET(req: Request, props: { params: Promise<{ assignmentId: string }> }) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requireApproved(req);
    const submissions = await listAssignmentSubmissions(params.assignmentId, context);

    const serialized = submissions.map((s) => ({
      ...s,
      fileSizeBytes: Number(s.fileSizeBytes),
    }));

    return jsonResponse(serialized, 200, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function POST(req: Request, props: { params: Promise<{ assignmentId: string }> }) {
  const params = await props.params;
  const requestId = crypto.randomUUID();
  try {
    const context = await requireApproved(req);

    const contentTypeHeader = req.headers.get("content-type") || "";
    let fileName: string;
    let contentType: string;
    let fileBuffer: Buffer;
    let submissionNotes: string | undefined;

    if (contentTypeHeader.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      submissionNotes = (formData.get("submissionNotes") as string) || undefined;
      if (!file) {
        throw new BadRequestError("Missing submission file");
      }
      fileName = file.name;
      contentType = file.type || "application/octet-stream";
      fileBuffer = Buffer.from(await file.arrayBuffer());
    } else {
      const body = await req.json();
      if (!body.fileName || !body.fileContentBase64) {
        throw new BadRequestError("Missing fileName or fileContentBase64 in JSON payload");
      }
      fileName = body.fileName;
      contentType = body.contentType || "application/octet-stream";
      fileBuffer = Buffer.from(body.fileContentBase64, "base64");
      submissionNotes = body.submissionNotes;
    }

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
    const userAgent = req.headers.get("user-agent");

    const result = await submitAssignment({
      assignmentId: params.assignmentId,
      fileName,
      contentType,
      fileBuffer,
      submissionNotes,
      context,
      requestId,
      ipAddress,
      userAgent,
    });

    return jsonResponse(result, 201, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
